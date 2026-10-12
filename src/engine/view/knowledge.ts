/**
 * Knowledge tracking (engine-design § Views and hidden information): which
 * cards in decks and hands each side can identify. A card in a public zone
 * is known to both sides and a card in a hand to the side holding it; beyond
 * that, `state.knownTo[side]` lists the hidden cards `side` has learned:
 *
 * - a card keeps every side that could see it as it moves, so a card
 *   returned to a hand from play, or put into a deck from a hand, stays
 *   known to whoever watched it move;
 * - a revealed card becomes known to both sides;
 * - filtered draws and ordered deck placements retain only inferable
 *   positions, using viewer-known slots and public removal bounds; the
 *   filtered-draw primitive proves its ability's literal filter while this
 *   module owns forgetting (`forgetFilteredDrawPositions`, `forgetDeckPositions`,
 *   and `randomDeckRemovalSettler` as anonymous removals leave a deck);
 * - a shuffled deck drops out of both sides' knowledge (`forgetShuffledDeck`);
 * - a `privateTo` prompt shows its cards to its chooser only, and the other
 *   side loses track of those still in a deck, whose order the chooser may
 *   change;
 * - looking at the opponent's hand (`takeFromAmong(opponentHand())`) shows
 *   every card in it to the looker only; both private kinds go through
 *   `StepContext.disclose`, which calls `showPrivately`;
 * - published zone visibility and public reveals outlive an error or cancel
 *   while the same printed identity remains tracked at the published prompt
 *   (`keepPublishedKnowledge`); recovery into a committed deck and
 *   private-only exposure keep their strict location guards.
 *
 * Decks start unknown to both sides; the opening shuffle happens before any
 * card is known.
 *
 * Every production write into a state's `knownTo` goes through a helper
 * here; only state creation, cloning and determinization build it whole
 * elsewhere (`dreamtides/no-direct-knowledge-writes`).
 */
import type { AbilitySource, EffectId, InstanceId, Side } from "../state/ids";
import { SIDES } from "../state/ids";
import { copyJson } from "../state/clone";
import type { BattleState, CardInstance, FixedCardChange, FloatingEffect, RememberedEffect } from "../state/types";

/**
 * Refresh only records the viewer can identify now. First-observation order is
 * the order visible instances appear in its view; hidden positions never order
 * these records. A blind card retains its last observed values.
 */
export function rememberKnownCards(state: BattleState): void {
  const records = state.rememberedCards ??= { player: [], enemy: [] };
  for (const viewer of SIDES) {
    if (records[viewer].some((record) => state.instances[record.instance] === undefined)) {
      records[viewer] = records[viewer].filter((record) => state.instances[record.instance] !== undefined);
    }
    const positions = new Map(records[viewer].map((record, index) => [record.instance, index]));
    for (const instance of Object.values(state.instances)) {
      if (!knows(state, instance, viewer)) continue;
      const index = positions.get(instance.id);
      const previous = index === undefined ? undefined : records[viewer][index];
      const effects = state.floating.flatMap((effect) => {
        if (!isFixedEffect(effect) || effect.change.instance !== instance.id) return [];
        if (seesSource(state, effect.source, viewer)) return [effect];
        // Source departure cannot erase a fixed change already observed.
        return previous?.effects.filter((known) => known.id === effect.id) ?? [];
      });
      const record = { instance: instance.id, owner: instance.owner, printing: instance.printing,
        variant: instance.variant, status: instance.status, effects };
      if (JSON.stringify(previous) === JSON.stringify(record)) continue;
      const snapshot = copyJson(record);
      if (index === undefined) records[viewer].push(snapshot);
      else records[viewer][index] = snapshot;
    }
  }
}

/**
 * Whether each targeted continuous change kind is fixed: its resolved semantics
 * do not read its source. Keyed by every `FixedCardChange` kind, so a new
 * targeted kind is a type error here until it is classified.
 */
const FIXED_CHANGE_KINDS: Readonly<Record<FixedCardChange["kind"], boolean>> = {
  allTypes: true,
  subtype: true,
  keyword: true,
  abilities: false,
  baseSpark: true,
  spark: true,
  cardCost: true,
  playFrom: true,
  cannotPlay: true,
};

/** Fixed continuous changes whose resolved semantics do not read their source. */
export function isFixedChange(kind: unknown): kind is FixedCardChange["kind"] {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(FIXED_CHANGE_KINDS, kind) && FIXED_CHANGE_KINDS[kind as FixedCardChange["kind"]];
}

/** Narrows observed fixed permanent effects to the snapshot's data model. */
export function isFixedEffect(effect: FloatingEffect): effect is RememberedEffect {
  return effect.expiry.at === "never" && "instance" in effect.change && isFixedChange(effect.change.kind);
}

/** The fixed permanent record this viewer actually observed, independent of its source's current visibility. */
export function observedFixedEffect(state: BattleState, viewer: Side, id: EffectId): RememberedEffect | undefined {
  return state.rememberedCards?.[viewer].flatMap((record) => record.effects).find((effect) => effect.id === id);
}

/** Whether `side` can identify `instance` where it is now. */
export function knows(state: BattleState, instance: CardInstance, side: Side): boolean {
  switch (instance.zone) {
    case "stack":
    case "play":
    case "void":
    case "banished":
      return true;
    case "hand":
      return instance.controller === side || state.knownTo[side].includes(instance.id);
    case "deck":
      return state.knownTo[side].includes(instance.id);
  }
}

/** Whether `side` can identify the card `id` in `state`: it is still in the battle and `side` knows it where it is. */
export function identifies(state: BattleState, id: InstanceId, side: Side): boolean {
  const instance = state.instances[id];
  return instance !== undefined && knows(state, instance, side);
}

/** The sides that cannot identify the card `id` in `state`. */
export function sidesBlindTo(state: BattleState, id: InstanceId): Side[] {
  return SIDES.filter((side) => !identifies(state, id, side));
}

/**
 * Whether `viewer` sees the subject of a queued trigger in `state`: it could
 * identify the subject as the ability triggered (`subjectHiddenFrom`) and
 * can identify it now. A card that was hidden then stays hidden as that
 * trigger's subject even once it is public, so a trigger never tells which
 * card a hidden draw or discard concerned.
 */
export function seesSubject(
  state: BattleState,
  trigger: { readonly subject: InstanceId | null; readonly subjectHiddenFrom?: readonly Side[] },
  viewer: Side,
): boolean {
  return trigger.subject !== null && trigger.subjectHiddenFrom?.includes(viewer) !== true && identifies(state, trigger.subject, viewer);
}

/**
 * Whether `viewer` sees an ability's `source` in `state`, as the view shows
 * a queued trigger's, a floating effect's, or a payable effect's source: an
 * avatar or dreamsign always, a card when `viewer` can identify it there
 * (`identifies`). A card in a deck its holder has not learned, or one that
 * has left the battle, is hidden from that holder too.
 */
export function seesSource(state: BattleState, source: AbilitySource, viewer: Side): boolean {
  return typeof source !== "string" || identifies(state, source, viewer);
}

/** Whether `side` sees `instance` without a `knownTo` entry: it is in a public zone or in `side`'s hand. */
function seenByZone(instance: CardInstance, side: Side): boolean {
  return instance.zone === "hand" ? instance.controller === side : instance.zone !== "deck";
}

function learn(state: BattleState, side: Side, instance: CardInstance): void {
  if (!seenByZone(instance, side) && !state.knownTo[side].includes(instance.id)) {
    state.knownTo[side].push(instance.id);
  }
}

function unlearn(state: BattleState, side: Side, id: InstanceId): void {
  if (state.knownTo[side].includes(id)) {
    state.knownTo[side] = state.knownTo[side].filter((known) => known !== id);
  }
}

/**
 * Called as an instance leaves its zone: drops its `knownTo` entries and
 * returns the sides that could see it, for `settle` once it has moved.
 */
export function departKnowledge(state: BattleState, instance: CardInstance): Side[] {
  rememberKnownCards(state);
  const seers = SIDES.filter((side) => knows(state, instance, side));
  for (const side of SIDES) unlearn(state, side, instance.id);
  return seers;
}

/** Called once an instance has entered its new zone: every side that watched it move still knows it. */
export function settleKnowledge(state: BattleState, instance: CardInstance, seers: readonly Side[]): void {
  for (const side of seers) learn(state, side, instance);
}

/** Whether anonymous removals have one possible count before a known card. */
function removalsBeforeAreForced(removed: number, preceding: number, following: number): boolean {
  return Math.max(0, removed - following) === Math.min(preceding, removed);
}

/**
 * Before a filtered draw, forget positions ambiguous under one anonymous
 * removal. The caller proves a public exclusive removal bound per viewer:
 * the first known match, the whole deck for an unknown criterion, or zero
 * for an ordinary top draw. Only unidentified slots before that bound are
 * possible. A known selected card supplies an exact removal; an unknown
 * selected card's actual position supplies no evidence. Empty candidate
 * sets retain knowledge. Movement and learning the drawn card happen later.
 */
export function forgetFilteredDrawPositions(
  state: BattleState,
  deck: readonly InstanceId[],
  drawn: InstanceId,
  removalLimit: (viewer: Side, known: ReadonlySet<InstanceId>) => number,
): void {
  rememberKnownCards(state);
  for (const viewer of SIDES) {
    const known = new Set(state.knownTo[viewer]);
    if (known.has(drawn)) continue;
    const possible = deck.slice(0, removalLimit(viewer, known)).flatMap((id, index) => known.has(id) ? [] : [index]);
    if (possible.length === 0) continue;
    const ambiguous = new Set(deck.filter((id, index) => known.has(id) && !removalsBeforeAreForced(
      1, possible.filter((place) => place < index).length, possible.filter((place) => place > index).length,
    )));
    state.knownTo[viewer] = state.knownTo[viewer].filter((id) => !ambiguous.has(id));
  }
}

/** Public exclusive prefix bounds; an absent owner/viewer entry permits the whole deck. */
export type DeckRemovalBounds = Readonly<Partial<Record<Side, Readonly<Partial<Record<Side, number>>>>>>;

/** The viewers, per deck owner, whose view of a removal's order shows nothing of its cards' deck order. */
export type UnorderedDeckRemovals = Readonly<Partial<Record<Side, readonly Side[]>>>;

/**
 * Before an ordered, unshuffled placement, forget only deck positions its
 * public movement cannot determine. `cards` has original source-zone order;
 * valid deck cards enter their own deck without a created/reclaimed replacement.
 *
 * Known movers keep their identity: the placement's ordered slots and count
 * determine their new positions independently of unidentified mover origins.
 * Their original positions and public slots also bound how many anonymous
 * cards were removed between adjacent known movers. Within each such interval,
 * U removals from P anonymous slots before a known nonmover and Q after it
 * remove between max(0, U-Q) and min(P, U) before it. Retain it exactly when
 * those bounds agree. Unidentified movers' actual original indices supply
 * no evidence. Original decks and both viewers' knowledge are captured before
 * any forgetting or ordinary zone movement. For a viewer `unordered` names,
 * the movers' order is not their deck order, so known movers bound no
 * interval: the anonymous removals may have come from any possible slot.
 */
export function forgetDeckPositions(
  state: BattleState,
  cards: readonly InstanceId[],
  bounds: DeckRemovalBounds = {},
  unordered: UnorderedDeckRemovals = {},
): void {
  rememberKnownCards(state);
  const decks = SIDES.map((owner) => [...state.sides[owner].deck]);
  const viewers = SIDES.map((viewer) => ({ viewer, known: new Set(state.knownTo[viewer]), forgotten: new Set<InstanceId>() }));
  for (const [ownerIndex, deck] of decks.entries()) {
    const movers = cards.filter((id) => deck.includes(id));
    if (movers.length === 0) continue;
    const moving = new Set(movers);
    for (const { viewer, known, forgotten } of viewers) {
      const possible = new Set(deck.slice(0, bounds[SIDES[ownerIndex]]?.[viewer] ?? deck.length).filter((id) => !known.has(id)));
      const ordered = unordered[SIDES[ownerIndex]]?.includes(viewer) !== true;
      const anchors = [
        { original: -1, placed: -1 },
        ...(ordered ? deck.flatMap((id, original) => known.has(id) && moving.has(id) ? [{ original, placed: movers.indexOf(id) }] : []) : []),
        { original: deck.length, placed: movers.length },
      ];
      for (let index = 1; index < anchors.length; index++) {
        const before = anchors[index - 1];
        const after = anchors[index];
        const interval = deck.slice(before.original + 1, after.original);
        const anonymous = interval.filter((id) => possible.has(id)).length;
        const removed = after.placed - before.placed - 1 - interval.filter((id) => known.has(id) && moving.has(id)).length;
        let preceding = 0;
        for (const id of interval) {
          if (!known.has(id)) {
            if (possible.has(id)) preceding += 1;
          } else if (!moving.has(id) && !removalsBeforeAreForced(removed, preceding, anonymous - preceding)) {
            forgotten.add(id);
          }
        }
      }
    }
  }
  for (const { viewer, forgotten } of viewers) {
    state.knownTo[viewer] = state.knownTo[viewer].filter((id) => !forgotten.has(id));
  }
}

/** As a deck is shuffled, both viewers lose track of every card in it: no place in it is inferable. */
export function forgetShuffledDeck(state: BattleState, deck: readonly InstanceId[]): void {
  rememberKnownCards(state);
  for (const viewer of SIDES) {
    state.knownTo[viewer] = state.knownTo[viewer].filter((id) => !deck.includes(id));
  }
}

function sameIds(a: readonly InstanceId[], b: readonly InstanceId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Deck knowledge while cards leave anonymous deck positions, unshuffled
 * (RD-hv-umm2.83-1): each viewer sees the cards leave, in deck order, but
 * not which unseen places they left. Captures both decks and both viewers'
 * knowledge before any pick and returns a settler, which the caller runs
 * after each removal and before anything observes the state, prompts
 * included (`StepContext.settlingKnowledge`). Optional captured public bounds
 * restrict possible anonymous origins to a prefix for each owner/viewer;
 * absent bounds permit the whole deck. A viewer `unordered` names sees the
 * cards leave in an order that shows nothing of their deck order, as a
 * banishment's references name them. Each run measures the cards
 * that have left each captured deck so far, in its order, and has each
 * viewer lose track of the known cards whose places those removals leave
 * open (`forgetDeckPositions` over the captured decks), so no presented
 * state places a known card where it shows which slots the picks took.
 *
 * A later removal can determine a place an earlier one left open; the
 * viewer then knows the card again, so once the picks are done each viewer
 * knows what the whole removal determines. A card is known again only
 * while it sits where it was captured and nothing but the removals has
 * changed the decks or either viewer's knowledge since the last run;
 * otherwise what this settler forgot stays forgotten.
 */
export function randomDeckRemovalSettler(
  state: BattleState,
  bounds: DeckRemovalBounds = {},
  unordered: UnorderedDeckRemovals = {},
): () => void {
  rememberKnownCards(state);
  const decks = { player: [...state.sides.player.deck], enemy: [...state.sides.enemy.deck] };
  const knew = { player: [...state.knownTo.player], enemy: [...state.knownTo.enemy] };
  const entered = new Map([...decks.player, ...decks.enemy].map((id) => [id, state.instances[id]?.enteredZoneAt]));
  const withheld = { player: new Set<InstanceId>(), enemy: new Set<InstanceId>() };
  let settled = knew;
  let removals = "";
  let undisturbed = true;
  return () => {
    const left = SIDES.flatMap((owner) => decks[owner].filter((id) => !state.sides[owner].deck.includes(id)));
    const gone = new Set(left);
    const remaining = (ids: readonly InstanceId[]) => ids.filter((id) => !gone.has(id));
    undisturbed &&= SIDES.every((viewer) => sameIds(remaining(state.knownTo[viewer]), remaining(settled[viewer])));
    const key = left.join(" ");
    if (key !== removals) {
      removals = key;
      const intact = undisturbed && SIDES.every((owner) => sameIds(state.sides[owner].deck, remaining(decks[owner])));
      const measured: BattleState = {
        ...state,
        sides: { player: { ...state.sides.player, deck: decks.player }, enemy: { ...state.sides.enemy, deck: decks.enemy } },
        knownTo: { player: [...knew.player], enemy: [...knew.enemy] },
        rememberedCards: { player: [], enemy: [] },
      };
      forgetDeckPositions(measured, left, bounds, unordered);
      for (const viewer of SIDES) {
        const open = new Set(knew[viewer].filter((id) => !measured.knownTo[viewer].includes(id)));
        const known = state.knownTo[viewer];
        const forgetting = new Set(known.filter((id) => open.has(id) && !withheld[viewer].has(id)));
        const regained = intact
          ? [...withheld[viewer]].filter((id) => !open.has(id) && !gone.has(id) && state.instances[id]?.enteredZoneAt === entered.get(id))
          : [];
        for (const id of forgetting) withheld[viewer].add(id);
        for (const id of regained) withheld[viewer].delete(id);
        const keep = new Set([...known.filter((id) => !forgetting.has(id)), ...regained]);
        // Known-again cards return to their captured order, ahead of anything learned since.
        state.knownTo[viewer] = regained.length === 0
          ? known.filter((id) => keep.has(id))
          : [...knew[viewer].filter((id) => keep.has(id)), ...known.filter((id) => keep.has(id) && !knew[viewer].includes(id))];
      }
    }
    settled = { player: [...state.knownTo.player], enemy: [...state.knownTo.enemy] };
  };
}

/** Both sides learn the revealed cards. */
export function revealToBoth(state: BattleState, ids: readonly InstanceId[]): void {
  for (const id of ids) {
    const instance = state.instances[id];
    if (instance === undefined) continue;
    for (const side of SIDES) learn(state, side, instance);
  }
}

/**
 * A `privateTo` prompt, or a look at the opponent's hand, shows `ids` to
 * `side` only. The other side loses track of those in a deck: the chooser
 * may reorder them.
 */
export function showPrivately(state: BattleState, side: Side, ids: readonly InstanceId[]): void {
  rememberKnownCards(state);
  for (const id of ids) {
    const instance = state.instances[id];
    if (instance === undefined) continue;
    if (instance.zone === "deck") {
      for (const other of SIDES) if (other !== side) unlearn(state, other, id);
    }
    learn(state, side, instance);
  }
  rememberKnownCards(state);
}

/** Where `instance` sits in a deck of `state`, or -1 outside a deck. */
function deckPlace(state: BattleState, instance: CardInstance): number {
  return instance.zone === "deck" ? state.sides[instance.controller].deck.indexOf(instance.id) : -1;
}

/** Whether a card sits in `a` (as `inA`) exactly where it sits in `b` (as `inB`): zone, controller, last zone entry, and deck place. */
function sitsAlike(a: BattleState, inA: CardInstance, b: BattleState, inB: CardInstance): boolean {
  return inA.zone === inB.zone && inA.controller === inB.controller && inA.enteredZoneAt === inB.enteredZoneAt && deckPlace(a, inA) === deckPlace(b, inB);
}

/**
 * `committed` with the knowledge `disclosures` gave, as the fold keeps it
 * when it discards an in-flight step that has published a prompt
 * (engine-design § Decisions and prompts): `display` is the state that
 * prompt published, and each card a disclosure showed its side becomes
 * known to that side when the side still knows it in `display` and the
 * card sits in `committed` exactly where it sits in `display`. Nothing else
 * of the step carries over, and the other side's knowledge is untouched.
 * Returns `committed` itself when no card is added.
 */
export function keepDisclosures(
  committed: BattleState,
  display: BattleState,
  disclosures: readonly { readonly side: Side; readonly cards: readonly InstanceId[] }[],
): BattleState {
  let next: BattleState | null = null;
  for (const { side, cards } of disclosures) {
    for (const id of cards) {
      const before = committed.instances[id];
      const shown = display.instances[id];
      if (before === undefined || shown === undefined || !knows(display, shown, side)) continue;
      if (knows(next ?? committed, before, side)) continue;
      if (!sitsAlike(committed, before, display, shown)) continue;
      next ??= { ...committed, knownTo: { player: [...committed.knownTo.player], enemy: [...committed.knownTo.enemy] } };
      learn(next, side, before);
    }
  }
  return next ?? committed;
}

/** Transient identities exposed in a published step prefix, bounded by its physical instances. */
export type PublishedKnowledge = Record<Side, Map<InstanceId, Pick<CardInstance, "printing" | "variant">>>;

/** Exact printed identity, including the instance's copiable variant. */
function sameIdentity(a: Pick<CardInstance, "printing" | "variant">, b: Pick<CardInstance, "printing" | "variant">): boolean {
  const left = a.printing;
  const right = b.printing;
  let same: boolean;
  switch (left.kind) {
    case "card":
      same = right.kind === "card" && left.cardId === right.cardId;
      break;
    case "figment":
      same = right.kind === "figment" && left.figment === right.figment && left.spark === right.spark;
      break;
    case "figmentCopy":
      same = right.kind === "figmentCopy" && left.cardId === right.cardId && left.spark === right.spark;
      break;
  }
  return same && JSON.stringify(a.variant) === JSON.stringify(b.variant);
}

/**
 * Consumes one published event's state, or a prompt display, immediately:
 * remember zone-visible identities and the typed subjects of a public
 * reveal. Private knowledge alone is handled by `keepDisclosures`.
 */
export function capturePublicKnowledge(
  committed: BattleState,
  exposure: BattleState,
  side: Side,
  into: PublishedKnowledge,
  revealed: readonly InstanceId[] = [],
): void {
  for (const instance of Object.values(exposure.instances)) {
    const before = committed.instances[instance.id];
    if (before === undefined || knows(committed, before, side) || !sameIdentity(before, instance)) continue;
    if (!seenByZone(instance, side) && !revealed.includes(instance.id)) continue;
    into[side].set(instance.id, { printing: instance.printing, variant: instance.variant });
  }
}

/**
 * Keep only published identities still tracked at the last shown prompt.
 * The gameplay state rolls back; the matching card in it becomes known.
 * A created/ceased identity, a changed printing, or knowledge lost to a
 * blind shuffle supplies no identity for recovery.
 * A committed deck card also keeps its exact place: knowing it exposes
 * its deck index, which a transient move does not disclose.
 */
export function keepPublishedKnowledge(committed: BattleState, display: BattleState, exposures: PublishedKnowledge): BattleState {
  let next: BattleState | null = null;
  for (const side of SIDES) {
    for (const [id, identity] of exposures[side]) {
      const before = committed.instances[id];
      const shown = display.instances[id];
      if (before === undefined || shown === undefined || !sameIdentity(before, identity) || !sameIdentity(before, shown)) continue;
      if (!knows(display, shown, side) || knows(next ?? committed, before, side)) continue;
      if (before.zone === "deck" && !sitsAlike(committed, before, display, shown)) continue;
      next ??= { ...committed, knownTo: { player: [...committed.knownTo.player], enemy: [...committed.knownTo.enemy] } };
      learn(next, side, before);
    }
  }
  return next ?? committed;
}

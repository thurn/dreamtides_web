/**
 * Determinization (D22): a complete battle state consistent with what one
 * side knows, for search. The AI knows the board, both voids, revealed and
 * otherwise known cards, hand and deck sizes, and both decklists; it does
 * not know hand contents or deck order. A determinization deals every card
 * the view hides from the cards each decklist has left once the cards the
 * view shows are taken out, keeping every known card at its known position.
 *
 * It reads only the view, so states that look the same to the viewer give
 * the same determinization for the same random draws. What a view leaves
 * out is rebuilt as follows:
 *
 * - hidden cards are fresh instances numbered after every instance the view
 *   names, entering their zones at 0; anonymous observed descriptors restore
 *   persistent status and fixed changes after dealing;
 * - the view shows what a static ability working from a hand or a deck
 *   changes but not its card (RD-hv-umm2.53-2), so the deal is then
 *   reconciled with it: hidden cards with such abilities move between their
 *   side's hand and deck and are dated until every card the view shows has
 *   the characteristics it shows (`reconcile`), which also gives the
 *   viewer's cards the costs the view shows, and so the viewer its legal
 *   actions;
 * - a hidden card in a hand comes from its holder's decklist, else from the
 *   other side's, else it is a created copy of a holder's decklist entry;
 * - the battle seed is drawn from `random`, so later shuffles and Dreamwell
 *   cycles are sampled too, and the remaining Dreamwell cards are a fresh
 *   draw of that many cards from the Dreamwell catalog;
 * - each hidden captured member the view numbers is one dealt hidden card
 *   of its owner, printing, and variant, a different one per member
 *   (`standIns`);
 * - queued triggers whose source the viewer cannot see, floating effects the
 *   view omits, the opponent's knowledge, loop history, and the
 *   automatic-step count start empty;
 * - the loop on offer, and the repetition in progress, are the ones the view
 *   shows (`restoreLoop`), so the viewer's legal actions include the offer
 *   its view shows; a repetition runs on as the battle would when the view
 *   shows the loop's recording, and is refused when it withholds it;
 * - an effect a side may pay to end whose source the viewer cannot see
 *   names its controller's avatar as its source;
 * - combined disabling retains anonymous card sources and aggregate public
 *   suppression; its original conditions keep reading those cards as they move;
 * - a play permission whose source is hidden or ceased also uses its
 *   controller's avatar: its filter, named card, duration, and consumption
 *   are independent of its source identity.
 */
import { instanceCard, plainVariant, type EngineCatalog } from "../catalog";
import { Layers } from "../continuous/layers";
import { matchesFilter } from "../continuous/characteristics";
import { worksInZone } from "../dsl/abilities";
import { fixedEnergy } from "../dsl/energy";
import type { CardFilter, Speed, Trigger } from "../dsl/types";
import { triggerBody } from "../triggers/body";
import { loopSignature } from "../loops/signature";
import { emptyLoopTracker } from "../loops/types";
import { instanceOrigin, originAbilities } from "../rules/activation";
import { abilitiesDisabled } from "../rules/ability-disabling";
import { buildDreamwellDeck } from "../rules/dreamwell";
import { canonicalHash } from "../state/hash";
import { isFixedEffect } from "./knowledge";
import { freshStatus, variantOf } from "../state/create";
import type { AbilitySource, EffectId, InstanceId, Side } from "../state/ids";
import { battleSeed, opponent, SIDES } from "../state/ids";
import type { BattleState, CardInstance, DeckEntry, FloatingChange, FloatingEffect, PayableEffect, QueuedTrigger, SideState, RememberedEffect } from "../state/types";
import {
  characteristicsView,
  type BattleView,
  type CapturedCardView,
  type CharacteristicsView,
  type FloatingChangeView,
  type FloatingEffectView,
  type HiddenCapturedCardView,
  type HiddenCardDescriptor,
  type HiddenZoneView,
  type InstanceView,
} from "./view";

/** Each side's journey decklist, with each entry's variant (D39). */
export type Decklists = Readonly<Record<Side, readonly DeckEntry[]>>;

/** A deep copy of plain JSON data. */
function copy<T>(value: T): T {
  return structuredClone(value);
}

/** Fisher–Yates shuffle of a copy, drawing from `random`. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const swap = result[index];
    result[index] = result[other];
    result[other] = swap;
  }
  return result;
}

/** The highest `i<n>` or `e<n>` number named anywhere in `value`. */
function highest(value: unknown, prefix: "i" | "e"): number {
  let max = 0;
  for (const match of JSON.stringify(value).matchAll(new RegExp(`"${prefix}(\\d+)"`, "g"))) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

/** `entries` without one entry per visible card the side owns that came from its deck. */
function remaining(entries: readonly DeckEntry[], visible: readonly InstanceView[]): DeckEntry[] {
  const pool = [...entries];
  const take = (matches: (entry: DeckEntry) => boolean): boolean => {
    const index = pool.findIndex(matches);
    if (index < 0) return false;
    pool.splice(index, 1);
    return true;
  };
  for (const instance of visible) {
    const { printing } = instance;
    if (printing.kind !== "card" || instance.status.created) continue;
    const variant = canonicalHash(instance.variant);
    if (!take((entry) => entry.cardId === printing.cardId && canonicalHash(variantOf(entry)) === variant)) {
      take((entry) => entry.cardId === printing.cardId);
    }
  }
  return pool;
}

function instanceFromView(instance: InstanceView): CardInstance {
  const { characteristics: _characteristics, reclaimCovered: _reclaimCovered, ...rest } = copy(instance);
  return { ...rest, variant: { ...rest.variant }, status: { ...rest.status } };
}

/** A zone's list with each known card at its position and `null` for each hidden card. */
function slots(zone: HiddenZoneView): (InstanceId | null)[] {
  const result: (InstanceId | null)[] = Array.from({ length: zone.count }, () => null);
  for (const { id, index } of zone.known) result[index] = id;
  return result;
}

/**
 * Samples a complete battle state consistent with `view`, `decklists`, and
 * the knowledge the view reports, drawing every random choice from `random`.
 */
export function determinize(view: BattleView, decklists: Decklists, random: () => number, catalog: EngineCatalog): BattleState {
  const state = deal(view, decklists, random, catalog);
  reconcile(state, view, catalog);
  reconcileDisabling(state, view, catalog, random);
  restoreHiddenSubjectCosts(state, view, decklists, catalog, random);
  restoreLoop(state, view);
  return state;
}

/** Samples opaque values, keeping the viewer's original concealment rather than acquiring observations. */
function restoreHiddenSubjectCosts(state: BattleState, view: BattleView, decklists: Decklists, catalog: EngineCatalog, random: () => number): void {
  const sharedDraws = new Map<string, number>();
  const assignedDraws = new Map<Side, Set<InstanceId>>();
  const layers = new Layers(state, catalog);
  const visibleQueue = view.triggerQueue.filter(trigger => trigger.source !== null && trigger.origin !== null);
  const matches = (filter: CardFilter | undefined, card: Pick<CharacteristicsView, "cardType" | "subtype" | "allTypes" | "spark"> & { readonly speed: Speed }, cost: number) =>
    filter === undefined || matchesFilter({ ...card, cost }, filter);
  for (const [index, shown] of visibleQueue.entries()) {
    if (shown.subjectCostHidden !== true || shown.source === null || shown.origin === null) continue;
    const body = triggerBody(catalog, shown.origin, shown.ability, shown.node);
    const domains = (trigger: Trigger): { sides: readonly Side[]; filter?: CardFilter; key?: string }[] => {
      if (trigger.on === "either") return trigger.triggers.flatMap(domains);
      // Current matching can conceal draws and created discards in another hand. Self, play, board and void occasions expose their subject at matching.
      if (trigger.on !== "draw" && (trigger.on !== "discard" || trigger.self === true)) return [];
      const sides = "player" in trigger && (trigger.player === "you" || trigger.player === "opponent")
        ? [trigger.player === "you" ? shown.controller : opponent(shown.controller)] : SIDES;
      const viableSides = sides.filter(side => side !== view.viewer && (trigger.on !== "draw" || (view.turnLog.drawn[side] > 0 && (trigger.nth === undefined || trigger.nth <= view.turnLog.drawn[side]))));
      if (viableSides.length === 0) return [];
      return [{ sides: viableSides, ...("filter" in trigger ? { filter: trigger.filter } : {}),
        ...(trigger.on === "draw" && trigger.nth !== undefined && viableSides.length === 1 ? { key: `draw:${viableSides[0]}:${String(trigger.nth)}` } : {}) }];
    };
    const candidates = domains(body.trigger).flatMap<{ id: InstanceId | undefined; cost: number; key: string | undefined; side: Side }>(domain => {
      const compatible = Object.values(state.instances).filter(instance => {
        if (!domain.sides.includes(instance.controller)) return false;
        const printed = instanceCard(catalog, instance);
        return matches(domain.filter, { ...layers.of(instance.id), speed: printed.speed }, fixedEnergy(printed.costs));
      });
      // Current hidden holdings constrain the latent subject; public records remain possible after it moved.
      const hidden = compatible.filter(instance => instance.zone === "hand" || instance.zone === "deck");
      const live = (hidden.length === 0 ? compatible : hidden).map(instance => ({ id: instance.id, cost: fixedEnergy(instanceCard(catalog, instance).costs), key: domain.key, side: domain.sides[0] }));
      if (live.length > 0) return live;
      // Public copiable tuples constrain a ceased copy without identifying its historical original.
      const historical = [
        ...catalog.cardDefinitions,
        ...Object.values(view.instances).filter(instance => instance.printing.kind === "card").map(instance => instanceCard(catalog, instance)),
        ...SIDES.flatMap(side => decklists[side].map(entry => instanceCard(catalog, { printing: { kind: "card", cardId: entry.cardId }, variant: variantOf(entry) }))),
      ];
      return historical.filter(card => matches(domain.filter, { ...card, allTypes: false, spark: card.spark === "x" ? 0 : card.spark }, fixedEnergy(card.costs)))
        .map(card => ({ id: undefined, cost: fixedEnergy(card.costs), key: domain.key, side: domain.sides[0] }));
    });
    const existing = candidates.find(candidate => candidate.key !== undefined && sharedDraws.has(candidate.key));
    const unused = candidates.filter(candidate => candidate.key === undefined || candidate.id === undefined || !assignedDraws.get(candidate.side)?.has(candidate.id));
    // Different public draw ordinals allocate distinct sampled records while available. A reused or departed historical card has no recoverable alias.
    const available = unused.length === 0 ? candidates : unused;
    const selected = existing ?? available[Math.floor(random() * available.length)];
    if (selected === undefined) throw new Error("Cannot determinize hidden subject cost without a compatible sampled card");
    const cost = selected.key === undefined ? selected.cost : sharedDraws.get(selected.key) ?? selected.cost;
    if (selected.key !== undefined && !sharedDraws.has(selected.key)) {
      sharedDraws.set(selected.key, cost);
      const assigned = assignedDraws.get(selected.side) ?? new Set<InstanceId>();
      if (selected.id !== undefined) assigned.add(selected.id);
      assignedDraws.set(selected.side, assigned);
    }
    state.triggerQueue[index] = { ...state.triggerQueue[index], lastKnownSubjectCost: cost, subjectHiddenFrom: [view.viewer] };
  }
}

/**
 * Puts the loop the view shows on offer in the dealt state, with the
 * repetition in progress. A loop is on offer only at its checkpoint, so its
 * signature is the state's own, and it repeats its recording, which the view
 * shows the side that may repeat it (`LoopView.recording`). Without one the
 * recording is unknown (`null`): the loop is on offer, but repeating it is
 * refused (`UnknownLoopRecording`), so search scores accepting it as
 * unknown. The next loop number follows the loop's. The history the
 * tracker detects loops from and the mandatory-cycle mark start empty, since
 * both hash cards the viewer cannot see, so detection begins at the sample.
 */
function restoreLoop(state: BattleState, view: BattleView): void {
  const { loop } = view;
  if (loop === null) return;
  const actions = loop.recording === undefined ? null : copy(loop.recording);
  state.loops.candidate = { id: loop.id, side: loop.side, signature: loopSignature(state), actions };
  state.loops.run = loop.run === null ? null : { loop: loop.id, remaining: loop.run.remaining, iterations: loop.run.iterations };
  state.loops.nextLoop = Number(loop.id.slice(1)) + 1;
}

/** A floating change from its view, with each captured card resolved by `captured`. */
function floatingChange(change: FloatingChangeView, captured: (cards: readonly CapturedCardView[]) => InstanceId[]): FloatingChange {
  if (change.kind !== "trigger") return copy(change);
  const { captured: cards, ...rest } = change;
  return cards === undefined ? copy(rest) : { ...copy(rest), captured: captured(cards) };
}

/**
 * Resolves the captured cards a view shows: an identified card is itself,
 * and a hidden one (`HiddenCapturedCardView`) is the dealt hidden card its
 * `member` stands for, the same in every record. Each member gets a
 * different dealt hidden card with its owner, of its printing and variant
 * when one is left, else of its printing, picked at random from `random`; one with no dealt hidden card of its
 * owner left is left out. It draws from `random` only for hidden captured
 * cards.
 */
function standIns(
  view: BattleView,
  sides: Readonly<Record<Side, SideState>>,
  instances: Readonly<Record<InstanceId, CardInstance>>,
  random: () => number,
  remembered: ReadonlyMap<number, InstanceId>,
): (cards: readonly CapturedCardView[]) => InstanceId[] {
  const hidden = SIDES.flatMap((side) => [...sides[side].deck, ...sides[side].hand]).filter((id) => !(id in view.instances));
  const chosen = new Map<number, InstanceId | null>(remembered);
  const taken = new Set<InstanceId>(remembered.values());
  const pick = (card: HiddenCapturedCardView): InstanceId | null => {
    const owned = hidden.filter((id) => !taken.has(id) && instances[id].owner === card.owner);
    const printed = owned.filter((id) => canonicalHash(instances[id].printing) === canonicalHash(card.printing));
    const varied = printed.filter((id) => canonicalHash(instances[id].variant) === canonicalHash(card.variant));
    const pool = [varied, printed, owned].find((ids) => ids.length > 0) ?? [];
    if (pool.length === 0) return null;
    const id = pool[Math.floor(random() * pool.length)];
    taken.add(id);
    return id;
  };
  return (cards) =>
    cards.flatMap((card) => {
      if (typeof card === "string") return [card];
      let id = chosen.get(card.member);
      if (id === undefined) {
        id = pick(card);
        chosen.set(card.member, id);
      }
      return id === null ? [] : [id];
    });
}

/** A state dealing every hidden card at random, each entering its zone at 0. */
function deal(view: BattleView, decklists: Decklists, random: () => number, catalog: EngineCatalog): BattleState {
  const viewer = view.viewer;
  const instances: Record<InstanceId, CardInstance> = {};
  for (const instance of Object.values(view.instances)) instances[instance.id] = instanceFromView(instance);
  const visible = Object.values(view.instances);
  const pools: Record<Side, DeckEntry[]> = {
    player: shuffled(remaining(decklists.player, visible.filter((instance) => instance.owner === "player")), random),
    enemy: shuffled(remaining(decklists.enemy, visible.filter((instance) => instance.owner === "enemy")), random),
  };
  let next = highest(view, "i") + 1;
  // Reserve anonymous history identities before minting hidden instances.
  // These facts name no current card and remain anonymous when viewed again.
  const anonymous = <T extends { readonly instance: InstanceId | null }>(cards: readonly T[]) => cards.map((card) => {
    const instance: InstanceId = card.instance ?? `i${next++}`;
    return { ...card, instance };
  });
  const playedCards = { player: anonymous(view.turnLog.played.player), enemy: anonymous(view.turnLog.played.enemy) };
  const materializedCards = { player: anonymous(view.turnLog.materialized.player), enemy: anonymous(view.turnLog.materialized.enemy) };
  const mint = (owner: Side, holder: Side, zone: "deck" | "hand", entry: DeckEntry, created: boolean): InstanceId => {
    const id: InstanceId = `i${next}`;
    next += 1;
    instances[id] = {
      id,
      printing: { kind: "card", cardId: entry.cardId },
      owner,
      controller: holder,
      zone,
      variant: variantOf(entry),
      status: freshStatus(created),
      enteredZoneAt: 0,
    };
    return id;
  };
  const anyEntry = (side: Side): DeckEntry => {
    const entries = decklists[side];
    const entry = entries[Math.floor(random() * entries.length)];
    if (entry === undefined) throw new Error(`Cannot determinize: the ${side} decklist is empty`);
    return entry;
  };
  const fill = (side: Side, zone: "deck" | "hand"): InstanceId[] =>
    slots(view.sides[side][zone]).map((known) => {
      if (known !== null) return known;
      const own = pools[side].pop();
      if (own !== undefined) return mint(side, side, zone, own, false);
      if (zone === "hand") {
        const other = pools[opponent(side)].pop();
        if (other !== undefined) return mint(opponent(side), side, zone, other, false);
        return mint(side, side, zone, anyEntry(side), true);
      }
      return mint(side, side, zone, anyEntry(side), false);
    });
  const side = (which: Side): SideState => {
    const source = view.sides[which];
    return {
      score: source.score,
      currentEnergy: source.currentEnergy,
      maxEnergy: source.maxEnergy,
      fatigueCount: source.fatigueCount,
      deck: fill(which, "deck"),
      hand: [],
      void: [...source.void],
      banished: [...source.banished],
      backRank: [...source.backRank],
      frontRank: [...source.frontRank],
      avatar: source.avatar === null ? null : { ...source.avatar },
      dreamsigns: source.dreamsigns.map((dreamsign) => ({ ...dreamsign })),
    };
  };
  const sides = { player: side("player"), enemy: side("enemy") };
  // Hands draw after both decks, so a hand may take the other side's leftovers.
  for (const which of SIDES) sides[which].hand = fill(which, "hand");
  const knownTo: Record<Side, InstanceId[]> = { player: [], enemy: [] };
  for (const which of SIDES) {
    for (const zone of ["deck", "hand"] as const) {
      for (const { id } of view.sides[which][zone].known) {
        if (zone === "deck" || instances[id]?.controller !== viewer) knownTo[viewer].push(id);
      }
    }
  }
  const seed = battleSeed(`determinized|${String(Math.floor(random() * 2 ** 53))}`);
  const descriptors = SIDES.flatMap((owner) => view.hiddenCards?.[owner] ?? []).sort((a, b) => a.member - b.member);
  const assigned = new Map<number, InstanceId>();
  const hidden = SIDES.flatMap((holder) => [...sides[holder].deck, ...sides[holder].hand]).filter((id) => !(id in view.instances));
  for (const descriptor of descriptors) {
    const pool = hidden.filter((id) => ![...assigned.values()].includes(id) && instances[id].owner === descriptor.owner &&
      canonicalHash(instances[id].printing) === canonicalHash(descriptor.printing) &&
      canonicalHash(instances[id].variant) === canonicalHash(descriptor.variant));
    const id = pool[Math.floor(random() * pool.length)];
    if (id === undefined) throw new Error(`Cannot determinize anonymous member ${String(descriptor.member)}: no matching decklist card`);
    instances[id] = { ...instances[id], printing: copy(descriptor.printing), variant: copy(descriptor.variant), status: copy(descriptor.status) };
    assigned.set(descriptor.member, id);
  }
  const capturedFacts = [...view.floating.flatMap(({ change }) => change.kind === "trigger" ? change.captured ?? [] : []),
    ...view.triggerQueue.flatMap((trigger) => trigger.captured ?? [])].filter((card): card is HiddenCapturedCardView => typeof card !== "string");
  const rememberedSource = (source: AbilitySource | { readonly member: number } | null, allowUnknown = false): AbilitySource => {
    if (source !== null && typeof source === "object" && "member" in source) {
      const resolved = assigned.get(source.member);
      if (resolved !== undefined) return resolved;
      if (!allowUnknown || !Number.isSafeInteger(source.member) || source.member < 0) throw new Error(`Missing anonymous source member ${String(source.member)}`);
      // Legacy saves can carry a public obligation without a remembered printing.
      // Such a source can belong to either side, including an opponent-owned card.
      const captured = capturedFacts.find((card) => card.member === source.member);
      const pool = hidden.filter((id) => ![...assigned.values()].includes(id) && (captured === undefined ||
        (instances[id].owner === captured.owner && canonicalHash(instances[id].printing) === canonicalHash(captured.printing) &&
          canonicalHash(instances[id].variant) === canonicalHash(captured.variant))));
      const chosen = pool[Math.floor(random() * pool.length)];
      if (chosen === undefined) throw new Error(`Cannot determinize anonymous source member ${String(source.member)}: no hidden card`);
      assigned.set(source.member, chosen);
      return chosen;
    }
    // A reserved nonexistent identity keeps unknown/ceased attribution null.
    return source ?? `i${next++}`;
  };
  const anonymousEffects = descriptors.flatMap((descriptor) => descriptor.effects.map((effect): FloatingEffect => {
    const target = assigned.get(descriptor.member);
    if (target === undefined) throw new Error("Missing anonymous target");
    return { id: effect.id, controller: effect.controller, source: rememberedSource(effect.source), timestamp: effect.timestamp,
      expiry: { at: "never" }, change: { ...copy(effect.change), instance: target } };
  }));
  // Validate combined provenance before any tag-dependent reconstruction.
  for (const effect of view.floating) {
    const source = effect.rememberedSource;
    if (effect.change.kind === "disableTriggers" && effect.change.mode === "triggeredAndActivated" && source != null &&
        ["member", "obligation", "ceased"].filter(tag => tag in source).length !== 1) {
      throw new Error("Cannot determinize ambiguous producer provenance");
    }
  }
  // Bind combined sources before captured cohorts clone the shared member map.
  for (const effect of view.floating) {
    if (effect.change.kind === "disableTriggers" && effect.change.mode === "triggeredAndActivated" && effect.rememberedSource != null && "member" in effect.rememberedSource) {
      rememberedSource(effect.rememberedSource, true);
    }
  }
  const physicallyHidden = SIDES.flatMap(holder => [...sides[holder].deck, ...sides[holder].hand]);
  const ceased = new Map<EffectId, InstanceId>();
  const ceasedSource = (anchor: EffectId): InstanceId => {
    const root = view.floating.find(effect => effect.id === anchor);
    const group = view.floating.filter(effect => effect.rememberedSource != null && "ceased" in effect.rememberedSource && effect.rememberedSource.ceased === anchor);
    if (root?.source !== null || root.change.kind !== "disableTriggers" || root.change.mode !== "triggeredAndActivated" ||
        root.rememberedSource == null || !("ceased" in root.rememberedSource) || root.rememberedSource.ceased !== anchor ||
        group.length < 2 || group[0].id !== anchor || group.some(effect => effect.rememberedSource == null || "member" in effect.rememberedSource || "obligation" in effect.rememberedSource || effect.source !== null ||
          effect.change.kind !== "disableTriggers" || effect.change.mode !== "triggeredAndActivated")) {
      throw new Error("Cannot determinize invalid ceased source anchor");
    }
    const previous = ceased.get(anchor);
    if (previous !== undefined) return previous;
    const source: InstanceId = `i${next++}`;
    ceased.set(anchor, source);
    return source;
  };
  const opaque = new Map<EffectId, InstanceId>();
  const opaqueSource = (effect: FloatingEffectView): InstanceId => {
    const provenance = effect.rememberedSource;
    if (provenance == null || !("obligation" in provenance) || provenance.obligation !== effect.id) throw new Error("Cannot determinize invalid source obligation");
    const previous = opaque.get(effect.id);
    if (previous !== undefined) return previous;
    // No private alias or existence relationship is in the input: producers
    // may be the same hidden card, distinct cards, or an unattributed ceased card.
    const absent: InstanceId = `i${next++}`;
    const pool = [...physicallyHidden, absent];
    const source = pool[Math.floor(random() * pool.length)];
    opaque.set(effect.id, source);
    return source;
  };
  const captured = standIns(view, sides, instances, random, assigned);
  for (const trigger of view.triggerQueue) {
    if (trigger.subjectCostHidden !== undefined && (trigger.subjectCostHidden !== true || trigger.lastKnownSubjectCost !== undefined ||
        trigger.subject !== null || trigger.source === null || trigger.origin === null || trigger.kind === "dreamwellBonus")) {
      throw new Error("Cannot determinize invalid hidden subject cost");
    }
  }
  const triggerQueue: QueuedTrigger[] = view.triggerQueue.flatMap((trigger) =>
    trigger.source === null || trigger.origin === null
      ? []
      : [{
          ...(trigger.kind === "dreamwellBonus" ? { kind: trigger.kind } : {}),
          ...(trigger.linkedSource === undefined ? {} : { linkedSource: copy(trigger.linkedSource) }),
          source: copy(trigger.source),
          controller: trigger.controller,
          origin: copy(trigger.origin),
          ability: trigger.ability,
          node: trigger.node,
          subject: trigger.subject,
          ...(trigger.lastKnownSubjectCost === undefined ? {} : { lastKnownSubjectCost: trigger.lastKnownSubjectCost }),
          ...(trigger.gain === undefined ? {} : { gain: copy(trigger.gain) }),
          ...(trigger.scored === undefined ? {} : { scored: trigger.scored }),
          ...(trigger.lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark: trigger.lastKnownSourceSpark }),
          ...(trigger.captured === undefined ? {} : { captured: captured(trigger.captured) }),
        }],
  );
  const payable: PayableEffect[] = view.payable.map((effect) => ({
    id: effect.id,
    payer: effect.payer,
    cost: effect.cost,
    source: effect.source === null ? { kind: "avatar", side: effect.controller } : copy(effect.source),
    affects: [...effect.affects],
  }));
  const clock = Math.max(0, ...Object.values(instances).map((instance) => instance.enteredZoneAt), ...view.floating.map((effect) => effect.timestamp));
  const state: BattleState = {
    version: view.version,
    seed,
    rng: {},
    nextInstance: next,
    clock,
    config: copy(view.config),
    turn: copy(view.turn),
    sides,
    instances,
    knownTo,
    stack: view.stack.map((item) => copy(item)),
    priority: view.priority,
    payable,
    linkedBanished: copy([...(view.linkedBanished ?? [])]),
    triggerQueue,
    floating: [...anonymousEffects, ...view.floating.map((effect): FloatingEffect => {
      const { rememberedSource: provenance, ...record } = copy(effect);
      return { ...record,
        source: provenance != null && "obligation" in provenance ? opaqueSource(effect)
          : provenance != null && "ceased" in provenance ? ceasedSource(provenance.ceased)
          : provenance !== undefined ? rememberedSource(provenance, effect.change.kind === "disableTriggers" && effect.change.mode === "triggeredAndActivated")
            : effect.source === null && effect.change.kind === "disableTriggers" && effect.change.mode === "triggeredAndActivated" ? rememberedSource(null)
              : effect.source === null ? { kind: "avatar", side: effect.controller } : copy(effect.source),
        ...(effect.change.kind === "disableTriggers" && effect.change.mode === "triggeredAndActivated"
          ? { sourceObservedBy: provenance != null && "obligation" in provenance ? [] : [viewer] } : {}),
        change: floatingChange(effect.change, captured) };
    })].sort((a, b) => a.timestamp - b.timestamp || Number(a.id.slice(1)) - Number(b.id.slice(1))),
    turnLog: {
      played: playedCards,
      drawn: { ...view.turnLog.drawn },
      materialized: materializedCards,
    },
    nextEffect: highest([view.payable, view.floating, descriptors], "e") + 1,
    oncePerTurn: [...view.oncePerTurn],
    dreamwell: { deck: [], next: 0, catalog: [] },
    challenge: copy(view.challenge),
    automaticSteps: 0,
    automaticChoices: view.automaticChoices,
    loops: emptyLoopTracker(),
    result: copy(view.result),
  };
  state.nextInstance = next;
  if (descriptors.length > 0) {
    state.rememberedCards = { player: [], enemy: [] };
    state.rememberedCards[viewer] = descriptors.map((descriptor: HiddenCardDescriptor) => {
      const id = assigned.get(descriptor.member);
      if (id === undefined) throw new Error("Missing anonymous card");
      return { instance: id, owner: descriptor.owner, printing: copy(descriptor.printing), variant: copy(descriptor.variant),
        status: copy(descriptor.status), effects: copy(state.floating.filter((effect): effect is RememberedEffect => isFixedEffect(effect) && effect.change.instance === id)) };
    });
  }
  // A visible target whose observed fixed effect has an unidentified source
  // keeps that observation too; subsequent views must retain the obligation.
  for (const shown of view.floating) {
    if (shown.rememberedSource === undefined) continue;
    const effect = state.floating.find((entry) => entry.id === shown.id);
    if (effect === undefined || !isFixedEffect(effect) || effect.change.instance === null) continue;
    const instance = state.instances[effect.change.instance];
    if (instance === undefined) throw new Error("Missing observed public target");
    state.rememberedCards ??= { player: [], enemy: [] };
    const records = state.rememberedCards[viewer];
    const previous = records.find((record) => record.instance === instance.id);
    const effects = [...(previous?.effects ?? []), copy(effect)];
    const record = { instance: instance.id, owner: instance.owner, printing: copy(instance.printing), variant: copy(instance.variant),
      status: copy(instance.status), effects };
    if (previous === undefined) records.push(record);
    else records[records.indexOf(previous)] = record;
  }
  state.clock = Math.max(state.clock, ...anonymousEffects.map((effect) => effect.timestamp));
  buildDreamwellDeck(state, catalog, view.dreamwell.catalog);
  state.dreamwell.deck = state.dreamwell.deck.slice(0, view.dreamwell.remaining);
  return state;
}

/** The hidden zones a card's static abilities work from (RD-hv-umm2.53-1). */
interface HiddenStatics {
  readonly hand: boolean;
  readonly deck: boolean;
}

/** A hidden card's place: the zone list it is in and its index there. */
interface HiddenSlot {
  readonly side: Side;
  readonly zone: "deck" | "hand";
  readonly index: number;
}

/** A card's printing and variant, as a key: cards with the same key have the same abilities. */
function identity({ printing, variant }: CardInstance): string {
  const printed = printing.kind === "figment" ? `figment:${printing.figment}` : printing.cardId;
  const plain = variant.transfigurations === undefined && variant.deckMods === undefined;
  return `${printed}|${plain ? String(variant.amplified) : JSON.stringify(variant)}`;
}

/**
 * How far a card's characteristics are from those the view shows: a count
 * of differing types and keywords (1 for the same keywords in another
 * order) plus the spark and cost differences. 0 exactly when they are equal.
 */
function difference(seen: CharacteristicsView, sampled: CharacteristicsView): number {
  const missing =
    seen.keywords.filter((keyword) => !sampled.keywords.includes(keyword)).length +
    sampled.keywords.filter((keyword) => !seen.keywords.includes(keyword)).length;
  const reordered = missing === 0 && seen.keywords.some((keyword, index) => sampled.keywords[index] !== keyword);
  const spark = seen.spark === null || sampled.spark === null ? Number(seen.spark !== sampled.spark) : Math.abs(seen.spark - sampled.spark);
  return (
    Number(seen.cardType !== sampled.cardType) +
    Number(seen.subtype !== sampled.subtype) +
    Number(seen.allTypes !== sampled.allTypes) +
    (reordered ? 1 : missing) +
    spark +
    Math.abs(seen.cost - sampled.cost)
  );
}

/** How far `state` is from showing the viewer the characteristics `view` shows, with the evaluation it was read from. */
function distance(state: BattleState, view: BattleView, catalog: EngineCatalog): { readonly total: number; readonly layers: Layers } {
  const layers = new Layers(state, catalog);
  let total = 0;
  for (const seen of Object.values(view.instances)) {
    const instance = state.instances[seen.id];
    if (instance !== undefined) total += difference(seen.characteristics, characteristicsView(state, catalog, layers, instance));
  }
  return { total, layers };
}

/**
 * Makes a dealt state show the viewer what `view` shows when a hidden card's
 * static ability changes a card the viewer sees (RD-hv-umm2.53-2): the
 * viewer sees the change but not its card, so the deal may have put the
 * source in a zone where its ability does not work, or another card in its
 * place, or dated it before a change it followed. Only hidden cards whose
 * static abilities work from a hand or a deck move, so a state without one
 * is left as dealt; when no printing in the catalog has a static ability
 * working outside play, only cards with transfigurations or deck mods are
 * read.
 *
 * It descends on `distance`. Each move changes one such card: it swaps the
 * card with a hidden card of the same owner in its side's other hidden zone
 * (the first card with no such ability, or the first of each other card
 * with one); dates it at 0, or at or just after the timestamp of a keyword
 * or base-spark change, so it applies just before or just after that
 * change; or does both. It takes the
 * first move that brings the state closer and stops at distance 0 or when
 * no move does, so a view no hidden card explains (a floating effect whose
 * source the viewer cannot see, say) keeps the deal's closest state. It
 * draws nothing from `random` and reads only the view and the deal.
 */
function reconcile(state: BattleState, view: BattleView, catalog: EngineCatalog): void {
  const memo = new Map<string, HiddenStatics | null>();
  const printedOnlyInPlay = !catalog.staticsOutsidePlay();
  const statics = (id: InstanceId): HiddenStatics | null => {
    const instance = state.instances[id];
    if (instance === undefined || (printedOnlyInPlay && plainVariant(instance))) return null;
    const key = identity(instance);
    let found = memo.get(key);
    if (found === undefined) {
      const zones = originAbilities(catalog, instanceOrigin(instance)).flatMap((ability) => (ability.kind === "static" ? [ability.zone] : []));
      const hand = zones.some((zone) => worksInZone(zone, "hand"));
      const deck = zones.some((zone) => worksInZone(zone, "deck"));
      found = hand || deck ? { hand, deck } : null;
      memo.set(key, found);
    }
    return found;
  };
  const at = (slot: HiddenSlot): InstanceId => state.sides[slot.side][slot.zone][slot.index];
  const hidden: HiddenSlot[] = SIDES.flatMap((side) =>
    (["deck", "hand"] as const).flatMap((zone) =>
      state.sides[side][zone].flatMap((id, index) => (id in view.instances ? [] : [{ side, zone, index }])),
    ),
  );
  if (!hidden.some((slot) => statics(at(slot)) !== null)) return;
  const swap = (a: HiddenSlot, b: HiddenSlot): void => {
    const first = at(a);
    const second = at(b);
    state.sides[a.side][a.zone][a.index] = second;
    state.sides[b.side][b.zone][b.index] = first;
    state.instances[first].zone = b.zone;
    state.instances[second].zone = a.zone;
  };
  /** Each move as a change and its undoing, for the source at `slot`. */
  function* moves(slot: HiddenSlot, layers: Layers): Generator<{ readonly make: () => void; readonly undo: () => void }> {
    const source = state.instances[at(slot)];
    const works = statics(source.id);
    if (works === null) return;
    const partners: HiddenSlot[] = [];
    if (!source.status.created) {
      const kinds = new Set<string>([identity(source)]);
      for (const other of hidden) {
        const partner = state.instances[at(other)];
        if (other.side !== slot.side || other.zone === slot.zone || partner.owner !== source.owner || partner.status.created) continue;
        const kind = statics(partner.id) === null ? "none" : identity(partner);
        if (kinds.has(kind)) continue;
        kinds.add(kind);
        partners.push(other);
      }
    }
    const times = new Set<number>([0]);
    for (const layer of [3, 4] as const) {
      for (const { timestamp } of layers.changes(layer)) times.add(timestamp).add(timestamp + 1);
    }
    const original = source.enteredZoneAt;
    for (const partner of [null, ...partners]) {
      const zone = partner === null ? slot.zone : partner.zone;
      const dates = works[zone] ? [original, ...[...times].filter((time) => time !== original).sort((a, b) => a - b)] : [original];
      for (const date of dates) {
        if (partner === null && date === original) continue;
        yield {
          make: () => {
            if (partner !== null) swap(slot, partner);
            source.enteredZoneAt = date;
          },
          undo: () => {
            source.enteredZoneAt = original;
            if (partner !== null) swap(slot, partner);
          },
        };
      }
    }
  }
  let current = distance(state, view, catalog);
  descent: while (current.total > 0) {
    for (const slot of hidden) {
      for (const move of moves(slot, current.layers)) {
        move.make();
        const next = distance(state, view, catalog);
        if (next.total < current.total) {
          current = next;
          continue descent;
        }
        move.undo();
      }
    }
    break;
  }
  state.clock = Math.max(state.clock, ...hidden.map((slot) => state.instances[at(slot)].enteredZoneAt));
}

/**
 * Reconcile only aggregate public suppression. Source predicates are private
 * individually: overlapping effects can mask which hidden source is in a deck.
 * Hidden source cards retain their anonymous links and original dynamic while;
 * future draws, plays, and expiry therefore evaluate the ordinary rules.
 *
 * The search partitions the dealt hidden cards among compatible hidden zones;
 * observed ownership/printing/status stay fixed. A legacy source whose status
 * was never observed can have either prior Reclaim play. It uses the battle's
 * work cap and rejects an impossible/bounded view before exposing any state.
 */
function reconcileDisabling(state: BattleState, view: BattleView, catalog: EngineCatalog, random: () => number): void {
  if (view.disabledActivations === undefined) return;
  if (!Number.isSafeInteger(state.config.resolutionCap) || state.config.resolutionCap < 1) throw new Error("Cannot determinize invalid battle work cap");
  const combined = state.floating.filter(({ change }) => change.kind === "disableTriggers" && change.mode === "triggeredAndActivated");
  const targets = [...new Set(combined.flatMap(({ change }) => change.kind === "disableTriggers" ? [change.instance] : []))];
  const disabled = new Set(view.disabledActivations);
  if (disabled.size !== view.disabledActivations.length || [...disabled].some((id) => !targets.includes(id) || !(id in view.instances))) {
    throw new Error("Cannot determinize invalid aggregate activation suppression");
  }
  const agrees = () => targets.every((id) => abilitiesDisabled(state, catalog, id, "activated") === disabled.has(id));
  if (agrees()) return;
  const baseline = distance(state, view, catalog).total;
  const bins = SIDES.flatMap((side) => (["deck", "hand"] as const).map((zone) => ({
    side, zone, original: [...state.sides[side][zone]],
    capacity: state.sides[side][zone].filter((id) => !(id in view.instances)).length,
    cards: [] as InstanceId[],
  }))).filter((bin) => bin.capacity > 0);
  const hidden = bins.flatMap((bin) => bin.original.filter((id) => !(id in view.instances)));
  const hiddenSet = new Set(hidden);
  let sourceIds = new Set(combined.flatMap((effect) => typeof effect.source === "string" && hiddenSet.has(effect.source) ? [effect.source] : []));
  const observed = new Set((state.rememberedCards?.[view.viewer] ?? []).map((record) => record.instance));
  let uncertainReclaim = new Set(combined.flatMap((effect) => effect.change.kind === "disableTriggers" && effect.change.while?.cond === "sourceWasReclaimed" &&
    typeof effect.source === "string" && hiddenSet.has(effect.source) && !observed.has(effect.source) ? [effect.source] : []));
  // Place source members first; ordinary hidden cards then fill the counts.
  let cards = [...hidden.filter((id) => sourceIds.has(id)), ...hidden.filter((id) => !sourceIds.has(id))];
  const originalBin = new Map(hidden.map((id) => [id, bins.find((bin) => bin.original.includes(id))]));
  const placed = new Set<InstanceId>();
  let work = 0;
  const sourcePredicatesAgree = () => targets.every((id) => {
    const effects = combined.filter((effect) => effect.change.kind === "disableTriggers" && effect.change.instance === id);
    // Other predicates can depend on the completed hidden-zone partition.
    if (effects.some((effect) => effect.change.kind === "disableTriggers" && effect.change.while !== undefined &&
      effect.change.while.cond !== "sourceIn" && effect.change.while.cond !== "sourceWasReclaimed")) return true;
    if (effects.some((effect) => typeof effect.source === "string" && hiddenSet.has(effect.source) && !placed.has(effect.source))) return true;
    return abilitiesDisabled(state, catalog, id, "activated") === disabled.has(id);
  });
  const install = () => {
    for (const bin of bins) {
      let index = 0;
      state.sides[bin.side][bin.zone] = bin.original.map((id) => id in view.instances ? id : bin.cards[index++]);
    }
  };
  const search = (index: number): boolean => {
    if (++work > state.config.resolutionCap) throw new Error("Cannot determinize aggregate activation suppression within the battle work cap");
    if (index === cards.length) {
      install();
      return agrees() && distance(state, view, catalog).total <= baseline;
    }
    const id = cards[index];
    const instance = state.instances[id];
    const before = { zone: instance.zone, controller: instance.controller, playedViaReclaim: instance.status.playedViaReclaim };
    const choices = bins.filter((bin) => bin.cards.length < bin.capacity &&
      (bin.zone !== "deck" || (instance.owner === bin.side && !instance.status.created)))
      .sort((a, b) => Number(b === originalBin.get(id)) - Number(a === originalBin.get(id)));
    for (const bin of choices) {
      bin.cards.push(id);
      instance.zone = bin.zone;
      instance.controller = bin.side;
      placed.add(id);
      const statuses = uncertainReclaim.has(id)
        ? random() < 0.5 ? [before.playedViaReclaim, !before.playedViaReclaim] : [!before.playedViaReclaim, before.playedViaReclaim]
        : [before.playedViaReclaim];
      for (const status of statuses) {
        instance.status.playedViaReclaim = status;
        if (sourcePredicatesAgree() && search(index + 1)) return true;
      }
      bin.cards.pop();
      placed.delete(id);
      Object.assign(instance, { zone: before.zone, controller: before.controller });
      instance.status.playedViaReclaim = before.playedViaReclaim;
    }
    return false;
  };
  const unknown = view.floating.flatMap((shown) => shown.rememberedSource != null && "obligation" in shown.rememberedSource
    ? [{ index: combined.findIndex((effect) => effect.id === shown.id), id: shown.id }] : []);
  const candidates = unknown.map(({ index }) => {
    if (index < 0) throw new Error("Cannot determinize invalid source obligation");
    const source = combined[index].source;
    const absent: InstanceId = typeof source === "string" && !(source in state.instances) ? source : `i${state.nextInstance++}`;
    return [...new Set([source, ...SIDES.flatMap(side => [...state.sides[side].deck, ...state.sides[side].hand]), absent])];
  });
  const bind = (index: number): boolean => {
    if (++work > state.config.resolutionCap) throw new Error("Cannot determinize aggregate activation suppression within the battle work cap");
    if (index === unknown.length) {
      sourceIds = new Set(combined.flatMap((effect) => typeof effect.source === "string" && hiddenSet.has(effect.source) ? [effect.source] : []));
      uncertainReclaim = new Set(combined.flatMap((effect) => effect.change.kind === "disableTriggers" && effect.change.while?.cond === "sourceWasReclaimed" &&
        typeof effect.source === "string" && hiddenSet.has(effect.source) && !observed.has(effect.source) ? [effect.source] : []));
      cards = [...hidden.filter((id) => sourceIds.has(id)), ...hidden.filter((id) => !sourceIds.has(id))];
      return search(0);
    }
    const entry = unknown[index];
    const at = state.floating.findIndex((effect) => effect.id === entry.id);
    const before = combined[entry.index];
    for (const source of candidates[index]) {
      combined[entry.index] = { ...before, source };
      state.floating[at] = combined[entry.index];
      if (bind(index + 1)) return true;
    }
    combined[entry.index] = before;
    state.floating[at] = before;
    return false;
  };
  if (!bind(0)) throw new Error("Cannot determinize impossible aggregate activation suppression");
}

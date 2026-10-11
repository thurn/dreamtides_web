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
 *   names, with fresh status, entering their zones at 0;
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
 * - queued triggers whose source the viewer cannot see, floating effects the
 *   view omits, the opponent's knowledge, loop history, and the
 *   automatic-step count start empty;
 * - an effect a side may pay to end whose source the viewer cannot see
 *   names its controller's avatar as its source.
 */
import type { EngineCatalog } from "../catalog";
import { Layers } from "../continuous/layers";
import { worksInZone } from "../dsl/abilities";
import { emptyLoopTracker } from "../loops/types";
import { instanceOrigin, originAbilities } from "../rules/activation";
import { buildDreamwellDeck } from "../rules/dreamwell";
import { freshStatus, variantOf } from "../state/create";
import type { InstanceId, Side } from "../state/ids";
import { battleSeed, opponent, SIDES } from "../state/ids";
import type { BattleState, CardInstance, DeckEntry, PayableEffect, QueuedTrigger, SideState } from "../state/types";
import { characteristicsView, type BattleView, type CharacteristicsView, type HiddenZoneView, type InstanceView } from "./view";

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
    const variant = JSON.stringify(instance.variant);
    if (!take((entry) => entry.cardId === printing.cardId && JSON.stringify(variantOf(entry)) === variant)) {
      take((entry) => entry.cardId === printing.cardId);
    }
  }
  return pool;
}

function instanceFromView(instance: InstanceView): CardInstance {
  const { characteristics: _characteristics, ...rest } = copy(instance);
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
  return state;
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
  const triggerQueue: QueuedTrigger[] = view.triggerQueue.flatMap((trigger) =>
    trigger.source === null || trigger.origin === null
      ? []
      : [{
          source: copy(trigger.source),
          controller: trigger.controller,
          origin: copy(trigger.origin),
          ability: trigger.ability,
          node: trigger.node,
          subject: trigger.subject,
          ...(trigger.gain === undefined ? {} : { gain: copy(trigger.gain) }),
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
    seed: battleSeed(`determinized|${String(Math.floor(random() * 2 ** 53))}`),
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
    triggerQueue,
    floating: view.floating.map((effect) => copy(effect)),
    turnLog: {
      played: { player: view.turnLog.played.player.map((card) => ({ ...card })), enemy: view.turnLog.played.enemy.map((card) => ({ ...card })) },
      drawn: { ...view.turnLog.drawn },
    },
    nextEffect: highest([view.payable, view.floating], "e") + 1,
    oncePerTurn: [...view.oncePerTurn],
    dreamwell: { deck: [], next: 0, catalog: [] },
    challenge: copy(view.challenge),
    automaticSteps: 0,
    automaticChoices: view.automaticChoices,
    loops: emptyLoopTracker(),
    result: copy(view.result),
  };
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
 * is left as dealt.
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
  const statics = (id: InstanceId): HiddenStatics | null => {
    const instance = state.instances[id];
    if (instance === undefined) return null;
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

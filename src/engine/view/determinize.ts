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
 *   names, with fresh status;
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
import { emptyLoopTracker } from "../loops/types";
import { buildDreamwellDeck } from "../rules/dreamwell";
import { freshStatus, variantOf } from "../state/create";
import type { InstanceId, Side } from "../state/ids";
import { battleSeed, opponent, SIDES } from "../state/ids";
import type { BattleState, CardInstance, DeckEntry, PayableEffect, QueuedTrigger, SideState } from "../state/types";
import type { BattleView, HiddenZoneView, InstanceView } from "./view";

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
    loops: emptyLoopTracker(),
    result: copy(view.result),
  };
  buildDreamwellDeck(state, catalog, view.dreamwell.catalog);
  state.dreamwell.deck = state.dreamwell.deck.slice(0, view.dreamwell.remaining);
  return state;
}

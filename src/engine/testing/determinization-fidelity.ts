/**
 * The determinization-fidelity invariant (D22; engine-design § Testing
 * layers): a determinization of what a side sees must agree with the real
 * state on everything that side may act on. For each side, the state
 * `determinize(view(state, side))` samples must have:
 *
 * - the same legal actions for that side, in the same order: legality reads
 *   only what the side can see, plus the hidden statics `reconcile` restores;
 * - the same record (printing, owner, controller, zone, variant, raw status,
 *   and entry time) for every card in a public zone: the stack, play, a
 *   void, or the Banished zone;
 * - the same floating effects that name only cards the side can identify,
 *   and the same payable effects, apart from a source the side cannot see.
 *   A play permission is kept whatever its source; any other floating effect
 *   from a hidden source is one determinization drops (view/determinize.ts).
 *
 * A failure names instance IDs, effect IDs, and printed UUIDs, never names.
 */
import type { Engine } from "../engine";
import type { Action } from "../rules/actions";
import { changedInstance } from "../rules/floating";
import { PolicyRandom } from "../policy/random";
import type { AbilitySource, BattleSeed, InstanceId, Side, Zone } from "../state/ids";
import { battleSeed, SIDES } from "../state/ids";
import type { BattleState, CardInstance, FloatingEffect, PayableEffect } from "../state/types";
import type { Decklists } from "../view/determinize";
import { identifies } from "../view/knowledge";
import type { BattleView } from "../view/view";

/** Zones whose cards both sides see. */
const PUBLIC_ZONES: readonly Zone[] = ["stack", "play", "void", "banished"];

/** The fields of a public card a determinization copies from the view. */
const RECORD_FIELDS = ["printing", "owner", "controller", "zone", "variant", "status", "enteredZoneAt"] as const satisfies readonly (keyof CardInstance)[];

/** A view without the parts determinization rebuilds approximately (see view/determinize.ts). */
export function comparableView(seen: BattleView): unknown {
  const { triggerQueue, payable, ...rest } = seen;
  return {
    ...rest,
    triggerQueue: triggerQueue.filter((trigger) => trigger.source !== null),
    payable: payable.map(({ source: _source, ...effect }) => effect),
  };
}

/** A card's instance ID with its printed UUID, for failure messages. */
function label(state: BattleState, id: InstanceId): string {
  const printing = state.instances[id]?.printing;
  if (printing === undefined) return id;
  return `${id} (${printing.kind === "figment" ? printing.figment : printing.cardId})`;
}

/** An action as JSON, with the printed UUID of each card it names. */
function actionLabel(state: BattleState, action: Action): string {
  const card = action.kind === "play" || action.kind === "reposition" ? action.card : action.kind === "activate" && typeof action.source === "string" ? action.source : null;
  return card === null ? JSON.stringify(action) : `${JSON.stringify(action)} on ${label(state, card)}`;
}

/** The actions in `a` that `b` lacks, as labels read from `state`. */
function missing(state: BattleState, a: readonly Action[], b: readonly Action[]): string[] {
  const keys = new Set(b.map((action) => JSON.stringify(action)));
  return a.filter((action) => !keys.has(JSON.stringify(action))).map((action) => actionLabel(state, action));
}

function legalActionDivergences(engine: Engine, state: BattleState, sampled: BattleState, side: Side): string[] {
  const real = engine.legalActions(state, side);
  const simulated = engine.legalActions(sampled, side);
  if (JSON.stringify(real) === JSON.stringify(simulated)) return [];
  const lost = missing(state, real, simulated);
  const gained = missing(sampled, simulated, real);
  if (lost.length === 0 && gained.length === 0) return ["legal actions in another order"];
  return [...lost.map((action) => `legal action ${action} missing`), ...gained.map((action) => `extra legal action ${action}`)];
}

function publicCardDivergences(state: BattleState, sampled: BattleState): string[] {
  const problems: string[] = [];
  for (const instance of Object.values(state.instances)) {
    if (!PUBLIC_ZONES.includes(instance.zone)) continue;
    const copy = sampled.instances[instance.id];
    if (copy === undefined) {
      problems.push(`public card ${label(state, instance.id)} in ${instance.zone} missing`);
      continue;
    }
    for (const field of RECORD_FIELDS) {
      const real = JSON.stringify(instance[field]);
      const simulated = JSON.stringify(copy[field]);
      if (real !== simulated) problems.push(`public card ${label(state, instance.id)} ${field} ${simulated} for ${real}`);
    }
  }
  return problems;
}

/** Whether `side` can see `source`: a card it can identify, an avatar, or a dreamsign. */
function seesSource(state: BattleState, source: AbilitySource, side: Side): boolean {
  return typeof source !== "string" || identifies(state, source, side);
}

/** Whether `side` is owed `effect` in a determinization of its view. */
function owedFloating(state: BattleState, effect: FloatingEffect, side: Side): boolean {
  const changed = changedInstance(effect.change);
  if (changed !== null && !identifies(state, changed, side)) return false;
  if (effect.expiry.at === "sourceLeavesPlay" && !identifies(state, effect.expiry.source, side)) return false;
  return effect.change.kind === "playFrom" || seesSource(state, effect.source, side);
}

/** An effect record without its source, and with the source when `side` sees it. */
function effectRecord(state: BattleState, effect: FloatingEffect | PayableEffect, side: Side): string {
  const { source, ...rest } = effect;
  const affects = "affects" in effect ? { affects: effect.affects.filter((id) => identifies(state, id, side)) } : {};
  return JSON.stringify({ ...rest, ...affects, source: seesSource(state, source, side) ? source : null });
}

function effectDivergences(
  kind: "floating" | "payable",
  state: BattleState,
  owed: readonly (FloatingEffect | PayableEffect)[],
  sampled: readonly (FloatingEffect | PayableEffect)[],
  side: Side,
): string[] {
  const problems: string[] = [];
  for (const effect of owed) {
    const copy = sampled.find((other) => other.id === effect.id);
    if (copy === undefined) problems.push(`${kind} effect ${effect.id} missing: ${effectRecord(state, effect, side)}`);
    else {
      const real = effectRecord(state, effect, side);
      const simulated = effectRecord(state, { ...copy, source: effect.source }, side);
      const sourced = seesSource(state, effect.source, side) && JSON.stringify(copy.source) !== JSON.stringify(effect.source);
      if (real !== simulated || sourced) problems.push(`${kind} effect ${effect.id} ${JSON.stringify(copy)} for ${real}`);
    }
  }
  for (const effect of sampled) {
    if (!owed.some((other) => other.id === effect.id)) problems.push(`extra ${kind} effect ${effect.id}`);
  }
  return problems;
}

/**
 * Where determinizations of each side's view of `state`, a committed state
 * from a battle with `decklists`, disagree with it on what that side may act
 * on. Each side's sample is seeded by the battle's `seed`, the check's
 * `ordinal` within it, and the side, so a failure reproduces.
 */
export function determinizationDivergences(engine: Engine, state: BattleState, decklists: Decklists, seed: BattleSeed, ordinal: number): string[] {
  return SIDES.flatMap((side) => {
    const random = new PolicyRandom(battleSeed(`fidelity|${seed}|${String(ordinal)}|${side}`));
    const sampled = engine.determinize(engine.view(state, side), decklists, () => random.next());
    const problems = [
      ...legalActionDivergences(engine, state, sampled, side),
      ...publicCardDivergences(state, sampled),
      ...effectDivergences("floating", state, state.floating.filter((effect) => owedFloating(state, effect, side)), sampled.floating, side),
      ...effectDivergences("payable", state, state.payable, sampled.payable, side),
    ];
    return problems.map((problem) => `${side}'s determinization: ${problem}`);
  });
}


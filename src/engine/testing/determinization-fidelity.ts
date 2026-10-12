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
 *   and the same payable effects, apart from a source the side cannot see
 *   and the affected cards it cannot identify; a trigger's captured cards
 *   the side cannot identify match by owner, printing, and variant, and records name
 *   the same such card exactly where the real ones do.
 *   Legality data and recorded hand returns (`keptWithoutSource`) are kept
 *   whatever their source, provided their changed card and expiry identities
 *   are visible (view/determinize.ts).
 *
 * A failure names instance IDs, effect IDs, and printed UUIDs, never names.
 */
import type { Engine } from "../engine";
import type { Action } from "../rules/actions";
import { changedInstance, keptWithoutSource } from "../rules/floating";
import { PolicyRandom } from "../policy/random";
import type { AbilitySource, BattleSeed, InstanceId, Side, Zone } from "../state/ids";
import { battleSeed, SIDES } from "../state/ids";
import type { BattleState, CardInstance, FloatingEffect, PayableEffect, RememberedEffect } from "../state/types";
import type { Decklists } from "../view/determinize";
import { identifies, isFixedEffect, observedFixedEffect } from "../view/knowledge";
import { canonicalHash } from "../state/hash";
import { cloneState } from "../state/clone";
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
  return keptWithoutSource(effect.change) || seesSource(state, effect.source, side) || observedFixedEffect(state, side, effect.id) !== undefined;
}

/**
 * Numbers the captured cards `side` cannot identify in `effects`, in order
 * of first appearance, as a view numbers its hidden members, so two records
 * compare equal only when they name the same hidden cards as each other.
 */
function hiddenMembers(state: BattleState, effects: readonly (FloatingEffect | PayableEffect)[], side: Side): Map<InstanceId, number> {
  const members = new Map<InstanceId, number>();
  for (const effect of effects) {
    if (!("change" in effect) || effect.change.kind !== "trigger") continue;
    for (const id of effect.change.captured ?? []) {
      if (state.instances[id] !== undefined && !identifies(state, id, side) && !members.has(id)) members.set(id, members.size);
    }
  }
  return members;
}

/**
 * A trigger's captured cards as `side` can tell them apart in `state`: a
 * card it can identify by its ID, any other by its member number in
 * `members`, owner, printing, and variant, and a card that ceased to exist not at all
 * (view/view.ts `CapturedCardView`).
 */
function capturedRecord(state: BattleState, captured: readonly InstanceId[], side: Side, members: ReadonlyMap<InstanceId, number>): unknown[] {
  return captured.flatMap((id): unknown[] => {
    const instance = state.instances[id];
    if (instance === undefined) return [];
    return identifies(state, id, side) ? [id] : [{ member: members.get(id), owner: instance.owner, printing: instance.printing, variant: instance.variant }];
  });
}

/** Where a record's captured cards are read: the state it belongs to, and its hidden members' numbers there. */
interface CapturedScope {
  readonly state: BattleState;
  readonly members: ReadonlyMap<InstanceId, number>;
}

/**
 * An effect record without its source, and with the source when `side` sees
 * it; a payable effect's affected cards list only those `side` can
 * identify, and a trigger's captured cards are read in `scope`
 * (`capturedRecord`).
 */
function effectRecord(state: BattleState, effect: FloatingEffect | PayableEffect, side: Side, scope: CapturedScope): string {
  const { source, ...rest } = effect;
  const affects = "affects" in effect ? { affects: effect.affects.filter((id) => identifies(state, id, side)) } : {};
  const change = "change" in effect && effect.change.kind === "trigger" && effect.change.captured !== undefined
    ? { change: { ...effect.change, captured: capturedRecord(scope.state, effect.change.captured, side, scope.members) } }
    : {};
  return JSON.stringify({ ...rest, ...affects, ...change, source: seesSource(state, source, side) ? source : null });
}

function effectDivergences(
  kind: "floating" | "payable",
  state: BattleState,
  owed: readonly (FloatingEffect | PayableEffect)[],
  sampledState: BattleState,
  sampled: readonly (FloatingEffect | PayableEffect)[],
  side: Side,
): string[] {
  const problems: string[] = [];
  const copies = owed.flatMap((effect) => sampled.filter((other) => other.id === effect.id));
  const real: CapturedScope = { state, members: hiddenMembers(state, owed, side) };
  const simulated: CapturedScope = { state: sampledState, members: hiddenMembers(sampledState, copies, side) };
  for (const effect of owed) {
    const copy = sampled.find((other) => other.id === effect.id);
    if (copy === undefined) problems.push(`${kind} effect ${effect.id} missing: ${effectRecord(state, effect, side, real)}`);
    else {
      const record = effectRecord(state, effect, side, real);
      const copied = effectRecord(state, { ...copy, source: effect.source }, side, simulated);
      const remembered = observedFixedEffect(state, side, effect.id) !== undefined;
      const sameSource = remembered ? canonicalHash(copy.source) === canonicalHash(effect.source)
        : JSON.stringify(copy.source) === JSON.stringify(effect.source);
      const sourced = seesSource(state, effect.source, side) && !sameSource;
      const same = remembered ? canonicalHash(JSON.parse(record) as unknown) === canonicalHash(JSON.parse(copied) as unknown)
        : record === copied;
      if (!same || sourced) problems.push(`${kind} effect ${effect.id} ${JSON.stringify(copy)} for ${record}`);
    }
  }
  for (const effect of sampled) {
    if (!owed.some((other) => other.id === effect.id)) problems.push(`extra ${kind} effect ${effect.id}`);
  }
  return problems;
}

/** Compare observed anonymous obligations against the sample's raw cards and effects, independently of its remembered copies. */
function anonymousDivergences(engine: Engine, seen: BattleView, sampled: BattleState, side: Side): string[] {
  const measured = cloneState(sampled);
  if (measured.rememberedCards !== undefined) {
    measured.rememberedCards[side] = measured.rememberedCards[side].flatMap((record) => {
      const actual = sampled.instances[record.instance];
      if (actual === undefined) return [];
      return [{ ...record, owner: actual.owner, printing: actual.printing, variant: actual.variant, status: actual.status,
        effects: sampled.floating.filter((effect): effect is RememberedEffect => isFixedEffect(effect) && effect.change.instance === actual.id) }];
    });
  }
  const expected = seen.hiddenCards ?? { player: [], enemy: [] };
  const measuredView = engine.view(measured, side);
  const actual = measuredView.hiddenCards ?? { player: [], enemy: [] };
  const problems = canonicalHash(expected) === canonicalHash(actual) ? [] :
    [`anonymous card descriptors ${JSON.stringify(actual)} for ${JSON.stringify(expected)}`];
  const publicEffects = seen.floating.filter((effect) => effect.rememberedSource !== undefined);
  const actualEffects = measuredView.floating.filter((effect) => publicEffects.some((expected) => expected.id === effect.id));
  if (canonicalHash(publicEffects) !== canonicalHash(actualEffects)) {
    problems.push(`observed fixed effects ${JSON.stringify(actualEffects)} for ${JSON.stringify(publicEffects)}`);
  }
  if (canonicalHash(seen.linkedBanished ?? []) !== canonicalHash(measuredView.linkedBanished ?? [])) {
    problems.push("linked Banished cells disagree with the observed source objects");
  }
  const linkedQueue = (view: BattleView) => view.triggerQueue.filter((trigger) => trigger.source !== null && trigger.linkedSource !== undefined)
    .map(({ source, ability, linkedSource }) => ({ source, ability, linkedSource }));
  if (canonicalHash(linkedQueue(seen)) !== canonicalHash(linkedQueue(measuredView))) {
    problems.push("queued linked source objects disagree with their retained contexts");
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
    const seen = engine.view(state, side);
    const sampled = engine.determinize(seen, decklists, () => random.next());
    const anonymousEffects = new Set(SIDES.flatMap((owner) => seen.hiddenCards?.[owner] ?? []).flatMap((record) => record.effects.map((effect) => effect.id)));
    const problems = [
      ...legalActionDivergences(engine, state, sampled, side),
      ...publicCardDivergences(state, sampled),
      ...anonymousDivergences(engine, seen, sampled, side),
      ...effectDivergences("floating", state, state.floating.filter((effect) => owedFloating(state, effect, side)), sampled, sampled.floating.filter((effect) => !anonymousEffects.has(effect.id)), side),
      ...effectDivergences("payable", state, state.payable, sampled, sampled.payable, side),
    ];
    return problems.map((problem) => `${side}'s determinization: ${problem}`);
  });
}


import { linkedPosition } from "../rules/linked-banish";
/**
 * Position hashes for loop detection (rules § Infinite Loops). A loop
 * signature abstracts away the monotone resources an optional loop may gain
 * or spend, and every counter that only advances. The cycle hash compares
 * complete states for mandatory cycles. Both ignore bookkeeping that never
 * affects play: the step version, the automatic-step count, the loop
 * tracker, the zone-entry clock, and the absolute values of zone-entry
 * timestamps, of which only the order matters (RD-hv-7x4l.9-2).
 */
import { canonicalHash, type StateHash } from "../state/hash";
import type { Side } from "../state/ids";
import { oncePerTurnParts, opponent, SIDES } from "../state/ids";
import type { BattleState, CardInstance, FloatingEffect, SideState } from "../state/types";
import type { LoopResources, LoopSignature, SideResources } from "./types";

/**
 * How the loop signature treats a state field:
 * - `position`: part of the position, hashed into the signature;
 * - `resource`: a monotone quantity an optional loop may gain or spend, or a
 *   counter that only advances, abstracted away;
 * - `bookkeeping`: never affects play, or is fixed for the whole battle, and
 *   is ignored.
 */
type SignatureRole = "position" | "resource" | "bookkeeping";

/*
 * The role of every field of `SideState` and `BattleState`: the compiler
 * flags a field added to either interface until it is classified here.
 */
const SIDE_FIELDS = {
  score: "resource",
  currentEnergy: "resource",
  maxEnergy: "resource",
  fatigueCount: "position",
  deck: "resource",
  hand: "position",
  void: "resource",
  banished: "position",
  backRank: "position",
  frontRank: "position",
  avatar: "position",
  dreamsigns: "position",
} as const satisfies Record<keyof SideState, SignatureRole>;

const STATE_FIELDS = {
  version: "bookkeeping",
  seed: "bookkeeping",
  rng: "resource",
  nextInstance: "resource",
  clock: "bookkeeping",
  config: "bookkeeping",
  draftPools: "bookkeeping",
  turn: "position",
  sides: "position",
  /** Projected: deck and void instances are dropped, and counters and gained spark zeroed. */
  instances: "position",
  /** Which hidden cards each side has seen informs no rule. */
  knownTo: "bookkeeping",
  rememberedCards: "bookkeeping",
  linkedBanished: "position",
  stack: "position",
  priority: "position",
  payable: "position",
  triggerQueue: "position",
  floating: "position",
  /**
   * Current-turn play, draw, discard, departure, dissolve, abandon,
   * materialization and Dawn-ability admission history only grows within a main
   * window. Its physical occurrences, captured characteristics and figment
   * provenance share that resource role (RD-hv-7x4l.36-1,
   * RD-hv-umm2.692-1); replay checks actual rules against the recording.
   */
  turnLog: "resource",
  characterScoring: "position",
  nextEffect: "resource",
  oncePerTurn: "position",
  dreamwell: "position",
  challenge: "position",
  automaticSteps: "bookkeeping",
  automaticChoices: "bookkeeping",
  loops: "bookkeeping",
  result: "position",
} as const satisfies Record<keyof BattleState, SignatureRole>;

/** The fields of a table with the `position` role. */
type PositionField<Fields extends Readonly<Record<string, SignatureRole>>> = {
  [K in keyof Fields]: Fields[K] extends "position" ? K : never;
}[keyof Fields];

function positionFields<Fields extends Readonly<Record<string, SignatureRole>>>(fields: Fields): readonly PositionField<Fields>[] {
  return Object.keys(fields).filter((key) => fields[key] === "position") as PositionField<Fields>[];
}

const SIDE_POSITION = positionFields(SIDE_FIELDS);
const STATE_POSITION = positionFields(STATE_FIELDS);

/** The values of `fields` in `value`, keyed by field. */
function pick<T, K extends keyof T & string>(value: T, fields: readonly K[]): Record<K, T[K]> {
  return Object.fromEntries(fields.map((field) => [field, value[field]])) as Record<K, T[K]>;
}

/** Each timestamp's rank among `values`, so equal orders give equal ranks. */
function ranks(values: readonly number[]): Map<number, number> {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return new Map(sorted.map((value, index) => [value, index]));
}

function rankedFloating(floating: readonly FloatingEffect[], rank: Map<number, number>): unknown[] {
  return floating.map((effect) => ({ ...effect, timestamp: rank.get(effect.timestamp) ?? 0 }));
}

function rankedInstances(
  instances: readonly CardInstance[],
  rank: Map<number, number>,
  project: (instance: CardInstance) => CardInstance,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const instance of instances) {
    result[instance.id] = { ...project(instance), enteredZoneAt: rank.get(instance.enteredZoneAt) ?? 0 };
  }
  return result;
}

function timestampRanks(instances: readonly CardInstance[], floating: readonly FloatingEffect[]): Map<number, number> {
  return ranks([...instances.map((instance) => instance.enteredZoneAt), ...floating.map((effect) => effect.timestamp)]);
}

/**
 * Static allowances name only the current physical zone object. Its source
 * and ability identify a live allowance; the matching clock value is
 * redundant. Read all instances here, including public void sources which
 * the optional-loop position otherwise projects as resources. Ordinary
 * activated, triggered, and emblem records retain their turn lifetimes.
 */
function liveAllowances(state: BattleState): unknown[] {
  return state.oncePerTurn.flatMap((key): unknown[] => {
    const { source, ability, enteredZoneAt } = oncePerTurnParts(key);
    if (enteredZoneAt === null) return [key];
    const instance = Object.values(state.instances).find((card) => card.id === source);
    if (instance?.enteredZoneAt !== enteredZoneAt) return [];
    return [["static", source, ability]];
  });
}

/**
 * The loop signature of a checkpoint: the `position` fields of the state and
 * of each side (`STATE_FIELDS`, `SIDE_FIELDS`), with the instances outside
 * decks and voids, their counters and gained spark zeroed, and zone-entry
 * timestamps replaced by their ranks.
 */
export function loopSignature(state: BattleState): LoopSignature {
  const instances = Object.values(state.instances).filter((instance) => instance.zone !== "deck" && instance.zone !== "void");
  const rank = timestampRanks(instances, state.floating);
  const projected = {
    sides: { player: pick(state.sides.player, SIDE_POSITION), enemy: pick(state.sides.enemy, SIDE_POSITION) },
    instances: rankedInstances(instances, rank, (instance) => ({
      ...instance,
      status: { ...instance.status, counters: 0, gainedSpark: 0 },
    })),
    floating: rankedFloating(state.floating, rank),
    oncePerTurn: liveAllowances(state),
    ...linkedPosition(state),
  } satisfies Partial<Record<PositionField<typeof STATE_FIELDS>, unknown>>;
  return canonicalHash<LoopSignature>({ ...pick(state, STATE_POSITION), ...projected });
}

/** Each side's monotone resources. */
export function loopResources(state: BattleState): LoopResources {
  const of = (side: Side): SideResources => {
    const controlled = Object.values(state.instances).filter((instance) => instance.controller === side);
    const sideState = state.sides[side];
    return {
      score: sideState.score,
      currentEnergy: sideState.currentEnergy,
      maxEnergy: sideState.maxEnergy,
      deck: sideState.deck.length,
      counters: controlled.reduce((total, instance) => total + instance.status.counters, 0),
      gainedSpark: controlled.reduce((total, instance) => total + instance.status.gainedSpark, 0),
    };
  };
  return { player: of("player"), enemy: of("enemy") };
}

const RESOURCE_KEYS: readonly (keyof SideResources)[] = ["score", "currentEnergy", "maxEnergy", "deck", "counters", "gainedSpark"];

/**
 * Whether the change from `before` to `after` gained something for `actor`
 * and nothing for the opponent: no resource of the actor fell, none of the
 * opponent's rose, and at least one changed.
 */
export function gainsFor(actor: Side, before: LoopResources, after: LoopResources): boolean {
  let changed = false;
  for (const side of SIDES) {
    for (const key of RESOURCE_KEYS) {
      const delta = after[side][key] - before[side][key];
      if (delta === 0) continue;
      if ((side === actor && delta < 0) || (side === opponent(actor) && delta > 0)) return false;
      changed = true;
    }
  }
  return changed;
}

/**
 * The hash of the complete state for mandatory-cycle detection: equal
 * exactly when two states are the same apart from bookkeeping.
 */
export function cycleHash(state: BattleState): StateHash {
  const instances = Object.values(state.instances);
  const rank = timestampRanks(instances, state.floating);
  const { version: _version, automaticSteps: _steps, automaticChoices: _choices, loops: _loops, clock: _clock, instances: _instances, floating: _floating, rememberedCards: _remembered, ...rest } = state;
  return canonicalHash<StateHash>({
    ...rest,
    instances: rankedInstances(instances, rank, (instance) => instance),
    floating: rankedFloating(state.floating, rank),
    oncePerTurn: liveAllowances(state),
    ...linkedPosition(state),
  });
}

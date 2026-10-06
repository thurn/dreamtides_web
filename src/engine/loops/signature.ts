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
import { opponent, SIDES } from "../state/ids";
import type { BattleState, CardInstance, FloatingEffect } from "../state/types";
import type { LoopResources, LoopSignature, SideResources } from "./types";

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
 * The loop signature of a checkpoint: every part of the state except the
 * monotone resources (scores, current and maximum energy, counters, gained
 * spark), the deck and void contents, the turn counters, the minted-id and
 * random-stream counters, and bookkeeping.
 */
export function loopSignature(state: BattleState): LoopSignature {
  const instances = Object.values(state.instances).filter((instance) => instance.zone !== "deck" && instance.zone !== "void");
  const rank = timestampRanks(instances, state.floating);
  const side = (which: Side) => {
    const { fatigueCount, hand, banished, backRank, frontRank, avatar, dreamsigns } = state.sides[which];
    return { fatigueCount, hand, banished, backRank, frontRank, avatar, dreamsigns };
  };
  const projection = {
    turn: state.turn,
    sides: { player: side("player"), enemy: side("enemy") },
    instances: rankedInstances(instances, rank, (instance) => ({
      ...instance,
      status: { ...instance.status, counters: 0, gainedSpark: 0 },
    })),
    stack: state.stack,
    priority: state.priority,
    payable: state.payable,
    triggerQueue: state.triggerQueue,
    floating: rankedFloating(state.floating, rank),
    oncePerTurn: state.oncePerTurn,
    dreamwell: state.dreamwell,
    challenge: state.challenge,
    result: state.result,
  };
  return canonicalHash<LoopSignature>(projection);
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
  const { version: _version, automaticSteps: _steps, loops: _loops, clock: _clock, instances: _instances, floating: _floating, ...rest } = state;
  return canonicalHash<StateHash>({
    ...rest,
    instances: rankedInstances(instances, rank, (instance) => instance),
    floating: rankedFloating(state.floating, rank),
  });
}

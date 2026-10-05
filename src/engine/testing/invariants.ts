import type { EngineCatalog } from "../catalog";
import { serializeState, stateHash, deserializeState } from "../state/hash";
import type { InstanceId, Zone } from "../state/ids";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";

/** Every rules invariant that must hold after every committed step. Returns the violations. */
export function invariantViolations(state: BattleState, catalog: EngineCatalog): string[] {
  const problems: string[] = [];
  const seen = new Map<InstanceId, Zone>();
  const record = (id: InstanceId, zone: Zone): void => {
    if (seen.has(id)) {
      problems.push(`${id} appears in ${seen.get(id) ?? "?"} and ${zone}`);
    }
    seen.set(id, zone);
  };
  for (const side of SIDES) {
    const sideState = state.sides[side];
    for (const zone of ["deck", "hand", "void", "banished"] as const) {
      for (const id of sideState[zone]) {
        record(id, zone);
        const instance = state.instances[id];
        if (instance?.zone !== zone || instance.controller !== side) {
          problems.push(`${id} listed in ${side} ${zone} but recorded as ${instance?.zone ?? "missing"} of ${instance?.controller ?? "nobody"}`);
        } else if (zone !== "hand" && instance.owner !== side) {
          // Only a hand may hold a card the other side owns.
          problems.push(`${id} listed in ${side} ${zone} but owned by ${instance.owner}`);
        }
      }
    }
    if (sideState.backRank.length !== BACK_RANK_SIZE || sideState.frontRank.length !== FRONT_RANK_SIZE) {
      problems.push(`${side} rank sizes changed`);
    }
    for (const id of [...sideState.backRank, ...sideState.frontRank]) {
      if (id === null) continue;
      record(id, "play");
      const instance = state.instances[id];
      if (instance?.zone !== "play" || instance.controller !== side) {
        problems.push(`${id} in ${side} play but recorded as ${instance?.zone ?? "missing"}`);
      } else if (catalog.card(instance.cardId).cardType !== "character") {
        problems.push(`${id} is in play but is not a character`);
      }
    }
    if (sideState.score < 0 || sideState.currentEnergy < 0 || sideState.maxEnergy < 0) {
      problems.push(`${side} has a negative score or energy`);
    }
  }
  for (const item of state.stack) {
    if (item.kind !== "card") continue;
    record(item.instance, "stack");
    if (state.instances[item.instance]?.zone !== "stack") {
      problems.push(`${item.instance} on the stack but recorded elsewhere`);
    }
  }
  if (seen.size !== Object.keys(state.instances).length) {
    problems.push(`${String(Object.keys(state.instances).length - seen.size)} instances are in no zone`);
  }
  if (state.result === null && (state.stack.length === 0) !== (state.priority === null)) {
    problems.push("priority must be held exactly while the stack is non-empty");
  }
  if (stateHash(deserializeState(serializeState(state))) !== stateHash(state)) {
    problems.push("serialization round-trip changed the state hash");
  }
  return problems;
}

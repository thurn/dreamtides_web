import { printedCard, type EngineCatalog } from "../catalog";
import { checkpointSide } from "../loops/tracker";
import { changedInstance } from "../rules/floating";
import { characteristics } from "../continuous/characteristics";
import { adjustedEnergy, costModifier } from "../continuous/costs";
import { Layers } from "../continuous/layers";
import { fixedEnergy } from "../dsl/energy";
import { playCosts } from "../rules/costs";
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
        } else if (instance.printing.kind !== "card") {
          problems.push(`figment ${id} is in ${side} ${zone}; figments exist only in play`);
        } else if (zone !== "hand" && instance.status.created) {
          problems.push(`created card ${id} is in ${side} ${zone} instead of ceasing to exist`);
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
      } else if (printedCard(catalog, instance.printing).cardType !== "character") {
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
    } else if (state.instances[item.instance]?.printing.kind !== "card") {
      problems.push(`figment ${item.instance} is on the stack; figments exist only in play`);
    }
  }
  if (seen.size !== Object.keys(state.instances).length) {
    problems.push(`${String(Object.keys(state.instances).length - seen.size)} instances are in no zone`);
  }
  if (state.result === null && (state.stack.length === 0) !== (state.priority === null)) {
    problems.push("priority must be held exactly while the stack is non-empty");
  }
  // A floating effect never outlives the cards it changes or the boundary it lasts until.
  for (const effect of state.floating) {
    const { change, expiry } = effect;
    const changed = changedInstance(change);
    if (changed !== null && state.instances[changed] === undefined) {
      problems.push(`floating effect ${effect.id} changes ${changed}, which no longer exists`);
    }
    if (expiry.at === "paid" && !state.payable.some((payable) => payable.id === expiry.effect)) {
      problems.push(`floating effect ${effect.id} outlived its payable effect`);
    }
    if (expiry.at === "sourceLeavesPlay" && state.instances[expiry.source]?.zone !== "play") {
      problems.push(`floating effect ${effect.id} outlived its source leaving play`);
    }
  }
  // Effective characteristics: spark and costs never go below 0, and the
  // memoized evaluation of a committed state matches a fresh one.
  const fresh = new Layers(state, catalog);
  const memoized = characteristics(state, catalog);
  for (const instance of Object.values(state.instances)) {
    const card = fresh.of(instance.id);
    if (card.spark !== null && card.spark < 0) problems.push(`${instance.id} has negative spark ${String(card.spark)}`);
    if (instance.zone !== "play" && instance.status.exhausted) problems.push(`${instance.id} is exhausted outside play`);
    if (memoized !== fresh && JSON.stringify(memoized.of(instance.id)) !== JSON.stringify(card)) {
      problems.push(`${instance.id} has memoized characteristics that differ from a fresh evaluation`);
    }
    if (instance.zone === "hand") {
      const definition = printedCard(catalog, instance.printing);
      const cost = adjustedEnergy(fixedEnergy(playCosts(definition, instance.variant)), costModifier(state, catalog, instance.id, instance.controller, fresh));
      if (cost < 0) problems.push(`${instance.id} has a negative effective cost`);
    }
  }
  // The loop shortcut: a repetition runs only for the loop on offer, and a
  // loop is offered only at its player's checkpoint.
  const { candidate, run } = state.loops;
  if (run !== null && (candidate?.id !== run.loop || state.result !== null)) {
    problems.push(`loop run ${run.loop} has no matching loop on offer or outlived the battle`);
  }
  if (candidate !== null && run === null && checkpointSide(state) !== candidate.side) {
    problems.push(`loop ${candidate.id} is on offer away from its player's checkpoint`);
  }
  if (stateHash(deserializeState(serializeState(state))) !== stateHash(state)) {
    problems.push("serialization round-trip changed the state hash");
  }
  return problems;
}

import type { InstanceId, Side, Slot, Zone } from "../state/ids";
import { BACK_RANK_SIZE } from "../state/ids";
import type { BattleState, CardInstance } from "../state/types";
import type { StepContext } from "../steps/types";

export function instanceOf(state: BattleState, id: InstanceId): CardInstance {
  const instance = state.instances[id];
  if (instance === undefined) {
    throw new Error(`Unknown instance ${id}`);
  }
  return instance;
}

/** The play-area position of an instance in play, or `null`. */
export function slotOf(state: BattleState, id: InstanceId): Slot | null {
  const instance = instanceOf(state, id);
  if (instance.zone !== "play") {
    return null;
  }
  const side = state.sides[instance.controller];
  const back = side.backRank.indexOf(id);
  if (back >= 0) {
    return { rank: "back", index: back };
  }
  const front = side.frontRank.indexOf(id);
  if (front >= 0) {
    return { rank: "front", index: front };
  }
  throw new Error(`Instance ${id} is in play without a position`);
}

export function occupant(state: BattleState, side: Side, slot: Slot): InstanceId | null {
  const rank = slot.rank === "front" ? state.sides[side].frontRank : state.sides[side].backRank;
  return rank[slot.index] ?? null;
}

export function setOccupant(
  state: BattleState,
  side: Side,
  slot: Slot,
  id: InstanceId | null,
): void {
  const rank = slot.rank === "front" ? state.sides[side].frontRank : state.sides[side].backRank;
  rank[slot.index] = id;
}

export function openBackSlots(state: BattleState, side: Side): number {
  return state.sides[side].backRank.filter((id) => id === null).length;
}

export function leftmostOpenBackSlot(state: BattleState, side: Side): Slot | null {
  const index = state.sides[side].backRank.indexOf(null);
  return index < 0 || index >= BACK_RANK_SIZE ? null : { rank: "back", index };
}

/** Every instance a side controls in play, back rank B0→B9 then front rank F0→F8. */
export function charactersInPlay(state: BattleState, side: Side): InstanceId[] {
  const { backRank, frontRank } = state.sides[side];
  return [...backRank, ...frontRank].filter((id): id is InstanceId => id !== null);
}

/** Removes an instance from whatever zone list holds it. */
function detach(state: BattleState, instance: CardInstance): void {
  switch (instance.zone) {
    case "play": {
      const slot = slotOf(state, instance.id);
      if (slot !== null) {
        setOccupant(state, instance.controller, slot, null);
      }
      return;
    }
    case "stack": {
      state.stack = state.stack.filter((item) => item.instance !== instance.id);
      return;
    }
    default: {
      const owner = state.sides[instance.owner];
      const list = owner[instance.zone];
      const index = list.indexOf(instance.id);
      if (index < 0) {
        throw new Error(`Instance ${instance.id} is missing from ${instance.zone}`);
      }
      list.splice(index, 1);
    }
  }
}

/**
 * Moves an instance to a non-play zone of its owner. Every zone change except
 * entering play goes through here.
 */
export function moveInstance(
  ctx: StepContext,
  id: InstanceId,
  to: Exclude<Zone, "play" | "stack">,
  position: "top" | "bottom" = "top",
): void {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  detach(state, instance);
  instance.controller = instance.owner;
  instance.zone = to;
  instance.enteredZoneAt = ++state.clock;
  const list = state.sides[instance.owner][to];
  if (position === "top") {
    list.unshift(id);
  } else {
    list.push(id);
  }
  if (to !== "deck" && to !== "hand") {
    instance.status.exhausted = false;
  }
}

/** Moves an instance onto the top of the stack under `controller`. */
export function moveToStack(ctx: StepContext, id: InstanceId, controller: Side): void {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  detach(state, instance);
  instance.controller = controller;
  instance.zone = "stack";
  instance.enteredZoneAt = ++state.clock;
  state.stack.push({ instance: id, controller });
}

/**
 * Puts a character into play under `side` at `slot` (rules § Materialize). It
 * enters exhausted unless awakened.
 */
export function enterPlay(
  ctx: StepContext,
  id: InstanceId,
  side: Side,
  slot: Slot,
): void {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  if (occupant(state, side, slot) !== null) {
    throw new Error(`Slot ${slot.rank}${String(slot.index)} is occupied`);
  }
  detach(state, instance);
  instance.controller = side;
  instance.zone = "play";
  instance.enteredZoneAt = ++state.clock;
  instance.status.exhausted = !ctx.catalog
    .card(instance.cardId)
    .keywords.includes("awakened");
  setOccupant(state, side, slot, id);
  ctx.emit({ kind: "materialized", instance: id, side, slot });
}

/** Dissolves a character in play into its owner's void. */
export function dissolve(ctx: StepContext, id: InstanceId): void {
  const instance = instanceOf(ctx.state, id);
  const side = instance.controller;
  moveInstance(ctx, id, "void");
  ctx.emit({ kind: "dissolved", instance: id, side });
}

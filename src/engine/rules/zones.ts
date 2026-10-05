import type { InstanceId, Side, Slot, Zone } from "../state/ids";
import { BACK_RANK_SIZE } from "../state/ids";
import type { BattleState, CardInstance } from "../state/types";
import type { StepContext } from "../steps/types";
import { hasKeyword } from "./keywords";

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
      state.stack = state.stack.filter((item) => item.kind !== "card" || item.instance !== instance.id);
      return;
    }
    default: {
      // A hand belongs to the side holding the card; every other zone list to its owner, who controls it there.
      const holder = state.sides[instance.controller];
      const list = holder[instance.zone];
      const index = list.indexOf(instance.id);
      if (index < 0) {
        throw new Error(`Instance ${instance.id} is missing from ${instance.zone}`);
      }
      list.splice(index, 1);
    }
  }
}

/**
 * Moves an instance to a non-play zone of `holder`, its owner unless a card
 * goes into another side's hand. Leaving play clears its counters (rules §
 * Counters).
 */
function relocate(
  ctx: StepContext,
  id: InstanceId,
  to: Exclude<Zone, "play" | "stack">,
  position: "top" | "bottom",
  holder: Side,
): void {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  const leavingPlay = instance.zone === "play";
  detach(state, instance);
  instance.controller = holder;
  instance.zone = to;
  instance.enteredZoneAt = ++state.clock;
  const list = state.sides[holder][to];
  if (position === "top") {
    list.unshift(id);
  } else {
    list.push(id);
  }
  if (to !== "deck" && to !== "hand") {
    instance.status.exhausted = false;
  }
  if (leavingPlay) {
    instance.status.counters = 0;
  }
  instance.status.x = null;
}

/**
 * Moves an instance to a non-play zone of its owner. Every zone change except
 * entering play and going into another side's hand goes through here.
 */
export function moveInstance(
  ctx: StepContext,
  id: InstanceId,
  to: Exclude<Zone, "play" | "stack">,
  position: "top" | "bottom" = "top",
): void {
  relocate(ctx, id, to, position, instanceOf(ctx.state, id).owner);
}

/**
 * Puts a card into `side`'s hand, at the bottom. Its owner is unchanged: a
 * card in your hand is yours to play while its owner stays its owner, and it
 * goes to its owner's deck, void, or Banished zone when it leaves (rules §
 * Zones → Hand).
 */
export function moveToHand(ctx: StepContext, id: InstanceId, side: Side): void {
  relocate(ctx, id, "hand", "bottom", side);
}

/** Moves an instance onto the top of the stack under `controller`, with its play-time choices. */
export function moveToStack(
  ctx: StepContext,
  id: InstanceId,
  controller: Side,
  choices: {
    readonly modes: readonly number[];
    readonly targets: readonly (readonly InstanceId[])[];
    readonly x: number | null;
    readonly optionalPaid: readonly boolean[];
  } = { modes: [], targets: [], x: null, optionalPaid: [] },
): void {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  detach(state, instance);
  instance.controller = controller;
  instance.zone = "stack";
  instance.enteredZoneAt = ++state.clock;
  state.stack.push({
    kind: "card",
    instance: id,
    controller,
    modes: [...choices.modes],
    targets: choices.targets.map((list) => [...list]),
    x: choices.x,
    optionalPaid: [...choices.optionalPaid],
  });
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
  instance.status.exhausted = !hasKeyword(state, ctx.catalog, id, "awakened");
  setOccupant(state, side, slot, id);
  ctx.emit({ kind: "materialized", instance: id, side, slot });
}

/**
 * A created card ceases to exist (rules § Created Cards): it leaves its zone
 * and the battle, and is in no zone afterwards.
 */
export function ceaseToExist(ctx: StepContext, id: InstanceId): void {
  const { state } = ctx;
  detach(state, instanceOf(state, id));
  state.instances = Object.fromEntries(
    Object.entries(state.instances).filter(([key]) => key !== id),
  );
  ctx.emit({ kind: "ceasedToExist", instance: id });
}

/** Dissolves a character in play into its owner's void. */
export function dissolve(ctx: StepContext, id: InstanceId): void {
  const instance = instanceOf(ctx.state, id);
  const side = instance.controller;
  moveInstance(ctx, id, "void");
  ctx.emit({ kind: "dissolved", instance: id, side });
}

/** Banishes a card, from play or another zone, to its owner's Banished zone. */
export function banish(ctx: StepContext, id: InstanceId): void {
  const instance = instanceOf(ctx.state, id);
  const side = instance.controller;
  moveInstance(ctx, id, "banished");
  ctx.emit({ kind: "banished", instance: id, side });
}

/** Returns a card in play to its owner's hand. */
export function returnToHand(ctx: StepContext, id: InstanceId): void {
  const instance = instanceOf(ctx.state, id);
  moveInstance(ctx, id, "hand", "bottom");
  ctx.emit({ kind: "returnedToHand", instance: id, side: instance.owner });
}

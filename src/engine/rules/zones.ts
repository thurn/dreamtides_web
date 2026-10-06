/**
 * Zone changes (engine-design § Zones and zone changes). Every move of an
 * instance between zones goes through here, and `relocate` applies the
 * zone-change replacements in order:
 *
 * 1. a created card (every figment is one) ceases to exist instead of
 *    entering a deck, a hand, a void, or the Banished zone; a dissolved one
 *    fires ▸Dissolved first;
 * 2. a reclaimed card is banished instead of any other zone change, without
 *    ▸Dissolved;
 * 3. Veil: a dissolve by an effect the opponent controls removes Veil
 *    instead (RD-hv-7x4l.8-1).
 */
import type { AbilitySource, InstanceId, Side, Slot, Zone } from "../state/ids";
import { BACK_RANK_SIZE } from "../state/ids";
import type { BattleState, CardInstance, FloatingEffect, Printing } from "../state/types";
import type { Variant } from "../dsl/types";
import { freshStatus } from "../state/create";
import type { StepContext } from "../steps/types";
import { addFloating, endChangesTo, expireAt } from "./floating";
import { hasKeyword } from "./keywords";
import { forgetCeased } from "./payable";
import { departKnowledge, settleKnowledge } from "../view/knowledge";

export function instanceOf(state: BattleState, id: InstanceId): CardInstance {
  const instance = state.instances[id];
  if (instance === undefined) {
    throw new Error(`Unknown instance ${id}`);
  }
  return instance;
}

/** Whether an instance is a figment or a figment copy: it exists only in play. */
export function isFigment(instance: CardInstance): boolean {
  return instance.printing.kind !== "card";
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

/**
 * Announces that an instance is about to leave play or the void for `to`
 * (`null` when it ceases to exist), while it is still there, so "leaves" triggers
 * see it as it last was. Leaving play ends effects lasting while it is in play.
 */
function depart(ctx: StepContext, instance: CardInstance, to: Zone | null): void {
  if (instance.zone === "play" && to !== "play") {
    ctx.emit({ kind: "leftPlay", instance: instance.id, side: instance.controller, to });
    expireAt(ctx, { at: "sourceLeavesPlay", source: instance.id });
  } else if (instance.zone === "void") {
    ctx.emit({ kind: "leftVoid", instance: instance.id, side: instance.controller, to });
  }
}

/**
 * Removes an instance from whatever zone list holds it. Leaving a hand ends
 * Ephemeral. Returns the sides that could identify it there, who keep
 * knowing it if it goes to a hidden zone (view/knowledge.ts).
 */
function detach(state: BattleState, instance: CardInstance): Side[] {
  const seers = departKnowledge(state, instance);
  removeFromZone(state, instance);
  return seers;
}

function removeFromZone(state: BattleState, instance: CardInstance): void {
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
      if (instance.zone === "hand") instance.status.ephemeral = false;
    }
  }
}

/**
 * Moves an instance to a non-play zone of `holder`, its owner unless a card
 * goes into another side's hand, after the replacements: a created card
 * ceases to exist instead, and a reclaimed card goes to its owner's Banished
 * zone instead. It is never exhausted outside play: exhaustion marks a
 * character in play (rules § Exhaust and Awaken), and a card that returns to
 * play enters exhausted unless awakened. Leaving play clears its counters
 * (rules § Counters). Returns the zone it went to, or `null` when it ceased
 * to exist.
 */
function relocate(
  ctx: StepContext,
  id: InstanceId,
  to: Exclude<Zone, "play" | "stack">,
  position: "top" | "bottom",
  holder: Side,
): Zone | null {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  if (instance.status.created) {
    ceaseToExist(ctx, id);
    return null;
  }
  const destination = instance.status.reclaimed ? "banished" : to;
  const receiver = destination === "hand" ? holder : instance.owner;
  const leavingPlay = instance.zone === "play";
  depart(ctx, instance, destination);
  const seers = detach(state, instance);
  instance.controller = receiver;
  instance.zone = destination;
  instance.enteredZoneAt = ++state.clock;
  const list = state.sides[receiver][destination];
  if (position === "top") {
    list.unshift(id);
  } else {
    list.push(id);
  }
  settleKnowledge(state, instance, seers);
  instance.status.exhausted = false;
  if (leavingPlay) {
    instance.status.counters = 0;
  }
  instance.status.x = null;
  return destination;
}

/**
 * Moves an instance to a non-play zone of its owner, applying the zone-change
 * replacements. Every zone change except entering play, the stack, and
 * another side's hand goes through here. Returns where it went, or `null`
 * when it ceased to exist.
 */
export function moveInstance(
  ctx: StepContext,
  id: InstanceId,
  to: Exclude<Zone, "play" | "stack">,
  position: "top" | "bottom" = "top",
): Zone | null {
  return relocate(ctx, id, to, position, instanceOf(ctx.state, id).owner);
}

/**
 * Puts a card into `side`'s hand, at the bottom. Its owner is unchanged: a
 * card in your hand is yours to play while its owner stays its owner, and it
 * goes to its owner's deck, void, or Banished zone when it leaves (rules §
 * Zones → Hand).
 */
export function moveToHand(ctx: StepContext, id: InstanceId, side: Side): Zone | null {
  return relocate(ctx, id, "hand", "bottom", side);
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
    readonly slot?: Slot;
  } = { modes: [], targets: [], x: null, optionalPaid: [] },
): void {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  depart(ctx, instance, "stack");
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
    ...(choices.slot === undefined ? {} : { slot: choices.slot }),
  });
}

/**
 * Puts a character into play under `side` at `slot` (rules § Materialize). It
 * enters exhausted unless awakened, as it is once in play: the keywords are
 * read after it takes its position, so static abilities that cover
 * characters in play, its own included, apply.
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
  depart(ctx, instance, "play");
  detach(state, instance);
  instance.controller = side;
  instance.zone = "play";
  instance.enteredZoneAt = ++state.clock;
  setOccupant(state, side, slot, id);
  instance.status.exhausted = !hasKeyword(state, ctx.catalog, id, "awakened");
  ctx.emit({ kind: "materialized", instance: id, side, slot });
}

/** `slot` when it is an open back-rank position of `side`, else the leftmost open one, or `null` when the back rank is full. */
export function placement(state: BattleState, side: Side, slot?: Slot): Slot | null {
  return slot !== undefined && slot.rank === "back" && slot.index >= 0 && slot.index < BACK_RANK_SIZE && occupant(state, side, slot) === null
    ? slot
    : leftmostOpenBackSlot(state, side);
}

/**
 * Materializes a card from a zone other than the stack under `side`, in
 * `slot` if it is open, else the leftmost open back-rank position (rules §
 * Materialize). With the back rank full it stays where it is (rules §
 * Battlefield Capacity), and a reclaimed card never leaves the Banished
 * zone. Returns whether it entered play.
 */
export function materialize(ctx: StepContext, id: InstanceId, side: Side, slot?: Slot): boolean {
  const instance = instanceOf(ctx.state, id);
  if (instance.status.reclaimed) return false;
  const position = placement(ctx.state, side, slot);
  if (position === null) {
    ctx.emit({ kind: "capacityReached", side, instance: id, missing: 1 });
    return false;
  }
  enterPlay(ctx, id, side, position);
  return true;
}

/**
 * Creates a card new to the battle in `zone`, owned by `owner`, without
 * listing it in any zone: the caller places it. Created cards cease to exist
 * whenever they would enter a deck, a hand, a void, or the Banished zone.
 */
export function createInstance(
  ctx: StepContext,
  printing: Printing,
  owner: Side,
  variant: Variant,
  zone: Zone,
): CardInstance {
  const { state } = ctx;
  const id: InstanceId = `i${state.nextInstance}`;
  state.nextInstance += 1;
  const instance: CardInstance = {
    id,
    printing,
    owner,
    controller: owner,
    zone,
    variant: { ...variant },
    status: freshStatus(true),
    enteredZoneAt: ++state.clock,
  };
  state.instances[id] = instance;
  ctx.emit({ kind: "cardCreated", instance: id, side: owner, printing, zone });
  return instance;
}

/** Creates a character directly in play under `side` at the open `slot`, as a materialize. */
export function createInPlay(ctx: StepContext, printing: Printing, side: Side, variant: Variant, slot: Slot): InstanceId {
  const instance = createInstance(ctx, printing, side, variant, "play");
  setOccupant(ctx.state, side, slot, instance.id);
  instance.status.exhausted = !hasKeyword(ctx.state, ctx.catalog, instance.id, "awakened");
  ctx.emit({ kind: "materialized", instance: instance.id, side, slot });
  return instance.id;
}

/**
 * A created card ceases to exist (rules § Created Cards): it leaves its zone
 * and the battle, and is in no zone afterwards. The floating effects
 * changing it end, and it leaves the payable effects that affect it
 * (payable.ts `forgetCeased`). A dissolved one emits
 * `dissolved` as it leaves, so its ▸Dissolved abilities fire first. With
 * `silent`, as when a figment merges, it announces nothing that could
 * trigger.
 */
export function ceaseToExist(
  ctx: StepContext,
  id: InstanceId,
  options: { readonly dissolved?: boolean; readonly abandoned?: boolean; readonly silent?: boolean } = {},
): void {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  const side = instance.controller;
  if (options.silent === true) {
    if (instance.zone === "play") expireAt(ctx, { at: "sourceLeavesPlay", source: id });
  } else {
    depart(ctx, instance, null);
  }
  if (options.abandoned === true) ctx.emit({ kind: "abandoned", instance: id, side });
  if (options.dissolved === true) ctx.emit({ kind: "dissolved", instance: id, side });
  detach(state, instance);
  state.instances = Object.fromEntries(
    Object.entries(state.instances).filter(([key]) => key !== id),
  );
  endChangesTo(ctx, id);
  forgetCeased(ctx, id);
  ctx.emit({ kind: "ceasedToExist", instance: id });
}

/**
 * Dissolves a character in play into its owner's void; `by` is the side
 * controlling the dissolving effect, `null` for a challenge or an abandon.
 * The replacements apply in order (RD-hv-7x4l.8-1): a created character
 * ceases to exist after firing ▸Dissolved, still a dissolve; a reclaimed
 * one is banished instead, which is no longer a dissolve; then Veil turns a
 * dissolve by the opponent's effect into losing Veil. An `abandoned`
 * character is announced as abandoned once it has left play, before
 * `dissolved` (rules § Abandon).
 */
export function dissolve(ctx: StepContext, id: InstanceId, by: Side | null, abandoned = false): void {
  const { state, catalog } = ctx;
  const instance = instanceOf(state, id);
  const side = instance.controller;
  if (instance.status.reclaimed) {
    banish(ctx, id);
    if (abandoned) ctx.emit({ kind: "abandoned", instance: id, side });
    return;
  }
  if (by !== null && by !== side && hasKeyword(state, catalog, id, "veil")) {
    const source: AbilitySource = id;
    addFloating(ctx, { controller: by, source, expiry: { at: "never" }, change: { kind: "keyword", instance: id, keyword: "veil", gains: false } });
    return;
  }
  if (instance.status.created) {
    ceaseToExist(ctx, id, { dissolved: true, abandoned });
    return;
  }
  moveInstance(ctx, id, "void");
  if (abandoned) ctx.emit({ kind: "abandoned", instance: id, side });
  ctx.emit({ kind: "dissolved", instance: id, side });
}

/** Banishes a card, from play or another zone, to its owner's Banished zone; a created card ceases to exist instead. */
export function banish(ctx: StepContext, id: InstanceId): void {
  const side = instanceOf(ctx.state, id).controller;
  if (moveInstance(ctx, id, "banished") === "banished") {
    ctx.emit({ kind: "banished", instance: id, side });
  }
}

/** Returns a card in play to its owner's hand; a created card ceases to exist instead, a reclaimed one is banished. */
export function returnToHand(ctx: StepContext, id: InstanceId): void {
  const instance = instanceOf(ctx.state, id);
  const side = instance.controller;
  const went = moveInstance(ctx, id, "hand", "bottom");
  if (went === "hand") ctx.emit({ kind: "returnedToHand", instance: id, side: instance.owner });
  if (went === "banished") ctx.emit({ kind: "banished", instance: id, side });
}

/**
 * Gain control (rules § Keywords and Effects): moves a character in play to
 * `side`'s leftmost open back-rank position, keeping its state, exhausted
 * through this turn's Ending even if awakened. It is not a materialize and
 * not a zone change. Fails, returning `false`, when that back rank is full.
 */
export function gainControl(ctx: StepContext, id: InstanceId, side: Side): boolean {
  const { state } = ctx;
  const instance = instanceOf(state, id);
  const from = slotOf(state, id);
  if (from === null || instance.controller === side) return false;
  const to = leftmostOpenBackSlot(state, side);
  if (to === null) {
    ctx.emit({ kind: "capacityReached", side, instance: id, missing: 1 });
    return false;
  }
  const previous = instance.controller;
  setOccupant(state, previous, from, null);
  instance.controller = side;
  instance.status.exhausted = true;
  setOccupant(state, side, to, id);
  ctx.emit({ kind: "controlChanged", instance: id, from: previous, to: side, slot: to });
  return true;
}

/**
 * What happens as a floating effect ends, beyond its changes ending: a card
 * banished until then returns to play under the side recorded, as a
 * materialize (F3; it stays banished when that back rank is full), and a
 * temporary created character ceases to exist (C5). Nothing happens when
 * the card has since moved or ceased to exist.
 */
export function floatingEnded(ctx: StepContext, effect: FloatingEffect): void {
  const { change } = effect;
  if (change.kind !== "banishedUntil" && change.kind !== "temporary") return;
  const instance = ctx.state.instances[change.instance];
  if (change.kind === "banishedUntil" && instance?.zone === "banished") {
    materialize(ctx, change.instance, change.side);
  } else if (change.kind === "temporary" && instance?.zone === "play") {
    ceaseToExist(ctx, change.instance);
  }
}

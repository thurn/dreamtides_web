/** Removing cards from the stack without resolving them (rules § Keywords and Effects → Prevent). */
import type { InstanceId, Side } from "../state/ids";
import type { StepContext } from "../steps/types";
import { ceaseToExist, instanceOf, moveInstance, moveToHand } from "./zones";

/**
 * Where a prevented card goes: its owner's void, or a variant's "top of its
 * owner's deck", "its owner's hand", or "your hand" (the preventing
 * player's hand, while its owner stays its owner).
 */
export type PreventDestination = "void" | "deckTop" | "ownerHand" | "yourHand";

/**
 * Prevents the card `id` on the stack for `preventer`, the controller of the
 * prevent effect: it leaves the stack without resolving and goes to
 * `destination`. A created card ceases to exist instead, and a reclaimed
 * card is banished instead.
 */
export function preventCard(
  ctx: StepContext,
  id: InstanceId,
  destination: PreventDestination,
  preventer: Side,
): void {
  const instance = instanceOf(ctx.state, id);
  if (instance.zone !== "stack") {
    throw new Error(`Instance ${id} is not on the stack`);
  }
  const side = instance.controller;
  const owner = instance.owner;
  if (instance.status.created) {
    ctx.emit({ kind: "prevented", instance: id, side, to: null, zoneOf: null });
    ceaseToExist(ctx, id);
    return;
  }
  if (instance.status.reclaimed) {
    moveInstance(ctx, id, "banished");
    ctx.emit({ kind: "prevented", instance: id, side, to: "banished", zoneOf: owner });
    return;
  }
  switch (destination) {
    case "void":
      moveInstance(ctx, id, "void");
      ctx.emit({ kind: "prevented", instance: id, side, to: "void", zoneOf: owner });
      return;
    case "deckTop":
      moveInstance(ctx, id, "deck", "top");
      ctx.emit({ kind: "prevented", instance: id, side, to: "deck", zoneOf: owner });
      return;
    case "ownerHand":
      moveToHand(ctx, id, owner);
      ctx.emit({ kind: "prevented", instance: id, side, to: "hand", zoneOf: owner });
      return;
    case "yourHand":
      moveToHand(ctx, id, preventer);
      ctx.emit({ kind: "prevented", instance: id, side, to: "hand", zoneOf: preventer });
      return;
  }
}

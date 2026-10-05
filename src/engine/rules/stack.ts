/** Removing cards from the stack without resolving them (rules § Keywords and Effects → Prevent). */
import type { InstanceId } from "../state/ids";
import type { StepContext } from "../steps/types";
import { ceaseToExist, instanceOf, moveInstance } from "./zones";

/** Where a prevented card goes: its owner's void, or a variant's "top of its owner's deck" or "its owner's hand". */
export type PreventDestination = "void" | "deckTop" | "hand";

/**
 * Prevents the card `id` on the stack: it leaves the stack without
 * resolving and goes to `destination` of its owner. A created card ceases
 * to exist instead, and a reclaimed card is banished instead.
 */
export function preventCard(ctx: StepContext, id: InstanceId, destination: PreventDestination): void {
  const instance = instanceOf(ctx.state, id);
  if (instance.zone !== "stack") {
    throw new Error(`Instance ${id} is not on the stack`);
  }
  const side = instance.controller;
  if (instance.status.created) {
    ctx.emit({ kind: "prevented", instance: id, side, to: null });
    ceaseToExist(ctx, id);
    return;
  }
  if (instance.status.reclaimed) {
    moveInstance(ctx, id, "banished");
    ctx.emit({ kind: "prevented", instance: id, side, to: "banished" });
    return;
  }
  switch (destination) {
    case "void":
      moveInstance(ctx, id, "void");
      ctx.emit({ kind: "prevented", instance: id, side, to: "void" });
      return;
    case "deckTop":
      moveInstance(ctx, id, "deck", "top");
      ctx.emit({ kind: "prevented", instance: id, side, to: "deck" });
      return;
    case "hand":
      moveInstance(ctx, id, "hand", "bottom");
      ctx.emit({ kind: "prevented", instance: id, side, to: "hand" });
      return;
  }
}

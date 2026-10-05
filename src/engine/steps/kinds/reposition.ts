import { instanceOf, occupant, setOccupant, slotOf } from "../../rules/zones";
import type { InstanceId, Slot } from "../../state/ids";
import type { StepDefinition } from "../types";

/** Moves a character to another position; onto an occupied position, the two swap. */
export interface RepositionStep {
  readonly kind: "reposition";
  readonly card: InstanceId;
  readonly to: Slot;
}

export const reposition: StepDefinition<RepositionStep> = {
  kind: "reposition",
  run(ctx, step) {
    const { state } = ctx;
    const side = instanceOf(state, step.card).controller;
    const from = slotOf(state, step.card);
    if (from === null) {
      throw new Error(`Card ${step.card} is not in play`);
    }
    const other = occupant(state, side, step.to);
    setOccupant(state, side, step.to, step.card);
    setOccupant(state, side, from, other);
    ctx.emit({
      kind: "repositioned",
      instance: step.card,
      side,
      from,
      to: step.to,
      swappedWith: other,
    });
  },
};

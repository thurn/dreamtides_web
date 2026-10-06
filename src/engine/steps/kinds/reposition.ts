import { mergeable, mergeFigments } from "../../rules/figments";
import { instanceOf, occupant, setOccupant, slotOf } from "../../rules/zones";
import type { InstanceId, Slot } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Moves a character to another position; onto an occupied position, the two
 * swap, except that a figment moved onto a figment with the same identity
 * merges into it (rules § Merging Figments).
 */
export interface RepositionStep {
  readonly kind: "reposition";
  readonly card: InstanceId;
  readonly to: Slot;
}

export const reposition: StepDefinition<RepositionStep> = {
  kind: "reposition",
  canceller: () => null,
  run(ctx, step) {
    const { state } = ctx;
    const side = instanceOf(state, step.card).controller;
    const from = slotOf(state, step.card);
    if (from === null) {
      throw new Error(`Card ${step.card} is not in play`);
    }
    const other = occupant(state, side, step.to);
    if (other !== null && mergeable(state, step.card, other)) {
      mergeFigments(ctx, step.card, other);
      return;
    }
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

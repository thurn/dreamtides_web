import { canPlayFromHand } from "../../rules/timing";
import { instanceOf, moveToStack } from "../../rules/zones";
import type { InstanceId } from "../../state/ids";
import { opponent } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Plays a card from hand: play-time choices, then the commit point, then the
 * cost, then the card moves to the stack and the opponent receives priority.
 */
export interface PlayStep {
  readonly kind: "play";
  readonly card: InstanceId;
}

export const play: StepDefinition<PlayStep> = {
  kind: "play",
  run(ctx, step) {
    const { state, catalog } = ctx;
    const instance = instanceOf(state, step.card);
    const side = instance.owner;
    if (!canPlayFromHand(state, catalog, side, step.card)) {
      throw new Error(`Card ${step.card} cannot be played now`);
    }
    ctx.commitPoint();
    const cost = catalog.card(instance.cardId).cost ?? 0;
    state.sides[side].currentEnergy -= cost;
    ctx.emit({
      kind: "energyChanged",
      side,
      current: state.sides[side].currentEnergy,
      max: state.sides[side].maxEnergy,
    });
    moveToStack(ctx, step.card, side);
    ctx.emit({ kind: "cardPlayed", side, instance: step.card });
    state.priority = opponent(side);
  },
};

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
  canceller: (state, step) => state.instances[step.card]?.owner ?? null,
  run(ctx, step) {
    const { state, catalog } = ctx;
    const instance = instanceOf(state, step.card);
    const side = instance.owner;
    if (!canPlayFromHand(state, catalog, side, step.card)) {
      throw new Error(`Card ${step.card} cannot be played now`);
    }
    const definition = catalog.card(instance.cardId);
    const choices = definition.synthetic?.play?.(ctx, step.card) ?? {};
    ctx.commitPoint();
    const cost = (definition.cost ?? 0) + (choices.x ?? 0);
    state.sides[side].currentEnergy -= cost;
    ctx.emit({
      kind: "energyChanged",
      side,
      current: state.sides[side].currentEnergy,
      max: state.sides[side].maxEnergy,
    });
    moveToStack(ctx, step.card, side, { targets: choices.targets ?? [], x: choices.x ?? null });
    ctx.emit({ kind: "cardPlayed", side, instance: step.card });
    state.priority = opponent(side);
  },
};

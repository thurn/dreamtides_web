import { eventTargetSpecs } from "../../effects/abilities";
import { chooseTargets, chooseX } from "../../effects/interpreter";
import { canPlayFromHand } from "../../rules/timing";
import { instanceOf, moveToStack } from "../../rules/zones";
import type { InstanceId } from "../../state/ids";
import { opponent } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Plays a card from hand: play-time choices (X, then targets), then the
 * commit point, then the cost, then the card moves to the stack and the
 * opponent receives priority.
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
    let x: number | null = null;
    let targets: (readonly (readonly InstanceId[])[]) = [];
    if (definition.synthetic?.play !== undefined) {
      const choices = definition.synthetic.play(ctx, step.card);
      x = choices.x ?? null;
      targets = choices.targets ?? [];
    } else {
      if (definition.cost === null) {
        x = chooseX(ctx, side, step.card, state.sides[side].currentEnergy);
      }
      targets = eventTargetSpecs(definition, instance.variant).flatMap((specs) =>
        chooseTargets(ctx, specs, side, step.card),
      );
    }
    ctx.commitPoint();
    const cost = (definition.cost ?? 0) + (x ?? 0);
    state.sides[side].currentEnergy -= cost;
    ctx.emit({
      kind: "energyChanged",
      side,
      current: state.sides[side].currentEnergy,
      max: state.sides[side].maxEnergy,
    });
    moveToStack(ctx, step.card, side, { targets, x });
    ctx.emit({ kind: "cardPlayed", side, instance: step.card });
    if (definition.status === "pending") {
      ctx.emit({ kind: "pendingAbility", side, cardId: instance.cardId, instance: step.card, reason: "played" });
    }
    state.priority = opponent(side);
  },
};

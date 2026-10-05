import { eventAbilities } from "../../effects/abilities";
import { chooseTargets, chooseX, purposeOf } from "../../effects/interpreter";
import { spendEnergy } from "../../rules/resources";
import { canPlayFromHand } from "../../rules/timing";
import { instanceOf, moveToStack } from "../../rules/zones";
import type { InstanceId } from "../../state/ids";
import { opponent } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Plays a card from hand: play-time choices (X, then targets), then the
 * commit point, then the cost, then the card moves to the stack and the
 * opponent receives priority (D13).
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
    let targets: readonly (readonly InstanceId[])[] = [];
    if (definition.synthetic?.play !== undefined) {
      const choices = definition.synthetic.play(ctx, step.card);
      x = choices.x ?? null;
      targets = choices.targets ?? [];
    } else {
      if (definition.cost === null) {
        const purpose = purposeOf(step.card, instance.cardId, 0, "chooseX");
        x = chooseX(ctx, side, purpose, state.sides[side].currentEnergy);
      }
      targets = eventAbilities(definition, instance.variant).flatMap((ability) =>
        chooseTargets(ctx, ability.targets, side, step.card, purposeOf(step.card, instance.cardId, ability.ability, "target")),
      );
    }
    ctx.commitPoint();
    spendEnergy(ctx, side, (definition.cost ?? 0) + (x ?? 0));
    moveToStack(ctx, step.card, side, { targets, x });
    ctx.emit({ kind: "cardPlayed", side, instance: step.card });
    if (definition.status === "pending") {
      ctx.emit({ kind: "pendingAbility", side, cardId: instance.cardId, instance: step.card, reason: "played" });
    }
    state.priority = opponent(side);
  },
};

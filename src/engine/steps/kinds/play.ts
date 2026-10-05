import { eventAbilities } from "../../effects/abilities";
import { chooseModes, chooseTargets, chosenModes, collectTargets, purposeOf } from "../../effects/interpreter";
import { chooseX, payCosts } from "../../rules/costs";
import { canPlayFromHand } from "../../rules/timing";
import { instanceOf, moveToStack } from "../../rules/zones";
import type { InstanceId } from "../../state/ids";
import { opponent } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Plays a card from hand: play-time choices (X, then each event ability's
 * modes, then its targets), then the commit point, then the costs (the fixed
 * part, then X), then the card moves to the stack and the opponent receives
 * priority (D13).
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
    const purpose = (ability: number, role: string) => purposeOf(step.card, instance.cardId, ability, role);
    let x: number | null;
    let modes: readonly number[];
    let targets: readonly (readonly InstanceId[])[];
    if (definition.synthetic?.play !== undefined) {
      const choices = definition.synthetic.play(ctx, step.card);
      x = choices.x ?? null;
      modes = choices.modes ?? [];
      targets = choices.targets ?? [];
    } else {
      x = chooseX(ctx, side, definition.costs, purpose(0, "chooseX"));
      const abilities = eventAbilities(definition, instance.variant);
      const abilityModes = abilities.map((ability) =>
        chooseModes(ctx, ability.effect, side, step.card, purpose(ability.ability, "chooseOne")),
      );
      targets = abilities.flatMap((ability, index) =>
        chooseTargets(
          ctx,
          collectTargets(ability.effect, chosenModes(ability.effect, abilityModes[index] ?? [])),
          side,
          step.card,
          purpose(ability.ability, "target"),
        ),
      );
      modes = abilityModes.flat();
    }
    ctx.commitPoint();
    payCosts(ctx, side, step.card, definition.costs, x, []);
    moveToStack(ctx, step.card, side, { modes, targets, x });
    ctx.emit({ kind: "cardPlayed", side, instance: step.card });
    if (definition.status === "pending") {
      ctx.emit({ kind: "pendingAbility", side, cardId: instance.cardId, instance: step.card, reason: "played" });
    }
    state.priority = opponent(side);
  },
};

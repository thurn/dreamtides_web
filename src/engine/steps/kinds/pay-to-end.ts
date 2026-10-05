import { payableNow, payToEnd as pay } from "../../rules/payable";
import type { EffectId } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Pays to end an effect lasting "until the opponent pays N●" (C7): a special
 * action that does not use the stack, cannot be responded to, and leaves
 * priority and the phase unchanged.
 */
export interface PayToEndStep {
  readonly kind: "payToEnd";
  readonly effect: EffectId;
}

export const payToEnd: StepDefinition<PayToEndStep> = {
  kind: "payToEnd",
  canceller: () => null,
  run(ctx, step) {
    const effect = ctx.state.payable.find((entry) => entry.id === step.effect);
    if (effect === undefined || !payableNow(ctx.state, effect.payer).includes(effect)) {
      throw new Error(`Effect ${step.effect} cannot be paid off now`);
    }
    pay(ctx, step.effect);
  },
};

import { discardCost, energy, optionalCost } from "../../dsl/builders";
import { payCosts, planCosts } from "../../rules/costs";
import { resolveChosenEffect } from "../interpreter";
import { definePrimitive, type EffectNode } from "../types";

/** A fixed resolving payment; omitted amounts mean zero. */
export interface ResolvingPayment {
  readonly energy?: number;
  readonly discard?: number;
}

/** "You may pay the entire payment to resolve effect." */
export interface PayToNode {
  readonly op: "payTo";
  readonly payment: ResolvingPayment;
  readonly effect: EffectNode;
}

export const payToPrimitive = definePrimitive<PayToNode>({
  op: "payTo",
  deferred: (node) => [node.effect],
  resolve(ctx, node, env) {
    const energyAmount = node.payment.energy ?? 0;
    const discardAmount = node.payment.discard ?? 0;
    const costs = [
      ...(energyAmount > 0 ? [energy(energyAmount)] : []),
      ...(discardAmount > 0 ? [discardCost(discardAmount)] : []),
    ];
    const plan = planCosts(ctx, env.controller, env.source, [optionalCost(...costs)], null, (role) => env.purpose(role), []);
    if (!plan.optionalPaid[0]) return;
    payCosts(ctx, env.controller, env.source, plan);
    resolveChosenEffect(ctx, node.effect, env);
  },
});

/** Fixed energy and one exact hand-card demand, planned together before payment. */
export function payTo(payment: ResolvingPayment, effect: EffectNode): PayToNode {
  const energyAmount = payment.energy ?? 0;
  const discardAmount = payment.discard ?? 0;
  if (!Number.isFinite(energyAmount) || energyAmount < 0) throw new Error("payTo energy must be finite and nonnegative");
  if (!Number.isSafeInteger(discardAmount) || discardAmount < 0) throw new Error("payTo discard must be a nonnegative safe integer");
  return { op: "payTo", payment: { energy: energyAmount, discard: discardAmount }, effect };
}

import { startContinuous } from "../../continuous/resolve";
import type { Duration } from "../../dsl/types";
import type { InstanceId } from "../../state/ids";
import type { CardCostMode } from "../../state/types";
import type { StepContext } from "../../steps/types";
import { definePrimitive, type EffectEnv, type EffectNode } from "../types";

/**
 * "Return an enemy to hand. It costs 2● more", "Draw a ≤2● cost card. It
 * costs 0●", "Return this character to hand. It costs 0● this turn" (rules §
 * Costs, Requirements, and X → Cost changes): `effect` resolves first, and
 * each card it put into a hand gets a floating layer-6 `cardCost` change,
 * announced by `effectStarted`. `"set"` gives the card `amount`● in place of
 * its ● cost; `"increase"` makes it cost `amount`● more. When the effect put
 * no card into a hand (no target, an empty deck, no match, a created card
 * that ceased to exist), nothing changes (RD-hv-umm2.101-2). `duration`
 * `null` takes the enclosing `forDuration`'s, else the change is permanent
 * and travels with the card (rules § Durations).
 */
export interface ModifyCardCostNode {
  readonly op: "modifyCardCost";
  readonly effect: EffectNode;
  readonly mode: CardCostMode;
  readonly amount: number;
  readonly duration: Duration | null;
}

export const modifyCardCostPrimitive = definePrimitive<ModifyCardCostNode>({
  op: "modifyCardCost",
  children: (node) => [node.effect],
  resolve(ctx, node, env) {
    const ids = movedIntoHand(ctx, node.effect, env);
    startContinuous(
      ctx,
      env,
      node.duration,
      ids,
      ids.map((instance) => ({ kind: "cardCost", instance, mode: node.mode, amount: node.amount })),
    );
  },
});

/** The cards `effect` puts into a hand as it resolves, in the order they arrive. */
function movedIntoHand(ctx: StepContext, effect: EffectNode, env: EffectEnv): InstanceId[] {
  const since = ctx.state.clock;
  env.run(effect);
  return Object.values(ctx.state.instances)
    .filter((instance) => instance.enteredZoneAt > since && instance.zone === "hand")
    .sort((a, b) => a.enteredZoneAt - b.enteredZoneAt)
    .map((instance) => instance.id);
}

/**
 * "<effect>. It costs N●" (`{ set: N }`) or "It costs N● more" (`{
 * increase: N }`), for `duration` (or the enclosing `forDuration`'s, else
 * permanently). `effect` moves the card into a hand: a return to hand or a
 * draw.
 */
export function modifyCardCost(
  effect: EffectNode,
  cost: { readonly set: number } | { readonly increase: number },
  options: { readonly duration?: Duration } = {},
): ModifyCardCostNode {
  const [mode, amount]: [CardCostMode, number] = "set" in cost ? ["set", cost.set] : ["increase", cost.increase];
  if (!Number.isInteger(amount) || amount < 0) throw new Error("modifyCardCost takes a non-negative whole energy amount");
  return { op: "modifyCardCost", effect, mode, amount, duration: options.duration ?? null };
}

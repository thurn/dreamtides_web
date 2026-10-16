import type { ResolvingEffect } from "../registry";
import type { PayOrDeclinePrompt } from "../../prompts/types";
import { spendEnergy } from "../../rules/resources";
import { opponent } from "../../state/ids";
import { resolveChosenEffect } from "../interpreter";
import { definePrimitive, type ResolvingPrimitiveDefinition } from "../types";

/** Resolve `effect` unless the controller's opponent pays fixed energy during resolution. */
export interface UnlessPaysNode {
  readonly op: "unlessPays";
  readonly energy: number;
  readonly effect: ResolvingEffect;
}

function checkEnergy(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("unlessPays energy must be a nonnegative safe integer");
}

export const unlessPaysPrimitive: ResolvingPrimitiveDefinition<UnlessPaysNode> = definePrimitive<UnlessPaysNode>({
  op: "unlessPays",
  deferred: (node) => [node.effect],
  resolve(ctx, node, env) {
    checkEnergy(node.energy);
    const payer = opponent(env.controller);
    const pays = ctx.choose<PayOrDeclinePrompt>({
      kind: "payOrDecline",
      side: payer,
      purpose: env.purpose("opponentUnlessPays"),
      energy: node.energy,
      payable: ctx.state.sides[payer].currentEnergy >= node.energy,
    });
    if (pays) {
      spendEnergy(ctx, payer, node.energy);
      return;
    }
    resolveChosenEffect(ctx, node.effect, env);
  },
});

/** "Do effect unless the opponent pays N●"; unpaid choices retain the original ability's context. */
export function unlessPays(energy: number, effect: ResolvingEffect): UnlessPaysNode {
  checkEnergy(energy);
  return { op: "unlessPays", energy, effect };
}

import type { ConfirmPrompt } from "../../prompts/types";
import { instanceOf } from "../../rules/zones";
import { definePrimitive, type EffectNode } from "../types";

/** "You may …": the controller confirms or declines when the effect resolves. */
export interface OptionalNode {
  readonly op: "optional";
  readonly effect: EffectNode;
}

export const optionalPrimitive = definePrimitive<OptionalNode>({
  op: "optional",
  children: (node) => [node.effect],
  resolve(ctx, node, env) {
    const accepted = ctx.choose<ConfirmPrompt>({
      kind: "confirm",
      side: env.controller,
      purpose: { source: env.source, cardId: instanceOf(ctx.state, env.source).cardId, ability: 0, role: "youMay" },
    });
    if (accepted) env.run(node.effect);
  },
});

export function optional(effect: EffectNode): OptionalNode {
  return { op: "optional", effect };
}

import type { ChooseModePrompt } from "../../prompts/types";
import { instanceOf } from "../../rules/zones";
import { definePrimitive, type EffectNode } from "../types";

/**
 * "Choose one:" — the controller picks a mode when the effect resolves.
 * Modes whose targets need play-time choices belong in the play step and
 * arrive with the stack primitives.
 */
export interface ChooseOneNode {
  readonly op: "chooseOne";
  readonly modes: readonly EffectNode[];
}

export const chooseOnePrimitive = definePrimitive<ChooseOneNode>({
  op: "chooseOne",
  resolve(ctx, node, env) {
    const mode = ctx.choose<ChooseModePrompt>({
      kind: "chooseMode",
      side: env.controller,
      purpose: { source: env.source, cardId: instanceOf(ctx.state, env.source).cardId, ability: 0, role: "chooseOne" },
      options: node.modes.map((_, index) => ({ mode: index, legal: true })),
    });
    const chosen = node.modes[mode];
    if (chosen !== undefined) env.run(chosen);
  },
});

export function chooseOne(...modes: readonly EffectNode[]): ChooseOneNode {
  return { op: "chooseOne", modes };
}

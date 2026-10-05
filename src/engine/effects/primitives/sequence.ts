import { definePrimitive, type EffectNode } from "../types";

/** Several effects in order: "Draw a card. Gain 1●." */
export interface SequenceNode {
  readonly op: "sequence";
  readonly effects: readonly EffectNode[];
}

export const sequencePrimitive = definePrimitive<SequenceNode>({
  op: "sequence",
  children: (node) => node.effects,
  resolve(_ctx, node, env) {
    for (const effect of node.effects) env.run(effect);
  },
});

export function sequence(...effects: readonly EffectNode[]): SequenceNode {
  return { op: "sequence", effects };
}

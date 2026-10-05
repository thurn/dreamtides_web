import { definePrimitive, type EffectNode } from "../types";

/**
 * "Choose one:" — the controller picks a mode as the card is played or the
 * ability activated, before its targets; only the chosen mode's targets are
 * chosen, and the effect resolves the chosen mode. A mode whose required
 * targets have no candidates cannot be chosen.
 */
export interface ChooseOneNode {
  readonly op: "chooseOne";
  readonly modes: readonly EffectNode[];
}

export const chooseOnePrimitive = definePrimitive<ChooseOneNode>({
  op: "chooseOne",
  children: (node) => node.modes,
  modes: (node) => node.modes,
  resolve(_, node, env) {
    const mode = env.modeOf(node);
    const chosen = mode === null ? undefined : node.modes[mode];
    if (chosen === undefined) throw new Error("chooseOne resolved without a mode chosen at play time");
    env.run(chosen);
  },
});

export function chooseOne(...modes: readonly EffectNode[]): ChooseOneNode {
  return { op: "chooseOne", modes };
}

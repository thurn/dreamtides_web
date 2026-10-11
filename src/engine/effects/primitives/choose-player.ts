import type { PlayerRef } from "../../dsl/types";
import type { ChooseModePrompt } from "../../prompts/types";
import { resolveChosenEffect } from "../interpreter";
import { definePrimitive, type EffectNode } from "../types";

/** A controller-relative player choice made as the effect resolves. */
export interface ChoosePlayerNode {
  readonly op: "choosePlayer";
  /** The effect for each selected player; "you" inside either branch retains the ability's controller. */
  readonly you: EffectNode;
  readonly opponent: EffectNode;
}

export const choosePlayerPrimitive = definePrimitive<ChoosePlayerNode>({
  op: "choosePlayer",
  deferred: (node) => [node.you, node.opponent],
  resolve(ctx, node, env) {
    const choice = ctx.choose<ChooseModePrompt>({
      kind: "chooseMode",
      side: env.controller,
      purpose: env.purpose("choosePlayer"),
      options: [{ mode: 0, legal: true }, { mode: 1, legal: true }],
    });
    resolveChosenEffect(ctx, choice === 0 ? node.you : node.opponent, env);
  },
});

/**
 * "Choose a player. That player …": build both declarative branches using
 * the selected relative player. The choice changes who the named effects
 * affect, while the ability's source, controller and meaning of "you" stay fixed.
 */
export function choosePlayer(effect: (player: PlayerRef) => EffectNode): ChoosePlayerNode {
  return { op: "choosePlayer", you: effect("you"), opponent: effect("opponent") };
}

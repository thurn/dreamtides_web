import type { ResolvingEffect } from "../registry";
import type { EngineCatalog } from "../../catalog";
import { characteristics } from "../../continuous/characteristics";
import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import type { Side } from "../../state/ids";
import type { BattleState, RuleModifierInstruction } from "../../state/types";
import { definePrimitive, type StaticPrimitiveDefinition } from "../types";

/** The three player rules supplied by the battle Dreamsigns. */
export type RuleModifierNode = { readonly op: "ruleModifier"; readonly player: PlayerRef } & (
  | Exclude<RuleModifierInstruction, { readonly rule: "dawnThreshold" }>
  | (Extract<RuleModifierInstruction, { readonly rule: "dawnThreshold" }> & { readonly effect: ResolvingEffect })
);

/** Static rules read live; the threshold's child resolves later through the ordinary FIFO. */
export const ruleModifierPrimitive: StaticPrimitiveDefinition<RuleModifierNode> = definePrimitive<RuleModifierNode>({
  op: "ruleModifier",
  staticOnly: true,
  deferred: node => node.rule === "dawnThreshold" ? [node.effect] : [],
  continuous: {
    layer: 6,
    changes(node, env) {
      const player = resolvePlayer(env.controller, node.player);
      switch (node.rule) {
        case "eventAlternative": return [{ kind: "ruleModifier", player, rule: node.rule, energy: node.energy }];
        case "carryEnergy": return [{ kind: "ruleModifier", player, rule: node.rule }];
        case "dawnThreshold": return [{ kind: "ruleModifier", player, rule: node.rule, count: node.count }];
      }
    },
  },
});

/** A live player-scoped rule, held as a static ability's whole effect. */
export function ruleModifier(instruction: (
  | { readonly rule: "eventAlternative"; readonly energy: number }
  | { readonly rule: "carryEnergy" }
  | { readonly rule: "dawnThreshold"; readonly count: number; readonly effect: ResolvingEffect }
), player: PlayerRef = "you"): RuleModifierNode {
  return { op: "ruleModifier", player, ...instruction };
}

/** The current rule's replacement energy, or null when it supplies no route. Equivalent copies do not add routes. */
export function alternativeEventEnergy(state: BattleState, catalog: EngineCatalog, side: Side): number | null {
  const rule = characteristics(state, catalog).changes(6).find(({ change }) =>
    change.kind === "ruleModifier" && change.player === side && change.rule === "eventAlternative")?.change;
  return rule?.kind === "ruleModifier" && rule.rule === "eventAlternative" ? rule.energy : null;
}

/** Multiple sources hold one carry rule; each refresh still happens once. */
export function carriesEnergy(state: BattleState, catalog: EngineCatalog, side: Side): boolean {
  return characteristics(state, catalog).changes(6).some(({ change }) =>
    change.kind === "ruleModifier" && change.player === side && change.rule === "carryEnergy");
}

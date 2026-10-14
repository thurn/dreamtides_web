import { addFloating } from "../../rules/floating";
import { materializedThisTurn } from "../../rules/turn-log";
import type { InstanceId, Side } from "../../state/ids";
import type { FloatingEffect } from "../../state/types";
import type { StepContext } from "../../steps/types";
import { definePrimitive } from "../types";

/** The named player's successful materializations this turn have Awakened through Ending. */
export interface MaterializeKeywordModifierNode {
  readonly op: "materializeKeywordModifier";
}

function grantEntry(ctx: StepContext, instance: InstanceId, window: FloatingEffect): void {
  if (window.change.kind !== "materializeKeyword" || ctx.state.instances[instance] === undefined) return;
  addFloating(ctx, { controller: window.controller, source: window.source, expiry: window.expiry,
    change: { kind: "materializeKeyword", player: window.change.player, keyword: "awakened", instance } });
}

/** Called before a true entry's exhaustion check, or a rematerialization's announcement. */
export function applyMaterializeKeywordModifiers(ctx: StepContext, instance: InstanceId, side: Side): void {
  const windows = ctx.state.floating.filter(effect => effect.change.kind === "materializeKeyword" && effect.change.instance === null && effect.change.player === side);
  for (const window of windows) grantEntry(ctx, instance, window);
}

export const materializeKeywordModifierPrimitive = definePrimitive<MaterializeKeywordModifierNode>({
  op: "materializeKeywordModifier",
  resolve(ctx, _node, env) {
    const player = env.controller;
    const effect = addFloating(ctx, { controller: env.controller, source: env.source, expiry: { at: "endOfTurn" },
      change: { kind: "materializeKeyword", player, keyword: "awakened", instance: null } });
    const window = ctx.state.floating.find(entry => entry.id === effect)!;
    for (const instance of new Set(materializedThisTurn(ctx.state, player).map(card => card.instance))) grantEntry(ctx, instance, window);
  },
});

/** Both the eligibility window and each physical keyword grant end in this turn's Ending. */
export function materializeKeywordModifier(): MaterializeKeywordModifierNode {
  return { op: "materializeKeywordModifier" };
}

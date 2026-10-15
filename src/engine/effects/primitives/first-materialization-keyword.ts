import { characteristics } from "../../continuous/characteristics";
import { addFloating } from "../../rules/floating";
import { materializedCountThisTurn } from "../../rules/turn-log";
import type { InstanceId, Side } from "../../state/ids";
import type { StepContext } from "../../steps/types";
import { definePrimitive } from "../types";

/** The controller's first actual materialization each turn permanently gains Awakened. */
export interface FirstMaterializationKeywordNode {
  readonly op: "firstMaterializationKeyword";
}

export const firstMaterializationKeywordPrimitive = definePrimitive<FirstMaterializationKeywordNode>({
  op: "firstMaterializationKeyword",
  staticOnly: true,
  resolve() { throw new Error("First-materialization keywords belong to a static ability"); },
  continuous: {
    layer: 3,
    changes(_node, env) {
      return [{ kind: "firstMaterializationKeyword", player: env.controller, keyword: "awakened", instance: null }];
    },
  },
});

/** Called by the shared pre-announcement hook, before a true entry checks exhaustion. */
export function applyFirstMaterializationKeyword(ctx: StepContext, instance: InstanceId, side: Side): void {
  if (materializedCountThisTurn(ctx.state, side) !== 0) return;
  const grants = characteristics(ctx.state, ctx.catalog).changes(3).filter(entry =>
    entry.change.kind === "firstMaterializationKeyword" && entry.change.instance === null && entry.change.player === side);
  for (const grant of grants) {
    if (grant.staticSource === null) continue;
    addFloating(ctx, { controller: side, source: grant.staticSource, expiry: { at: "never" },
      change: { kind: "firstMaterializationKeyword", player: side, keyword: "awakened", instance } });
  }
}

/** A bounded static instruction; each source covers its controller's first occasion. */
export function firstMaterializationKeyword(): FirstMaterializationKeywordNode {
  return { op: "firstMaterializationKeyword" };
}

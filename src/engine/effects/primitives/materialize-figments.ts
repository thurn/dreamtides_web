import { resolvePlayer } from "../../dsl/selectors";
import { BASE_VARIANT, type PlayerRef, type ValueExpr } from "../../dsl/types";
import { createFigments } from "../../rules/figments";
import type { FigmentId } from "../../state/ids";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "Materialize N 1✦ Warrior figments": figments of one type, each with
 * `spark` base spark (the type's catalog spark when `null`), filling the
 * back rank and merging their spark at capacity (rules § Creating Figments
 * at Capacity).
 */
export interface MaterializeFigmentsNode {
  readonly op: "materializeFigments";
  readonly figment: FigmentId;
  readonly count: ValueExpr;
  readonly spark: number | null;
  readonly player: PlayerRef;
}

export const materializeFigmentsPrimitive = definePrimitive<MaterializeFigmentsNode>({
  op: "materializeFigments",
  entersPlay: true,
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const spark = node.spark ?? ctx.catalog.figment(node.figment).spark;
    createFigments(ctx, side, { kind: "figment", figment: node.figment, spark }, BASE_VARIANT, evaluate(ctx, node.count, env));
  },
});

export function materializeFigments(
  figment: FigmentId,
  count: ValueExpr = 1,
  options: { readonly spark?: number; readonly player?: PlayerRef } = {},
): MaterializeFigmentsNode {
  return { op: "materializeFigments", figment, count, spark: options.spark ?? null, player: options.player ?? "you" };
}

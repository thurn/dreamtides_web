import { createFigmentCopy } from "../../rules/copies";
import { resolveCards } from "../interpreter";
import { type CardRef, cardTarget, definePrimitive } from "../types";

/**
 * "Materialize a figment copy of …" (C5), optionally "0✦" and "until end of
 * turn", under the effect's controller.
 */
export interface MaterializeFigmentCopyNode {
  readonly op: "materializeFigmentCopy";
  readonly of: CardRef;
  readonly zeroSpark: boolean;
  readonly untilEndOfTurn: boolean;
}

export const materializeFigmentCopyPrimitive = definePrimitive<MaterializeFigmentCopyNode>({
  op: "materializeFigmentCopy",
  entersPlay: true,
  targets: (node) => cardTarget(node.of),
  resolve(ctx, node, env) {
    for (const id of resolveCards(ctx, node.of, env)) createFigmentCopy(ctx, id, env.controller, node.zeroSpark, node.untilEndOfTurn);
  },
});

export function materializeFigmentCopy(
  of: CardRef,
  options: { readonly zeroSpark?: boolean; readonly untilEndOfTurn?: boolean } = {},
): MaterializeFigmentCopyNode {
  return { op: "materializeFigmentCopy", of, zeroSpark: options.zeroSpark === true, untilEndOfTurn: options.untilEndOfTurn === true };
}

import { instanceCard } from "../../catalog";
import { createFigmentCopyFromValues } from "../../rules/copies";
import { definePrimitive } from "../types";

/** One confirmed abandonment's copiable values, materialized with base spark zero (C5). */
export interface CopyAbandonedSubjectAsFigmentNode {
  readonly op: "copyAbandonedSubjectAsFigment";
  readonly zeroSpark: true;
}

export const copyAbandonedSubjectAsFigmentPrimitive = definePrimitive<CopyAbandonedSubjectAsFigmentNode>({
  op: "copyAbandonedSubjectAsFigment",
  entersPlay: true,
  resolve(ctx, node, env) {
    if (node.zeroSpark !== true || env.abandonedCopy === undefined) {
      throw new Error("A zero-spark abandoned copy requires a confirmed abandonment");
    }
    const captured = structuredClone(env.abandonedCopy);
    // Resolve the catalog and variant before any instance allocation or creation event.
    const definition = instanceCard(ctx.catalog, captured);
    if (definition.cardType !== "character") throw new Error("An abandoned copy must describe a character");
    definition.abilities(captured.variant);
    createFigmentCopyFromValues(ctx, captured, env.controller, true, false);
  },
});

/** "Materialize a 0✦ figment copy of it" after the triggering character is abandoned. */
export function copyAbandonedSubjectAsFigment(options: { readonly zeroSpark: true }): CopyAbandonedSubjectAsFigmentNode {
  if (options?.zeroSpark !== true) throw new Error("An abandoned figment copy requires zeroSpark");
  return { op: "copyAbandonedSubjectAsFigment", zeroSpark: true };
}

import type { TargetSpec, ZoneCardSpec } from "../../dsl/types";
import { copyOnStack } from "../../rules/copies";
import { resolveCards } from "../interpreter";
import { type CardRef, cardTarget, definePrimitive } from "../types";

/**
 * "Copy it" or "Copy a card on the stack": a copy directly above the card,
 * controlled by the effect's controller, who may choose new modes and
 * targets (D15). It never names a character in play or a card in a zone.
 */
export interface CopyCardNode {
  readonly op: "copyCard";
  readonly card: Exclude<CardRef, TargetSpec | ZoneCardSpec>;
}

export const copyCardPrimitive = definePrimitive<CopyCardNode>({
  op: "copyCard",
  targets: (node) => cardTarget(node.card),
  resolve(ctx, node, env) {
    for (const id of resolveCards(ctx, node.card, env)) copyOnStack(ctx, id, env.controller);
  },
});

export function copyCard(card: Exclude<CardRef, TargetSpec | ZoneCardSpec>): CopyCardNode {
  return { op: "copyCard", card };
}

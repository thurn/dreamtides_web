import { copyOnStack } from "../../rules/copies";
import { resolveCards } from "../interpreter";
import { definePrimitive, type CardRef } from "../types";

/**
 * "Copy it" or "Copy a card on the stack": a copy directly above the card,
 * controlled by the effect's controller, who may choose new modes and
 * targets (D15).
 */
export interface CopyCardNode {
  readonly op: "copyCard";
  readonly card: CardRef;
}

export const copyCardPrimitive = definePrimitive<CopyCardNode>({
  op: "copyCard",
  targets: (node) => (node.card.kind === "stackTarget" ? [node.card] : []),
  resolve(ctx, node, env) {
    for (const id of resolveCards(ctx, node.card, env)) copyOnStack(ctx, id, env.controller);
  },
});

export function copyCard(card: CardRef): CopyCardNode {
  return { op: "copyCard", card };
}

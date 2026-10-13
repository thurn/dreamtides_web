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

/** A fixed number of independent copies of the same physical card on the stack. */
export interface CopyCardTimesNode {
  readonly op: "copyCardTimes";
  readonly card: CopyCardNode["card"];
  readonly times: number;
}

function checkTimes(times: number): void {
  if (!Number.isSafeInteger(times) || times < 0) {
    throw new RangeError("A copy count must be a non-negative safe integer");
  }
}

export const copyCardTimesPrimitive = definePrimitive<CopyCardTimesNode>({
  op: "copyCardTimes",
  targets: (node) => cardTarget(node.card),
  resolve(ctx, node, env) {
    checkTimes(node.times);
    for (const id of resolveCards(ctx, node.card, env)) {
      for (let index = 0; index < node.times; index++) copyOnStack(ctx, id, env.controller);
    }
  },
});

/** Copies are made directly above the original, each with its own modes and targets. */
export function copyCardTimes(card: CopyCardNode["card"], times: number): CopyCardTimesNode {
  checkTimes(times);
  return { op: "copyCardTimes", card, times };
}

import { createCopyInHand as createCopy } from "../../rules/copies";
import { resolveCards } from "../interpreter";
import { type CardRef, cardTarget, definePrimitive } from "../types";

/** "Add a copy of … to your hand", optionally an Ephemeral copy (C3). */
export interface CreateCopyInHandNode {
  readonly op: "createCopyInHand";
  readonly of: CardRef;
  readonly ephemeral: boolean;
}

export const createCopyInHandPrimitive = definePrimitive<CreateCopyInHandNode>({
  op: "createCopyInHand",
  targets: (node) => cardTarget(node.of),
  resolve(ctx, node, env) {
    for (const id of resolveCards(ctx, node.of, env)) createCopy(ctx, id, env.controller, node.ephemeral);
  },
});

export function createCopyInHand(of: CardRef, options: { readonly ephemeral?: boolean } = {}): CreateCopyInHandNode {
  return { op: "createCopyInHand", of, ephemeral: options.ephemeral === true };
}

import type { PayOrDeclinePrompt } from "../../prompts/types";
import { spendEnergy } from "../../rules/resources";
import { instanceOf, returnToHand } from "../../rules/zones";
import { resolveCards } from "../interpreter";
import { cardTarget, definePrimitive, type CardRef } from "../types";

/** Return the named cards from a void to their owners' hands, optionally paying energy as the effect resolves. */
export interface ReturnFromVoidNode {
  readonly op: "returnFromVoid";
  readonly subject: CardRef;
  /** The controller may pay this amount once to return the named cards; null means no payment. */
  readonly pay: number | null;
}

export const returnFromVoidPrimitive = definePrimitive<ReturnFromVoidNode>({
  op: "returnFromVoid",
  targets: (node) => cardTarget(node.subject),
  resolve(ctx, node, env) {
    const cards = resolveCards(ctx, node.subject, env).filter((id) => instanceOf(ctx.state, id).zone === "void");
    if (cards.length === 0) return;
    if (node.pay !== null) {
      const paid = ctx.choose<PayOrDeclinePrompt>({
        kind: "payOrDecline", side: env.controller, purpose: env.purpose("optionalPayment"),
        energy: node.pay, payable: ctx.state.sides[env.controller].currentEnergy >= node.pay,
      });
      if (!paid) return;
      spendEnergy(ctx, env.controller, node.pay);
    }
    for (const id of cards) returnToHand(ctx, id);
  },
});

/** Void targets are chosen before play/activation costs; self references are read at resolution. */
export function returnFromVoid(subject: CardRef, options: { readonly pay?: number } = {}): ReturnFromVoidNode {
  if (options.pay !== undefined && (!Number.isFinite(options.pay) || options.pay < 0)) {
    throw new Error("returnFromVoid payment must be finite and non-negative");
  }
  return { op: "returnFromVoid", subject, pay: options.pay ?? null };
}

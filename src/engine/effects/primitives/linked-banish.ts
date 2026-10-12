/** Private top-deck selection and the paired source object's later return (RD-hv-umm2.486-1). */
import type { ValueExpr } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { liveLinkedBanished, sameLinkedSource } from "../../rules/linked-banish";
import { banish, moveToHand } from "../../rules/zones";
import { randomDeckRemovalSettler } from "../../view/knowledge";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

export type LinkedBanishNode =
  | { readonly op: "linkedBanish"; readonly action: "look"; readonly count: ValueExpr }
  | { readonly op: "linkedBanish"; readonly action: "take"; readonly producerOffset: number };

export const linkedBanishPrimitive = definePrimitive<LinkedBanishNode>({
  op: "linkedBanish",
  resolve(ctx, node, env) {
    const context = env.linkedSource;
    if (context === null) throw new Error("Linked banishment needs a source object in play or retained by its trigger");
    ctx.state.linkedBanished = liveLinkedBanished(ctx.state, context);
    if (node.action === "take") {
      const producer = context.ability + node.producerOffset;
      const record = ctx.state.linkedBanished.find((entry) => sameLinkedSource(entry, context) && entry.ability === producer);
      for (const { instance: id } of record?.cards ?? []) {
        const before = ctx.state.instances[id];
        const holder = before.controller;
        if (moveToHand(ctx, id, env.controller) === "hand") ctx.emit({ kind: "cardTaken", instance: id, side: env.controller, from: "banished", holder });
        else if (ctx.state.instances[id]?.zone === "banished") ctx.emit({ kind: "banished", instance: id, side: holder });
      }
      return;
    }
    const side = env.controller;
    const count = Math.max(0, evaluate(ctx, node.count, env));
    const cards = ctx.state.sides[side].deck.slice(0, count);
    if (cards.length === 0) return;
    ctx.emit({ kind: "lookedAtTop", side, cards });
    const [chosen] = ctx.choose<ChooseCardsPrompt>({ kind: "chooseCards", side, privateTo: side,
      purpose: env.purpose("lookAtTopBanish"), candidates: cards, min: 1, max: 1 });
    if (chosen === undefined) throw new Error("Linked banishment answered without a card");
    // The looker knows the whole prefix; public text bounds the other viewer's anonymous removal.
    ctx.settlingKnowledge(randomDeckRemovalSettler(ctx.state, { [side]: { player: count, enemy: count } }), () => banish(ctx, chosen));
    const banished = ctx.state.instances[chosen];
    if (banished?.zone !== "banished") return;
    const record = ctx.state.linkedBanished.find((entry) => sameLinkedSource(entry, context) && entry.ability === context.ability);
    const member = { instance: chosen, enteredBanishedAt: banished.enteredZoneAt };
    if (record === undefined) ctx.state.linkedBanished.push({ ...context, cards: [member] });
    else ctx.state.linkedBanished = ctx.state.linkedBanished.map((entry) => entry === record ? { ...entry, cards: [...entry.cards, member] } : entry);
  },
});

/** Choose one of the top count cards to banish, linked to this producer ability occurrence. */
export function lookAtTopBanish(count: ValueExpr): LinkedBanishNode { return { op: "linkedBanish", action: "look", count }; }

/** Put the cards the paired earlier ability banished into this resolving controller's hand; not a draw. */
export function putLinkedBanishedInHand(producerOffset = -1): LinkedBanishNode {
  if (!Number.isSafeInteger(producerOffset) || producerOffset >= 0) throw new Error("A linked producer must be an earlier ability in the same definition");
  return { op: "linkedBanish", action: "take", producerOffset };
}

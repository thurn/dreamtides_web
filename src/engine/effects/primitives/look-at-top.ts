import type { ValueExpr } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { drawCard } from "../../rules/resources";
import type { InstanceId } from "../../state/ids";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "Look at the top N cards of your deck. Draw K of the cards" (rules §
 * Keywords and Effects → Look at the top N cards): the controller looks at
 * the top `count` cards of their deck (`lookedAtTop`, which names the cards
 * only to a side that can identify them), chooses `draw` of them in a prompt
 * private to them, and draws those, Ephemeral with `ephemeral` ("… and they
 * gain ephemeral"). Each is a draw (`cardDrawn`). The cards not drawn stay
 * on top of the deck in their order. With fewer cards than `draw`, every
 * looked-at card is drawn; with an empty deck nothing happens.
 */
export interface LookAtTopNode {
  readonly op: "lookAtTop";
  readonly count: ValueExpr;
  /** How many of the looked-at cards the controller draws: a positive safe integer. */
  readonly draw: number;
  readonly ephemeral: boolean;
}

export const lookAtTopPrimitive = definePrimitive<LookAtTopNode>({
  op: "lookAtTop",
  resolve(ctx, node, env) {
    const side = env.controller;
    const cards = ctx.state.sides[side].deck.slice(0, Math.max(0, evaluate(ctx, node.count, env)));
    if (cards.length === 0) return;
    ctx.emit({ kind: "lookedAtTop", side, cards });
    const count = Math.min(node.draw, cards.length);
    if (count <= 0) return;
    const chosen = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      privateTo: side,
      purpose: env.purpose("lookAtTop"),
      candidates: cards,
      min: count,
      max: count,
    });
    // Drawn in deck order: each chosen card is put on top and drawn from there, so the rest keep their order.
    for (const card of cards.filter((id) => chosen.includes(id))) {
      putOnTop(ctx.state.sides[side].deck, card);
      drawCard(ctx, side, node.ephemeral);
    }
  },
});

/** Moves `card`, which is in `deck`, to its top. */
function putOnTop(deck: InstanceId[], card: InstanceId): void {
  deck.splice(deck.indexOf(card), 1);
  deck.unshift(card);
}

export function lookAtTop(count: ValueExpr, options: { readonly draw: number; readonly ephemeral?: boolean }): LookAtTopNode {
  if (!Number.isSafeInteger(options.draw) || options.draw <= 0) throw new Error("lookAtTop draw must be a positive safe integer");
  return { op: "lookAtTop", count, draw: options.draw, ephemeral: options.ephemeral === true };
}

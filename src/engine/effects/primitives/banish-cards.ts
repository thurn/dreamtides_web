import { cardMatchesFilter } from "../../continuous/characteristics";
import type { CardFilter, ZoneCardSpec } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { startDuration } from "../../rules/durations";
import { addFloating } from "../../rules/floating";
import { banish } from "../../rules/zones";
import { opponent } from "../../state/ids";
import { resolveCards } from "../interpreter";
import { cardTarget, definePrimitive, type CapturedCardsSpec } from "../types";
import type { BanishUntilNode } from "./banish-until";

/**
 * "Banish your hand and void", "Banish up to two cards from the opponent's
 * void" (rules § Keywords and Effects → Banish): every card the zone
 * references name as the effect resolves, each once, in reference order,
 * moves to its owner's Banished zone through the ordinary zone change. Void
 * cards chosen as targets count only while they are still legal targets
 * (`noLegalTarget` otherwise). A created card ceases to exist instead. Each
 * banished card is announced by a public `banished` event, after `leftVoid`
 * for a card that leaves a void; a card from a hand or deck is shown to both
 * players as it enters the Banished zone. "Banish them" after a materialize
 * names the captured cards still in play (`CapturedCardsSpec`), which leave
 * play through the same zone change.
 */
export interface BanishNamedCardsNode {
  readonly op: "banishCards";
  readonly from: "cards";
  readonly cards: readonly (ZoneCardSpec | CapturedCardsSpec)[];
}

/**
 * "Banish a chosen character from the opponent's hand" (rules § Keywords and
 * Effects → Banish): as it resolves, the controller chooses one matching card
 * of the opponent's hand in a `chooseCards` prompt private to them with the
 * `banishChosen` role, which shows them the matching cards only, and banishes
 * it. With no matching card it does nothing. It is not a discard.
 */
export interface BanishChosenCardNode {
  readonly op: "banishCards";
  readonly from: "opponentHand";
  readonly filter: CardFilter;
  /** A bounded banishment returns the same card to its owner's hand. */
  readonly duration?: BanishUntilNode["duration"];
}

export type BanishCardsNode = BanishNamedCardsNode | BanishChosenCardNode;

export const banishCardsPrimitive = definePrimitive<BanishCardsNode>({
  op: "banishCards",
  targets: (node) => (node.from === "cards" ? node.cards.flatMap(cardTarget) : []),
  resolve(ctx, node, env) {
    if (node.from === "cards") {
      const named = [...new Set(node.cards.flatMap((ref) => resolveCards(ctx, ref, env)))];
      for (const id of named) banish(ctx, id);
      return;
    }
    const expiry = node.duration === undefined ? undefined : startDuration(ctx, node.duration, env.controller, env.source, []);
    if (expiry === null) return;
    const holder = opponent(env.controller);
    const candidates = ctx.state.sides[holder].hand.filter((id) => cardMatchesFilter(ctx.state, ctx.catalog, id, node.filter));
    if (candidates.length === 0) return;
    const [chosen] = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side: env.controller,
      privateTo: env.controller,
      purpose: env.purpose("banishChosen"),
      candidates,
      min: 1,
      max: 1,
    });
    if (chosen === undefined) throw new Error("banishChosen answered with no card");
    banish(ctx, chosen);
    const instance = ctx.state.instances[chosen];
    if (expiry !== undefined && instance?.zone === "banished") {
      addFloating(ctx, { controller: env.controller, source: env.source, expiry,
        change: { kind: "banishedToHandUntil", instance: chosen, banishedAt: instance.enteredZoneAt } });
    }
  },
});

/**
 * "Banish <cards>": every card the zone references name ("your hand and
 * void", "a card from the opponent's void"), or "banish them", the captured
 * cards of a `withMaterialized` binding (`capturedCards()`).
 */
export function banishCards(cards: readonly (ZoneCardSpec | CapturedCardsSpec)[]): BanishNamedCardsNode {
  if (cards.length === 0) throw new Error("banishCards needs at least one card reference");
  return { op: "banishCards", from: "cards", cards };
}

/** "Banish a chosen <filter> from the opponent's hand", chosen privately by the controller as it resolves. */
export function banishChosen(filter: CardFilter = {}, duration?: BanishChosenCardNode["duration"]): BanishChosenCardNode {
  return { op: "banishCards", from: "opponentHand", filter, ...(duration === undefined ? {} : { duration }) };
}

import type { ZoneCardSpec } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { shuffleDeck } from "../../rules/shuffle";
import { instanceOf, moveInstance } from "../../rules/zones";
import type { InstanceId, Side, Zone } from "../../state/ids";
import { SIDES } from "../../state/ids";
import { identifies } from "../../view/knowledge";
import { resolveCards } from "../interpreter";
import { cardTarget, definePrimitive } from "../types";

/**
 * "Shuffle <cards> into your deck" (rules § Keywords and Effects → Shuffle
 * into a deck). As it resolves:
 *
 * 1. the cards `cards` names (every card in the controller's hand or void,
 *    void cards chosen as targets, …) are collected, and with
 *    `chooseFromHand` the controller then chooses that many other cards of
 *    their hand (the whole rest of the hand when it holds fewer) in a
 *    `chooseCards` prompt with the `shuffleInto` role;
 * 2. each of them not already in a deck moves into its owner's deck through
 *    the ordinary zone change, so a created card ceases to exist instead and
 *    a card leaving a void is announced as leaving it (`leftVoid`);
 * 3. the controller's deck, and any other deck a card entered, is shuffled
 *    from its owner's `shuffle:<side>` stream, even when no card moved (so
 *    "shuffle the rest back" after a look at the top of the deck is
 *    `shuffleInto()`), and every card in it drops out of both sides'
 *    knowledge. A `shuffledIntoDeck` event per shuffled deck names the cards
 *    that entered it to the sides that could identify them as they left.
 */
export interface ShuffleIntoNode {
  readonly op: "shuffleInto";
  readonly cards: readonly ZoneCardSpec[];
  /** How many hand cards the controller chooses to shuffle in; 0 for none. */
  readonly chooseFromHand: number;
}

export const shuffleIntoPrimitive = definePrimitive<ShuffleIntoNode>({
  op: "shuffleInto",
  targets: (node) => node.cards.flatMap(cardTarget),
  resolve(ctx, node, env) {
    const side = env.controller;
    const named = [...new Set(node.cards.flatMap((ref) => resolveCards(ctx, ref, env)))];
    const hand = ctx.state.sides[side].hand.filter((id) => id !== env.source && !named.includes(id));
    const count = Math.min(node.chooseFromHand, hand.length);
    const chosen = count <= 0
      ? []
      : ctx.choose<ChooseCardsPrompt>({
          kind: "chooseCards",
          side,
          purpose: env.purpose("shuffleInto"),
          candidates: hand,
          min: count,
          max: count,
        });
    const entered: Record<Side, { cards: InstanceId[]; from: Zone[]; seenBy: Side[][] }> = {
      player: { cards: [], from: [], seenBy: [] },
      enemy: { cards: [], from: [], seenBy: [] },
    };
    for (const id of [...named, ...chosen]) {
      const instance = instanceOf(ctx.state, id);
      if (instance.zone === "deck") continue;
      const from = instance.zone;
      const seenBy = SIDES.filter((viewer) => identifies(ctx.state, id, viewer));
      const went = moveInstance(ctx, id, "deck");
      if (went === "deck") {
        const into = entered[instance.owner];
        into.cards.push(id);
        into.from.push(from);
        into.seenBy.push(seenBy);
      } else if (went === "banished") {
        // A reclaimed card is banished instead (rules § Zone Changes).
        ctx.emit({ kind: "banished", instance: id, side: instance.owner });
      }
    }
    for (const deck of SIDES.filter((owner) => owner === side || entered[owner].cards.length > 0)) {
      shuffleDeck(ctx.state, deck);
      ctx.emit({ kind: "shuffledIntoDeck", side: deck, ...entered[deck] });
    }
  },
});

/**
 * "Shuffle <cards> into your deck": the cards each reference names, then,
 * with `chooseFromHand`, that many hand cards the controller chooses as it
 * resolves ("shuffle 2 cards from your hand into your deck"). With neither,
 * it only shuffles the controller's deck ("shuffle the rest back").
 */
export function shuffleInto(
  cards: readonly ZoneCardSpec[] = [],
  options: { readonly chooseFromHand?: number } = {},
): ShuffleIntoNode {
  const chooseFromHand = options.chooseFromHand ?? 0;
  if (!Number.isSafeInteger(chooseFromHand) || chooseFromHand < 0) {
    throw new Error("shuffleInto chooseFromHand must be a non-negative safe integer");
  }
  return { op: "shuffleInto", cards, chooseFromHand };
}

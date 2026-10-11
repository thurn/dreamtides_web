import type { ValueExpr } from "../../dsl/types";
import type { ArrangeDestination, ArrangePrompt, ArrangeSlot } from "../../prompts/types";
import { charactersInPlay, instanceOf, moveInstance, moveToHand } from "../../rules/zones";
import type { InstanceId, Side, Zone } from "../../state/ids";
import { SIDES } from "../../state/ids";
import type { StepContext } from "../../steps/types";
import { forgetDeckPositions, identifies } from "../../view/knowledge";
import { evaluate, resolveCards } from "../interpreter";
import { cardTarget, definePrimitive, type CardRef } from "../types";

/** The end of a deck a card is put on. */
export type DeckEnd = "top" | "bottom";

/** Where a looked-at card goes, and how many go there: a number, or every card the other places leave over. */
export interface LookedAtPlace {
  readonly to: ArrangeDestination;
  readonly count: number | "rest";
}

/**
 * "Put <cards> on top of / on the bottom of <its owner's> deck" (rules §
 * Keywords and Effects → Put on top or on the bottom of a deck): each card
 * the references name moves to that end of its owner's deck through the
 * ordinary zone change, so a created card ceases to exist instead and a
 * reclaimed card is banished. Cards put there together keep the order the
 * source zones held them in, the first nearest the top. The deck is not
 * shuffled. Fully observed relocations and exact unfiltered top-prefix
 * moves retain inferable positions. An opaque same-deck relocation drops
 * that viewer's ambiguous deck tracking; the event keeps movement identity
 * visibility independently (view/knowledge.ts).
 */
export interface PutCardsInDeckNode {
  readonly op: "putInDeck";
  readonly from: "cards";
  readonly cards: readonly CardRef[];
  readonly at: DeckEnd;
}

/**
 * "Look at the top N cards of your deck. Put one on top of your deck, one on
 * the bottom of your deck, and one into your hand" (rules § Keywords and
 * Effects → Look at the top N cards): the controller looks at the top
 * `count` cards (`lookedAtTop`) and, in an `arrange` prompt private to them
 * with the `putInDeck` role, decides where each goes among `places`, in
 * printed order. With fewer cards than the counted places take, each
 * counted place takes at most its number and "rest" takes none.
 */
export interface PutLookedAtNode {
  readonly op: "putInDeck";
  readonly from: "lookAtTop";
  readonly count: ValueExpr;
  readonly places: readonly LookedAtPlace[];
}

export type PutInDeckNode = PutCardsInDeckNode | PutLookedAtNode;

/**
 * Every move announces itself: `cardsPlaced` for each group put on top of
 * or under a deck, or into a void, naming each card to the sides that can
 * identify it where it went, and `cardTaken` for a card put into the hand
 * (not a draw).
 */
export const putInDeckPrimitive = definePrimitive<PutInDeckNode>({
  op: "putInDeck",
  targets: (node) => (node.from === "cards" ? node.cards.flatMap(cardTarget) : []),
  resolve(ctx, node, env) {
    if (node.from === "cards") {
      const named = [...new Set(node.cards.flatMap((ref) => resolveCards(ctx, ref, env)))];
      const eligible = named.filter((id) => instanceOf(ctx.state, id).zone !== "stack");
      if (eligible.length === 0 && named.length > 0) ctx.emit({ kind: "noLegalTarget", source: env.source });
      const ordered = sourceZoneOrder(ctx, eligible);
      const seers = new Map(ordered.map((id) => [id, SIDES.filter((viewer) => identifies(ctx.state, id, viewer))]));
      const exactPrefix = node.cards.every((ref) => ref.kind === "inZone" && ref.pick === "top" && Object.keys(ref.filter).length === 0);
      if (!exactPrefix) forgetDeckPositions(ctx.state, ordered);
      placeAll(ctx, ordered, node.at === "top" ? "deckTop" : "deckBottom", seers);
      return;
    }
    const side = env.controller;
    const cards = ctx.state.sides[side].deck.slice(0, Math.max(0, evaluate(ctx, node.count, env)));
    if (cards.length === 0) return;
    ctx.emit({ kind: "lookedAtTop", side, cards });
    const arrangement = ctx.choose<ArrangePrompt>({
      kind: "arrange",
      side,
      privateTo: side,
      purpose: env.purpose("putInDeck"),
      cards,
      destinations: lookedAtSlots(node.places, cards.length),
    });
    for (const { to } of node.places) {
      const placed = arrangement.filter((entry) => entry.to === to).map((entry) => entry.card);
      if (placed.length === 0) continue;
      if (to === "hand") {
        for (const id of placed) {
          if (moveToHand(ctx, id, side) === "hand") ctx.emit({ kind: "cardTaken", side, instance: id, from: "deck", holder: side });
        }
      } else {
        placeAll(ctx, placed, to === "top" ? "deckTop" : to === "bottom" ? "deckBottom" : "void");
      }
    }
  },
});

/**
 * The arrangement's destinations: each counted place takes exactly its
 * number while the cards cover them all, else up to it; "rest" takes the
 * cards left over, and is left out when none are.
 */
function lookedAtSlots(places: readonly LookedAtPlace[], cards: number): ArrangeSlot[] {
  const counted = places.reduce((total, place) => total + (place.count === "rest" ? 0 : place.count), 0);
  const short = cards < counted;
  return places.flatMap(({ to, count }): ArrangeSlot[] => {
    if (count !== "rest") return [{ to, min: short ? 0 : count, max: count }];
    return short || cards === counted ? [] : [{ to, min: cards - counted, max: cards - counted }];
  });
}

/** Source-zone buckets follow first reference occurrence; each uses its original zone order. */
function sourceZoneOrder(ctx: StepContext, ids: readonly InstanceId[]): InstanceId[] {
  const groups: { readonly owner: Side; readonly zone: Zone; readonly ids: InstanceId[] }[] = [];
  for (const id of ids) {
    const instance = instanceOf(ctx.state, id);
    let group = groups.find((item) => item.owner === instance.controller && item.zone === instance.zone);
    if (group === undefined) {
      group = { owner: instance.controller, zone: instance.zone, ids: [] };
      groups.push(group);
    }
    group.ids.push(id);
  }
  return groups.flatMap((group) => {
    const order = group.zone === "play" ? charactersInPlay(ctx.state, group.owner)
      : group.zone === "stack" ? [] : ctx.state.sides[group.owner][group.zone];
    return order.filter((id) => group.ids.includes(id));
  });
}

type Place = "deckTop" | "deckBottom" | "void";

/**
 * Puts `ids` at `place` of each one's owner, keeping their order with the
 * first nearest the top, and emits one `cardsPlaced` per owner whose deck or
 * void a card entered. A card already in that place is put there again (a
 * looked-at card kept on top).
 */
function placeAll(ctx: StepContext, ids: readonly InstanceId[], place: Place, seers?: ReadonlyMap<InstanceId, readonly Side[]>): void {
  const entered: Record<Side, { cards: InstanceId[]; from: Zone[]; seenBy: Side[][] }> = {
    player: { cards: [], from: [], seenBy: [] },
    enemy: { cards: [], from: [], seenBy: [] },
  };
  // Putting each on top in turn reverses them, so the top goes last-first.
  const order = place === "deckTop" ? [...ids].reverse() : ids;
  for (const id of order) {
    const instance = instanceOf(ctx.state, id);
    const from = instance.zone;
    const went = moveInstance(ctx, id, place === "void" ? "void" : "deck", place === "deckBottom" ? "bottom" : "top");
    if (went === "banished") {
      // A reclaimed card is banished instead (rules § Zone Changes).
      ctx.emit({ kind: "banished", instance: id, side: instance.owner });
    } else if (went !== null) {
      const into = entered[instance.owner];
      into.cards.push(id);
      into.from.push(from);
      into.seenBy.push(place === "void" ? [...SIDES] : [...(seers?.get(id) ?? SIDES.filter((viewer) => identifies(ctx.state, id, viewer)))]);
    }
  }
  for (const side of SIDES) {
    const into = entered[side];
    if (into.cards.length === 0) continue;
    if (place === "deckTop") {
      into.cards.reverse();
      into.from.reverse();
      into.seenBy.reverse();
    }
    ctx.emit({ kind: "cardsPlaced", side, to: place, ...into });
  }
}

/**
 * "Put <cards> on top of / on the bottom of <its owner's> deck": every card
 * the references name, which may not be cards on the stack (Prevent's
 * destination puts those in a deck).
 */
export function putInDeck(cards: readonly CardRef[], at: DeckEnd): PutCardsInDeckNode {
  if (cards.some((ref) => ref.kind === "stackTarget")) throw new Error("putInDeck cannot move a card on the stack");
  return { op: "putInDeck", from: "cards", cards, at };
}

/**
 * "Look at the top N cards of your deck. Put one on top …, one on the bottom
 * …, and one into your hand. Put the rest into your void.": `places` in
 * printed order, each destination once, each counted place a positive safe
 * integer and at most one "rest". Without a "rest" place, `count` is the sum
 * of the counted places, so no looked-at card is left without a place.
 */
export function putFromTop(count: ValueExpr, places: readonly LookedAtPlace[]): PutLookedAtNode {
  if (places.length === 0) throw new Error("putFromTop needs at least one place");
  if (new Set(places.map((place) => place.to)).size !== places.length) throw new Error("putFromTop lists a destination twice");
  const rests = places.filter((place) => place.count === "rest").length;
  if (rests > 1) throw new Error("putFromTop has more than one rest place");
  for (const place of places) {
    if (place.count !== "rest" && (!Number.isSafeInteger(place.count) || place.count <= 0)) {
      throw new Error("putFromTop counts must be positive safe integers");
    }
  }
  const counted = places.reduce((total, place) => total + (place.count === "rest" ? 0 : place.count), 0);
  if (rests === 0 && count !== counted) throw new Error("putFromTop without a rest place must look at exactly the cards it places");
  return { op: "putInDeck", from: "lookAtTop", count, places };
}

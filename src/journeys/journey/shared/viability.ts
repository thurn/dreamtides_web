// Shared viability helpers.
//
// Cost and reward templates evaluate whether a given journey context can host
// their option by composing the predicates table with the content helpers in
// this module's siblings. These helpers consolidate that surface so each
// template imports `./viability` once instead of stitching together
// `predicates`, `content`, and `effects` directly.
//
// Every helper is a pure function over JourneyContext. Helpers that operate on
// the deck read `ctx.state.quest.deck`; helpers that operate on dreamsigns read
// `ctx.state.quest.dreamsignPoolIds` against `ctx.content.dreamsigns`; resource
// helpers read `ctx.state.quest.resources`.

import type { CardContent } from "../../content/types";
import type { JourneyContext } from "../context";
import { isCardEligibleForTransfiguration } from "../effects";
import { cardMatches } from "./content";
import { getPredicate } from "./predicates";

export function deckContainsCard(ctx: JourneyContext, cardId: string): boolean {
  return ctx.state.quest.deck.entries.some((entry) => entry.cardId === cardId);
}

export function deckContainsPredicate(
  ctx: JourneyContext,
  predicateId: string,
  minCount: number = 1,
): boolean {
  const predicate = getPredicate(predicateId);
  // Predicate definitions in the table do not pin `source: "deck"`, so apply
  // the predicate against the deck explicitly here.
  const deckScopedPredicate = { ...predicate.cardPredicate, source: "deck" as const };
  return cardMatches(ctx, deckScopedPredicate).length >= minCount;
}

export function deckHasMinSize(ctx: JourneyContext, n: number): boolean {
  return ctx.state.quest.deck.summary.totalCards >= n;
}

export function poolHasDreamsignWithTide(
  ctx: JourneyContext,
  tide?: string | null,
): boolean {
  const dreamsignsById = new Map(
    ctx.content.dreamsigns.map((dreamsign) => [dreamsign.id, dreamsign]),
  );
  return ctx.state.quest.dreamsignPoolIds.some((id) => {
    const dreamsign = dreamsignsById.get(id);
    if (!dreamsign) return false;
    if (tide === null || tide === undefined) return true;
    return dreamsign.tides.includes(tide);
  });
}

export function transfigurationHasEligibleTarget(
  ctx: JourneyContext,
  transfigurationId: string,
): boolean {
  const cardsById = new Map(ctx.content.cards.map((card) => [card.id, card]));
  return ctx.state.quest.deck.entries.some((entry) => {
    const card = cardsById.get(entry.cardId);
    return card !== undefined && isCardEligibleForTransfiguration(transfigurationId, card);
  });
}

export function canAffordEssence(ctx: JourneyContext, amount: number): boolean {
  return ctx.state.quest.resources.essence >= amount;
}

export function canAffordOmens(ctx: JourneyContext, amount: number): boolean {
  return ctx.state.quest.resources.omens >= amount;
}

export function deckContainsDiscardAbility(ctx: JourneyContext): boolean {
  const cardsById = new Map(ctx.content.cards.map((card) => [card.id, card]));
  return ctx.state.quest.deck.entries.some((entry) => {
    const card = cardsById.get(entry.cardId);
    return card !== undefined && cardRenderedTextIncludes(card, "discard");
  });
}

function cardRenderedTextIncludes(card: CardContent, needle: string): boolean {
  const raw = card.raw["rendered-text"] ?? card.raw.renderedText;
  if (typeof raw !== "string") return false;
  return raw.toLowerCase().includes(needle.toLowerCase());
}

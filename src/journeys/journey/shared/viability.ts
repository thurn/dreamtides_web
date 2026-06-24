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
//
// Deck-state helpers:
//   - `deckContainsCard` — by cardId
//   - `deckContainsCardByName` — by display name, resolving deck entries
//     through the catalog (used when a template's params carry a card name
//     rather than an id)
//   - `deckContainsPredicate` — predicate-scoped, pins `source: "deck"`
//   - `deckHasMinSize`
//   - `deckHasDuplicateStack` — at least one cardId with copies >= 2
//   - `deckContainsDiscardAbility`
//   - `transfigurationHasEligibleTarget`

import type { JourneyContext } from "../context";
import { isCardEligibleForTransfiguration } from "../effects";
import { cardMatches } from "./content";
import {
  findTransfiguredDeckEntriesByCardId,
  findTransfiguredDeckEntriesByName,
  findTransfiguredDeckEntriesByPredicate,
  findUntransfiguredDeckEntriesByCardId,
  findUntransfiguredDeckEntriesByName,
  findUntransfiguredDeckEntriesByPredicate,
  findUntransfiguredDeckEntriesByPredicateEligibleForTransfiguration,
  findUntransfiguredDeckEntryIds,
} from "./deckEntries";
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

// True iff the deck contains at least one card with copies >= 2. A deck of N
// unique cards has no duplicate stack to purge, so templates that purge
// duplicates gate on this rather than `totalCards >= 2`.
export function deckHasDuplicateStack(ctx: JourneyContext): boolean {
  return ctx.state.quest.deck.entries.some((entry) => entry.copies >= 2);
}

// Walks deck entries and resolves them against the content catalog, returning
// true iff any deck card's display name matches `cardName`. Templates that
// operate on a SPECIFIC named card (e.g. `purge_named_card`) gate on this
// instead of mere deck non-emptiness — otherwise the template would offer a
// no-op option whenever the deck happens to be non-empty but lacks the named
// card.
export function deckContainsCardByName(ctx: JourneyContext, cardName: string): boolean {
  const cardsById = new Map(ctx.content.cards.map((card) => [card.id, card]));
  return ctx.state.quest.deck.entries.some((entry) => {
    const card = cardsById.get(entry.cardId);
    return card !== undefined && card.name === cardName;
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

export function deckContainsUntransfiguredCardByName(
  ctx: JourneyContext,
  cardName: string,
  transfigurationId?: string,
): boolean {
  return findUntransfiguredDeckEntriesByName(
    ctx,
    cardName,
    transfigurationId === undefined
      ? undefined
      : (card) => isCardEligibleForTransfiguration(transfigurationId, card),
  ).length >= 1;
}

export function deckContainsUntransfiguredPredicate(
  ctx: JourneyContext,
  predicateId: string,
  minCount: number = 1,
  transfigurationId?: string,
): boolean {
  const entryIds = transfigurationId === undefined
    ? findUntransfiguredDeckEntriesByPredicate(ctx, predicateId)
    : findUntransfiguredDeckEntriesByPredicateEligibleForTransfiguration(
      ctx,
      predicateId,
      transfigurationId,
    );
  return entryIds.length >= minCount;
}

export function deckHasUntransfiguredMinSize(ctx: JourneyContext, minCount: number): boolean {
  return findUntransfiguredDeckEntryIds(ctx).length >= minCount;
}

export function deckContainsTransfiguredCardByName(
  ctx: JourneyContext,
  cardName: string,
): boolean {
  return findTransfiguredDeckEntriesByName(ctx, cardName).length >= 1;
}

export function deckContainsCardId(ctx: JourneyContext, cardId: string): boolean {
  return deckContainsCard(ctx, cardId);
}

export function deckContainsUntransfiguredCardById(
  ctx: JourneyContext,
  cardId: string,
  transfigurationId?: string,
): boolean {
  return findUntransfiguredDeckEntriesByCardId(
    ctx,
    cardId,
    transfigurationId === undefined
      ? undefined
      : (card) => isCardEligibleForTransfiguration(transfigurationId, card),
  ).length >= 1;
}

export function deckContainsTransfiguredCardById(
  ctx: JourneyContext,
  cardId: string,
): boolean {
  return findTransfiguredDeckEntriesByCardId(ctx, cardId).length >= 1;
}

export function deckContainsTransfiguredPredicate(
  ctx: JourneyContext,
  predicateId: string,
  minCount: number = 1,
): boolean {
  return findTransfiguredDeckEntriesByPredicate(ctx, predicateId).length >= minCount;
}

export function canAffordEssence(ctx: JourneyContext, amount: number): boolean {
  return ctx.state.quest.resources.essence >= amount;
}

export function canAffordOmens(ctx: JourneyContext, amount: number): boolean {
  return ctx.state.quest.resources.omens >= amount;
}

export function deckContainsDiscardAbility(ctx: JourneyContext): boolean {
  return deckContainsPredicate(ctx, "discard_text");
}

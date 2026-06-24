import { asCardId } from "../../../types/card-identity";
import type { CardContent } from "../../content/types";
import type { JourneyContext, ProjectedDeckEntryTransfiguration } from "../context";
import { cardMatches, isCardEligibleForTransfiguration } from "./content";
import { getPredicate } from "./predicates";

export type ProjectedDeckEntry = {
  readonly entryId: string;
  readonly card: CardContent;
  readonly transfiguration: ProjectedDeckEntryTransfiguration | undefined;
};

export function projectedDeckEntries(ctx: JourneyContext): ProjectedDeckEntry[] {
  const cardsById = new Map(ctx.content.cards.map((card) => [card.id, card]));
  return ctx.state.quest.deck.entries.flatMap((entry) => {
    const card = cardsById.get(asCardId(entry.cardId));
    if (card === undefined) return [];
    return (entry.entryIds ?? []).map((entryId, index) => ({
      entryId,
      card,
      transfiguration: entry.entryTransfigurations?.[index],
    }));
  });
}

export function findProjectedDeckEntry(
  ctx: JourneyContext,
  entryId: string,
): ProjectedDeckEntry | undefined {
  return projectedDeckEntries(ctx).find((entry) => entry.entryId === entryId);
}

export function findDeckEntriesByName(
  ctx: JourneyContext,
  cardName: string,
  filter: (card: CardContent) => boolean = () => true,
): string[] {
  return projectedDeckEntries(ctx)
    .filter((entry) => entry.card.name === cardName && filter(entry.card))
    .map((entry) => entry.entryId);
}

export function findDeckEntriesByPredicate(
  ctx: JourneyContext,
  predicateId: string,
): string[] {
  if (predicateId === "transfigured") {
    return projectedDeckEntries(ctx)
      .filter((entry) => entry.transfiguration != null)
      .map((entry) => entry.entryId);
  }

  const predicate = getPredicate(predicateId);
  const deckScopedPredicate = { ...predicate.cardPredicate, source: "deck" as const };
  const matchingIds = new Set(cardMatches(ctx, deckScopedPredicate).map((card) => card.id));
  return projectedDeckEntries(ctx)
    .filter((entry) => matchingIds.has(entry.card.id))
    .map((entry) => entry.entryId);
}

export function findFirstDeckEntryIdByCardName(
  ctx: JourneyContext,
  cardName: string,
  filter: (card: CardContent) => boolean = () => true,
): string | undefined {
  return findDeckEntriesByName(ctx, cardName, filter)[0];
}

export function findFirstStarterDeckEntryId(ctx: JourneyContext): string | undefined {
  return findDeckEntriesByPredicate(ctx, "starter")[0];
}

export function findUntransfiguredDeckEntriesByName(
  ctx: JourneyContext,
  cardName: string,
  filter: (card: CardContent) => boolean = () => true,
): string[] {
  return projectedDeckEntries(ctx)
    .filter(
      (entry) =>
        entry.card.name === cardName
        && filter(entry.card)
        && entry.transfiguration == null,
    )
    .map((entry) => entry.entryId);
}

export function findUntransfiguredDeckEntriesByPredicate(
  ctx: JourneyContext,
  predicateId: string,
): string[] {
  const entryIds = new Set(findDeckEntriesByPredicate(ctx, predicateId));
  return projectedDeckEntries(ctx)
    .filter((entry) => entryIds.has(entry.entryId) && entry.transfiguration == null)
    .map((entry) => entry.entryId);
}

export function findUntransfiguredDeckEntriesByPredicateEligibleForTransfiguration(
  ctx: JourneyContext,
  predicateId: string,
  transfiguration: string,
): string[] {
  const entryIds = new Set(findDeckEntriesByPredicate(ctx, predicateId));
  return projectedDeckEntries(ctx)
    .filter(
      (entry) =>
        entryIds.has(entry.entryId)
        && entry.transfiguration == null
        && isCardEligibleForTransfiguration(transfiguration, entry.card),
    )
    .map((entry) => entry.entryId);
}

export function findUntransfiguredDeckEntryIds(ctx: JourneyContext): string[] {
  return projectedDeckEntries(ctx)
    .filter((entry) => entry.transfiguration == null)
    .map((entry) => entry.entryId);
}

export function findTransfiguredDeckEntriesByName(
  ctx: JourneyContext,
  cardName: string,
): string[] {
  return projectedDeckEntries(ctx)
    .filter((entry) => entry.card.name === cardName && entry.transfiguration != null)
    .map((entry) => entry.entryId);
}

export function findTransfiguredDeckEntriesByPredicate(
  ctx: JourneyContext,
  predicateId: string,
): string[] {
  const entryIds = new Set(findDeckEntriesByPredicate(ctx, predicateId));
  return projectedDeckEntries(ctx)
    .filter((entry) => entryIds.has(entry.entryId) && entry.transfiguration != null)
    .map((entry) => entry.entryId);
}

export function findDeckEntryTransfiguration(
  ctx: JourneyContext,
  entryId: string,
): ProjectedDeckEntryTransfiguration | undefined {
  return findProjectedDeckEntry(ctx, entryId)?.transfiguration;
}

export function findDeckEntriesByCardId(
  ctx: JourneyContext,
  cardId: string,
  filter: (card: CardContent) => boolean = () => true,
): string[] {
  return projectedDeckEntries(ctx)
    .filter((entry) => entry.card.id === cardId && filter(entry.card))
    .map((entry) => entry.entryId);
}

export function findFirstDeckEntryIdByCardId(
  ctx: JourneyContext,
  cardId: string,
  filter: (card: CardContent) => boolean = () => true,
): string | undefined {
  return findDeckEntriesByCardId(ctx, cardId, filter)[0];
}

export function findUntransfiguredDeckEntriesByCardId(
  ctx: JourneyContext,
  cardId: string,
  filter: (card: CardContent) => boolean = () => true,
): string[] {
  return projectedDeckEntries(ctx)
    .filter(
      (entry) =>
        entry.card.id === cardId
        && filter(entry.card)
        && entry.transfiguration == null,
    )
    .map((entry) => entry.entryId);
}

export function findTransfiguredDeckEntriesByCardId(
  ctx: JourneyContext,
  cardId: string,
): string[] {
  return projectedDeckEntries(ctx)
    .filter((entry) => entry.card.id === cardId && entry.transfiguration != null)
    .map((entry) => entry.entryId);
}

import type { CardData } from "./types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntryCardModification,
} from "./types/quest";

type CardTypeFields = Pick<CardData, "cardType" | "subtype">;
type CardKeywordFields = Pick<CardData, "isFast" | "renderedText"> & {
  reclaimCost?: number | null;
};

/** Returns a card-like value with any deck-entry type override applied. */
export function applyCardTypeChange<T extends CardTypeFields>(
  card: T,
  typeChange: CardTypeChange | null | undefined,
): T {
  if (typeChange == null) {
    return card;
  }
  return {
    ...card,
    cardType: typeChange.cardType,
    subtype: typeChange.subtype,
  };
}

/** Returns a card-like value with any deck-entry keyword overrides applied. */
export function applyCardKeywordModification<T extends CardKeywordFields>(
  card: T,
  keywordModification: CardKeywordModification | null | undefined,
): T {
  const reclaimCost = normalizedReclaimCost(keywordModification?.reclaim);
  if (keywordModification?.fast !== true && reclaimCost === null) {
    return card;
  }
  return {
    ...card,
    isFast: keywordModification?.fast === true ? true : card.isFast,
    renderedText: reclaimCost === null
      ? card.renderedText
      : appendReclaimText(card.renderedText, reclaimCost),
    reclaimCost: reclaimCost ?? card.reclaimCost ?? null,
  };
}

/** Merges keyword changes; Reclaim grants are additive on the deck entry. */
export function mergeCardKeywordModification(
  existing: CardKeywordModification | null | undefined,
  incoming: CardKeywordModification,
): CardKeywordModification {
  const next: CardKeywordModification = {
    ...(existing ?? {}),
    ...incoming,
  };
  if (incoming.reclaim !== undefined) {
    next.reclaim = (existing?.reclaim ?? 0) + incoming.reclaim;
  }
  return next;
}

function normalizedReclaimCost(reclaim: number | undefined): number | null {
  return reclaim === undefined || !Number.isFinite(reclaim) || reclaim <= 0
    ? null
    : Math.trunc(reclaim);
}

function appendReclaimText(renderedText: string, reclaimCost: number): string {
  const reclaimLine = `Reclaim ${String(reclaimCost)}●`;
  return renderedText.trimEnd().endsWith(reclaimLine)
    ? renderedText
    : `${renderedText.trimEnd()}\n\n${reclaimLine}`;
}

/** Returns a card-like value with all deck-entry card modifications applied. */
export function applyDeckEntryCardModification<
  T extends CardTypeFields & CardKeywordFields,
>(
  card: T,
  modification: DeckEntryCardModification,
): T {
  return applyCardKeywordModification(
    applyCardTypeChange(card, modification.typeChange),
    modification.keywords,
  );
}

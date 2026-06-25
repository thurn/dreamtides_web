import type { CardData } from "./types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  DeckEntryCardModification,
} from "./types/quest";
import { applyTransfigurationToCard } from "./transfiguration/transfiguration-logic";

type CardTypeFields = Pick<CardData, "cardType" | "subtype">;
type CardStatFields = Pick<CardData, "energyCost" | "spark">;
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
  const reclaimCost = normalizedReclaimCost(
    keywordModification?.setReclaim ?? keywordModification?.reclaim,
  );
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
  if (incoming.setReclaim !== undefined) {
    next.setReclaim = incoming.setReclaim;
    delete next.reclaim;
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
  const textWithReplacement = renderedText.replace(
    /Reclaim\s+\d+●/i,
    reclaimLine,
  );
  if (textWithReplacement !== renderedText) return textWithReplacement;
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

/** Returns a card-like value with absolute debug stat overrides applied.
 *  Absent keys leave the corresponding stat unchanged. An explicit override
 *  value (e.g. `energyCost: 0`) replaces even a `null` base stat. Returns the
 *  original `card` reference unchanged when there is nothing to apply. */
export function applyCardStatOverride<T extends CardStatFields>(
  card: T,
  statOverride: { energyCost?: number; spark?: number } | null | undefined,
): T {
  if (
    statOverride == null ||
    (statOverride.energyCost === undefined && statOverride.spark === undefined)
  ) {
    return card;
  }
  return {
    ...card,
    ...(statOverride.energyCost !== undefined
      ? { energyCost: statOverride.energyCost }
      : {}),
    ...(statOverride.spark !== undefined ? { spark: statOverride.spark } : {}),
  };
}

/** The canonical deck-entry resolution: transfiguration, then type/keyword
 *  modifications, then debug stat overrides (applied last). */
export function resolveDeckEntryCard(
  card: CardData,
  entry: DeckEntry,
): CardData {
  const transfigured =
    entry.transfiguration === null
      ? card
      : applyTransfigurationToCard(card, entry.transfiguration);
  const modified = applyDeckEntryCardModification(transfigured, {
    typeChange: entry.typeChange,
    keywords: entry.keywordModification,
  });
  return applyCardStatOverride(modified, entry.statOverride);
}

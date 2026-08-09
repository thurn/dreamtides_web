import type { CardData } from "./types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  DeckEntryCardModification,
} from "./types/journey";
import { applyTransfigurationToCard } from "./transfiguration/transfiguration-logic";
import type { TransfigurationData } from "./types/transfiguration-data";

type CardTypeFields = Pick<CardData, "cardType" | "subtype">;
type CardStatFields = Pick<CardData, "energyCost" | "spark">;
type CardKeywordFields = Pick<
  CardData,
  "energyCost" | "energyCosts" | "isFast" | "renderedText"
> & {
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
  const energyCostReduction = normalizedEnergyCostReduction(
    keywordModification?.energyCostReduction,
  );
  if (
    keywordModification?.fast !== true &&
    reclaimCost === null &&
    energyCostReduction === 0
  ) {
    return card;
  }
  return {
    ...card,
    energyCost:
      card.energyCost === null
        ? null
        : Math.max(0, card.energyCost - energyCostReduction),
    ...(card.energyCosts === undefined
      ? {}
      : {
          energyCosts: card.energyCosts.map((label) => {
            const value = Number(label);
            return Number.isFinite(value)
              ? String(Math.max(0, value - energyCostReduction))
              : label;
          }),
        }),
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
  if (incoming.energyCostReduction !== undefined) {
    next.energyCostReduction =
      (existing?.energyCostReduction ?? 0) + incoming.energyCostReduction;
  }
  if (incoming.setReclaim !== undefined) {
    next.setReclaim = incoming.setReclaim;
    delete next.reclaim;
  }
  return next;
}

function normalizedEnergyCostReduction(reduction: number | undefined): number {
  return reduction === undefined || !Number.isFinite(reduction) || reduction <= 0
    ? 0
    : Math.trunc(reduction);
}

function normalizedReclaimCost(reclaim: number | undefined): number | null {
  return reclaim === undefined || !Number.isFinite(reclaim) || reclaim < 0
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

/** Returns a card-like value with a persistent additive spark bonus applied. */
export function applyCardSparkBonus<T extends CardStatFields>(
  card: T,
  sparkBonus: number | null | undefined,
): T {
  if (
    sparkBonus == null ||
    !Number.isFinite(sparkBonus) ||
    sparkBonus === 0 ||
    card.spark === null
  ) {
    return card;
  }
  return {
    ...card,
    spark: Math.max(0, card.spark + sparkBonus),
  };
}

/** The canonical deck-entry resolution: transfiguration, type/keyword changes,
 *  additive spark, then debug stat overrides (applied last). */
export function resolveDeckEntryCard(
  transfigurationData: TransfigurationData,
  card: CardData,
  entry: DeckEntry,
): CardData {
  const transfigured =
    entry.transfiguration === null
      ? card
      : applyTransfigurationToCard(
          transfigurationData,
          card,
          entry.transfiguration,
        );
  const modified = applyDeckEntryCardModification(transfigured, {
    typeChange: entry.typeChange,
    keywords: entry.keywordModification,
  });
  return applyCardStatOverride(
    applyCardSparkBonus(modified, entry.sparkBonus),
    entry.statOverride,
  );
}

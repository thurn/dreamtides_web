import { TRANSFIGURE_MARK_END, TRANSFIGURE_MARK_START } from "./runtime/transfigure-markers";
import { resolveDeckEntryTransfigurations } from "./transfiguration/deck-entry-transfigurations";
import type { CardData } from "./types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  DeckEntryCardModification,
} from "./types/journey";
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
  // Find declarations in visible text, retaining source offsets and tint state
  // so a replaced payment cannot change the highlighting of its neighbors.
  let visible = "";
  let highlighted = false;
  const offsets: number[] = [];
  const highlights: boolean[] = [];
  for (let index = 0; index < renderedText.length; index += 1) {
    const character = renderedText[index];
    if (character === TRANSFIGURE_MARK_START || character === TRANSFIGURE_MARK_END) {
      highlighted = character === TRANSFIGURE_MARK_START;
    } else {
      offsets.push(index);
      highlights.push(highlighted);
      visible += character;
    }
  }
  // Payment commas belong to the multipart cost; a period/newline ends it.
  // Sentence/keyword-list boundaries exclude ordinary prose references.
  const declarations = [...visible.matchAll(
    /(^|[\n.,][ \t]*|[!?][ \t]+)(Reclaim)(?:[ \t]+\d+[ \t]*●|[ \t]+–[ \t]*[^.\n]+)?(?=[.,\n]|[ \t]*$)/gi,
  )];
  if (declarations.length === 0) {
    return `${renderedText.trimEnd()}\n\nReclaim ${String(reclaimCost)}●`;
  }
  const transition = (before: boolean, after: boolean): string =>
    before === after ? "" : after ? TRANSFIGURE_MARK_START : TRANSFIGURE_MARK_END;
  let result = renderedText;
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const match = declarations[index];
    const start = match.index + match[1].length;
    const wordEnd = start + match[2].length;
    const end = match.index + match[0].length;
    if (index > 0) {
      const removalEnd = visible[end] === "." ? end + 1 : end;
      result = result.slice(0, offsets[start]) +
        transition(highlights[start], highlights[removalEnd - 1]) +
        result.slice(offsets[removalEnd - 1] + 1);
      continue;
    }
    const tailStart = offsets[wordEnd - 1] + 1;
    const tailEnd = offsets[end - 1] + 1;
    const before = highlights[wordEnd - 1];
    const after = highlights[end - 1];
    const paymentHighlighted = end === wordEnd ? before :
      highlights.slice(wordEnd, end).some((tinted, offset) =>
        tinted && !/\s/.test(visible[wordEnd + offset]));
    const spaceHighlighted = end === wordEnd ? before : highlights[wordEnd];
    const payment = transition(before, spaceHighlighted) + " " +
      transition(spaceHighlighted, paymentHighlighted) + String(reclaimCost) + "●" +
      transition(paymentHighlighted, after);
    result = result.slice(0, tailStart) + payment + result.slice(tailEnd);
  }
  return result;
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
  const transfigured = resolveDeckEntryTransfigurations(transfigurationData, card, entry);
  const modified = applyDeckEntryCardModification(transfigured, {
    typeChange: entry.typeChange,
    keywords: entry.keywordModification,
  });
  const boosted = applyCardSparkBonus(modified, entry.sparkBonus);
  // History projections match instanceCard's existing post-mod type/spark contract.
  const canonical = entry.transfigurationApplications === undefined ? boosted : modified.cardType === "Event"
    ? { ...boosted, spark: null, sparkVariable: false }
    : transfigured.spark === null && transfigured.sparkVariable !== true
      ? { ...boosted, spark: 0, sparkVariable: false }
      : { ...boosted, sparkVariable: transfigured.sparkVariable === true && transfigured.spark === null };
  return applyCardStatOverride(canonical, entry.statOverride);
}

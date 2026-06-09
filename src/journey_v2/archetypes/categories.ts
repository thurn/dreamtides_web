import { clustersOf } from "../signals/corpus";
import { MERCHANT_TUNING } from "../tuning";
import type { CardData } from "../../types/cards";
import type { MerchantContext, MerchantCatalogCard } from "../types";

/** A draftable category: a labelled set of pool cards plus a deck-affinity flag. */
export interface MerchantCategory {
  id: string;
  label: string;
  /** Non-starter pool card UUIDs that belong to this category. */
  memberUuids: readonly string[];
  /** True when the deck is committed enough to this category to favour it. */
  deckAffine: boolean;
}

type CostBand = "cheap" | "mid" | "big";

function costBandOf(card: CardData): CostBand | null {
  const cost = card.energyCost;
  if (cost === null) return null;
  if (cost <= 1) return "cheap";
  if (cost <= 3) return "mid";
  return "big";
}

const COST_BAND_LABELS: Readonly<Record<CostBand, string>> = {
  cheap: "cheap card",
  mid: "mid-cost card",
  big: "expensive card",
};

/**
 * Builds the draftable category universe from hard card data and corpus
 * clusters, per the spec's "Category construction".
 *
 * Sources:
 *  - card types (Character, Event);
 *  - subtypes with >= `subtypeMinPoolCards` non-starter pool cards;
 *  - cost bands cheap (<= 1) / mid (2–3) / big (>= 4);
 *  - fast cards (when >= `subtypeMinPoolCards` exist);
 *  - one category per retained corpus cluster, labelled by its flagship's
 *    display name.
 *
 * A category is **deck-affine** when the deck holds >= 2 cards in it (>= 1 for
 * cluster categories). Membership for type/subtype/cost/fast categories is by
 * hard card property; cluster membership is the cluster's pool members.
 */
export function buildCategoryUniverse(
  context: MerchantContext,
): readonly MerchantCategory[] {
  const pool = context.candidateGrantCards;
  const deckCards = context.deckCards;
  const categories: MerchantCategory[] = [];

  const addPredicateCategory = (
    id: string,
    label: string,
    predicate: (card: CardData) => boolean,
    minMembers: number,
    affineMin: number,
  ): void => {
    const memberUuids = pool
      .filter((member) => predicate(member.card))
      .map((member) => member.cardUuid);
    if (memberUuids.length < minMembers) return;
    const deckMatches = deckCards.filter((deckCard) =>
      predicate(deckCard.card),
    ).length;
    categories.push({
      id,
      label,
      memberUuids,
      deckAffine: deckMatches >= affineMin,
    });
  };

  // Card types.
  for (const cardType of ["Character", "Event"] as const) {
    addPredicateCategory(
      `type:${cardType}`,
      cardType === "Event" ? "Event" : "Character",
      (card) => card.cardType === cardType,
      1,
      2,
    );
  }

  // Subtypes with enough pool depth.
  const subtypeCounts = new Map<string, number>();
  for (const member of pool) {
    const subtype = member.card.subtype;
    if (subtype.length === 0) continue;
    subtypeCounts.set(subtype, (subtypeCounts.get(subtype) ?? 0) + 1);
  }
  for (const [subtype, count] of subtypeCounts) {
    if (count < MERCHANT_TUNING.subtypeMinPoolCards) continue;
    addPredicateCategory(
      `subtype:${subtype}`,
      subtype,
      (card) => card.subtype === subtype,
      MERCHANT_TUNING.subtypeMinPoolCards,
      2,
    );
  }

  // Cost bands.
  for (const band of ["cheap", "mid", "big"] as const) {
    addPredicateCategory(
      `cost:${band}`,
      COST_BAND_LABELS[band],
      (card) => costBandOf(card) === band,
      1,
      2,
    );
  }

  // Fast cards (only when the pool is deep enough).
  addPredicateCategory(
    "fast",
    "fast card",
    (card) => card.isFast,
    MERCHANT_TUNING.subtypeMinPoolCards,
    2,
  );

  // Corpus clusters, labelled by flagship display name.
  const corpus = context.merchantCorpus;
  if (corpus !== undefined) {
    const poolByUuid = new Map<string, MerchantCatalogCard>();
    for (const member of pool) poolByUuid.set(member.cardUuid, member);
    for (const cluster of clustersOf(corpus)) {
      const memberSet = new Set(cluster.members);
      const memberUuids = cluster.members.filter((uuid) =>
        poolByUuid.has(uuid),
      );
      if (memberUuids.length === 0) continue;
      const flagship =
        context.cardByUuid.get(cluster.flagship)?.name ??
        poolByUuid.get(memberUuids[0])?.displayName ??
        "package";
      const deckMatches = deckCards.filter((deckCard) =>
        memberSet.has(deckCard.cardUuid),
      ).length;
      categories.push({
        id: `cluster:${String(cluster.id)}`,
        label: `${flagship} package`,
        memberUuids,
        deckAffine: deckMatches >= 1,
      });
    }
  }

  return categories;
}

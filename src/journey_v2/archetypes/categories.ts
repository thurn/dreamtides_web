import type { CardData } from "../../types/cards";
import type { AuguryContext } from "../types";
import type { CardId } from "../../types/card-identity";
import { parseCardId } from "../../types/card-identity";
import {
  parseAuguryCategoryId,
  type AuguryCategoryId,
} from "../../types/identifiers";

/** An Augury-labelled subset of the current journey's card pool. */
export interface AuguryCategory {
  id: AuguryCategoryId;
  label: string;
  memberUuids: readonly CardId[];
}

type CostBand = "cheap" | "mid" | "big";

function costBandOf(card: CardData, context: AuguryContext): CostBand | null {
  const cost = card.energyCost;
  if (cost === null) return null;
  const bands = context.rewardSelection.tuning.costBands;
  if (cost <= bands.cheapMaximum) return "cheap";
  if (cost <= bands.midMaximum) return "mid";
  return "big";
}

const COST_BAND_LABELS: Readonly<Record<CostBand, string>> = {
  cheap: "cheap card",
  mid: "mid-cost card",
  big: "expensive card",
};

/**
 * Builds categories from card facts and authored tides. Tide packages replace
 * learned relationship clusters, so every package is inspectable in RON.
 */
export function buildCategoryUniverse(
  context: AuguryContext,
): readonly AuguryCategory[] {
  const pool = context.candidateGrantCards;
  const categories: AuguryCategory[] = [];
  const add = (
    id: AuguryCategoryId,
    label: string,
    predicate: (card: CardData) => boolean,
    minimum: number,
  ): void => {
    const memberUuids = pool
      .filter((member) => predicate(member.card))
      .map((member) => member.cardUuid);
    if (memberUuids.length >= minimum)
      categories.push({ id, label, memberUuids });
  };

  for (const cardType of ["Character", "Event"] as const) {
    add(
      parseAuguryCategoryId(`type:${cardType}`),
      cardType,
      (card) => card.cardType === cardType,
      1,
    );
  }

  const subtypeMinimum = context.rewardSelection.tuning.subtypeMinPoolCards;
  const subtypes = new Set(
    pool.map((member) => member.card.subtype).filter(Boolean),
  );
  for (const subtype of [...subtypes].sort()) {
    add(
      parseAuguryCategoryId(`subtype:${subtype}`),
      subtype,
      (card) => card.subtype === subtype,
      subtypeMinimum,
    );
  }

  for (const band of ["cheap", "mid", "big"] as const) {
    add(
      parseAuguryCategoryId(`cost:${band}`),
      COST_BAND_LABELS[band],
      (card) => costBandOf(card, context) === band,
      1,
    );
  }
  add(
    parseAuguryCategoryId("fast"),
    "fast card",
    (card) => card.isFast,
    subtypeMinimum,
  );

  const tideData =
    context.rewardSelection.content.poolContext?.poolData.tides4Decks;
  if (tideData !== undefined) {
    const poolUuids = new Set(pool.map((member) => member.cardUuid));
    for (const tide of tideData.tides) {
      const memberUuids = tide.cards
        .map((entry) => parseCardId(entry.id))
        .filter((id) => poolUuids.has(id));
      if (memberUuids.length > 0) {
        categories.push({
          id: parseAuguryCategoryId(`tide:${tide.id}`),
          label: tide.auguryPackageReference,
          memberUuids,
        });
      }
    }
  }

  return categories;
}

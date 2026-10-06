// The card predicate shared by Exploration plans, offer usability, the
// Exploration provider, and reward selection.

import type { RewardCardPredicate } from "../reward-selection/types";
import type { CardData } from "../types/cards";
import type { RewardSelectionTuning } from "../types/reward-selection-data";

/** The cost band a "cheap-character" predicate measures against. */
export type CheapCharacterCostBand = Pick<
  RewardSelectionTuning["costBands"],
  "cheapCharacterMaximum"
>;

/**
 * Whether a card satisfies a reward or Exploration card predicate. A
 * "cheap-character" is a Character whose energy cost is at most the cost
 * band's cheapCharacterMaximum.
 */
export function matchesPredicate(
  card: CardData,
  predicate: RewardCardPredicate,
  costBands: CheapCharacterCostBand,
): boolean {
  switch (predicate) {
    case "any":
      return true;
    case "character":
      return card.cardType === "Character";
    case "event":
      return card.cardType === "Event";
    case "cheap-character":
      return (
        card.cardType === "Character" &&
        card.energyCost !== null &&
        card.energyCost <= costBands.cheapCharacterMaximum
      );
    case "legendary":
      return card.rarity === "Legendary";
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
  }
}

import type { CardData } from "../types/cards";
import type { DeckEntry } from "../types/quest";
import { applyDeckEntryCardModification } from "../card-type-change";

export interface DeckSummary {
  total: number;
  characterCount: number;
  eventCount: number;
  averageEnergyCost: number | null;
}

/** Computes package-safe summary metrics for a deck. */
export function computeDeckSummary(
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
): DeckSummary {
  let total = 0;
  let characterCount = 0;
  let eventCount = 0;
  let totalEnergyCost = 0;
  let cardsWithEnergyCost = 0;

  for (const entry of deck) {
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) {
      continue;
    }
    const effectiveCard = applyDeckEntryCardModification(card, {
      typeChange: entry.typeChange,
      keywords: entry.keywordModification,
    });

    total += 1;

    if (effectiveCard.cardType === "Character") {
      characterCount += 1;
    } else {
      eventCount += 1;
    }

    if (card.energyCost !== null) {
      totalEnergyCost += card.energyCost;
      cardsWithEnergyCost += 1;
    }
  }

  return {
    total,
    characterCount,
    eventCount,
    averageEnergyCost:
      cardsWithEnergyCost > 0
        ? Math.round((totalEnergyCost / cardsWithEnergyCost) * 10) / 10
        : null,
  };
}

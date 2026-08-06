import { createBaseBattleDeckCardDefinition } from "../card-definition";
import type { BattleDeckCardDefinition } from "../types";
import type { CardData } from "../../types/cards";

/**
 * Builds the journey AI deck from UUID-keyed configured entries, preserving
 * authored entry order and expanding each positive copy count.
 */
export function buildAiConfiguredDeck(
  cardDatabase: ReadonlyMap<number, CardData>,
  entries: readonly { cardId: string; count: number }[],
): BattleDeckCardDefinition[] {
  const byId = new Map(
    [...cardDatabase.values()].map((card) => [card.id.toLowerCase(), card]),
  );

  return entries.flatMap((entry) => {
    const card = byId.get(entry.cardId.toLowerCase());
    if (card === undefined) {
      throw new Error(`AI deck references missing card UUID ${entry.cardId}`);
    }
    return Array.from({ length: entry.count }, () =>
      createBaseBattleDeckCardDefinition(card),
    );
  });
}

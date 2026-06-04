import { createBaseBattleDeckCardDefinition } from "../card-definition";
import type { BattleDeckCardDefinition } from "../types";
import type { CardData } from "../../types/cards";

/**
 * Builds the AI's starter deck by filtering `cardDatabase` to cards with
 * `isStarter === true`, sorting by `cardNumber` for deterministic ordering,
 * and expanding each to `copiesPerCard` copies via
 * `createBaseBattleDeckCardDefinition`.
 *
 * The default `copiesPerCard` of 3 matches the standard starter multiset.
 */
export function buildAiStarterDeck(
  cardDatabase: ReadonlyMap<number, CardData>,
  copiesPerCard = 3,
): BattleDeckCardDefinition[] {
  const starters = [...cardDatabase.values()]
    .filter((card) => card.isStarter)
    .sort((a, b) => a.cardNumber - b.cardNumber);

  return starters.flatMap((card) =>
    Array.from({ length: copiesPerCard }, () =>
      createBaseBattleDeckCardDefinition(card),
    ),
  );
}

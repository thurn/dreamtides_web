// Pure view-model builder for the starting-deck reveal overlay. Resolves each
// deck entry to the card the player actually holds — type/keyword changes,
// persistent spark bonuses, and debug stat overrides applied — in acquisition
// order, dropping any entry whose
// card is not in the database. No React, no state hooks: the adapter acquires
// live state and calls `buildStartingDeckView`; this module maps domain data to
// the overlay's view types and nothing else.

import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/journey";
import {
  applyCardSparkBonus,
  applyCardStatOverride,
  applyDeckEntryCardModification,
} from "../../card-type-change";
import type {
  StartingDeckCardView,
  StartingDeckView,
} from "../../cumulus/screens/StartingDeckOverlay";

/**
 * Resolve every resolvable deck entry to its starting-deck card view, in deck
 * (acquisition) order. Entries whose `cardNumber` is not in `cardDatabase` are
 * dropped. Deterministic in its arguments.
 *
 * The card is resolved the same way the deck surfaces resolve it: type/keyword
 * modifications first, then persistent spark and the debug stat override
 * applied last so an explicit value wins. Each view is keyed by the stable
 * `entryId` (never the card name,
 * which is not unique).
 */
export function buildStartingDeckView(
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
): StartingDeckView {
  const cards: StartingDeckCardView[] = [];
  for (const entry of deck) {
    const base = cardDatabase.get(entry.cardNumber);
    if (base === undefined) continue;
    const card = applyCardStatOverride(
      applyCardSparkBonus(
        applyDeckEntryCardModification(base, {
          typeChange: entry.typeChange,
          keywords: entry.keywordModification,
        }),
        entry.sparkBonus,
      ),
      entry.statOverride,
    );
    cards.push({
      entryId: entry.entryId,
      model: { cardId: card.id, displaySnapshot: card },
      testId: `starting-deck-modal-card-${entry.entryId}`,
    });
  }
  return { cards };
}

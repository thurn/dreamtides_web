// Pure view-model builder for the mobile deck viewer. Resolves each deck entry
// to the card the player actually holds — transfiguration, type/keyword
// changes, and debug stat overrides applied — paired with the display
// descriptor that paints a transfigured card. No React, no state hooks: the
// adapter acquires live state and calls `buildMobileDeckView`; this module maps
// domain data to the screen's view types and nothing else.

import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/quest";
import {
  applyCardStatOverride,
  applyDeckEntryCardModification,
} from "../../card-type-change";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import type {
  DeckCardView,
  MobileDeckView,
} from "../../cumulus/screens/MobileDeckViewer";

/**
 * Resolve one deck entry to its display card. Mirrors the canonical deck-entry
 * resolution order used across the deck surfaces: type/keyword modifications
 * first, then transfiguration (which also yields the paint descriptor), then
 * the debug stat override applied last so an explicit value wins. Returns null
 * when the entry's card number is not in the database.
 */
export function toDeckCardView(
  entry: DeckEntry,
  cardDatabase: Map<number, CardData>,
): DeckCardView | null {
  const base = cardDatabase.get(entry.cardNumber);
  if (base === undefined) return null;

  const modified = applyDeckEntryCardModification(base, {
    typeChange: entry.typeChange,
    keywords: entry.keywordModification,
  });

  if (entry.transfiguration === null) {
    return {
      entryId: entry.entryId,
      model: {
        cardId: modified.id,
        displaySnapshot: applyCardStatOverride(modified, entry.statOverride),
      },
      isBane: entry.isBane,
    };
  }

  const transfigured = buildTransfigurationDisplay(
    modified,
    entry.transfiguration,
  );
  return {
    entryId: entry.entryId,
    model: {
      cardId: transfigured.card.id,
      displaySnapshot: applyCardStatOverride(transfigured.card, entry.statOverride),
      transfiguration: transfigured.display,
    },
    isBane: entry.isBane,
  };
}

/**
 * The full mobile deck view: every resolvable deck entry in deck (acquisition)
 * order. Deterministic in its arguments.
 */
export function buildMobileDeckView(
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
): MobileDeckView {
  const cards: DeckCardView[] = [];
  for (const entry of deck) {
    const view = toDeckCardView(entry, cardDatabase);
    if (view !== null) cards.push(view);
  }
  return { cards };
}

// The pure view-model builder for the D97 deck editor: resolves each owned
// copy's card UUID against the card database at the render boundary, splits
// the collection into the active deck and the reserve, and reports whether
// the deck may shrink.

import type {
  D97DeckEditorCardView,
  D97DeckEditorView,
} from "../../../cumulus/screens/d97/D97DeckEditorScreen";
import {
  canUnequip,
  copiesInZone,
} from "../../../d97/collection/collection";
import type {
  D97Collection,
  D97CopyZone,
} from "../../../d97/collection/types";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";

/** Index a card database by card UUID. */
export function cardsByUuid(
  cardDatabase: ReadonlyMap<number, CardData>,
): ReadonlyMap<CardId, CardData> {
  return new Map([...cardDatabase.values()].map((card) => [card.id, card]));
}

function zoneCards(
  collection: D97Collection,
  zone: D97CopyZone,
  cards: ReadonlyMap<CardId, CardData>,
): D97DeckEditorCardView[] {
  return copiesInZone(collection, zone).flatMap((copy) => {
    const card = cards.get(copy.cardId);
    if (card === undefined) return [];
    return [
      {
        entryId: copy.copyId,
        model: { cardId: card.id, displaySnapshot: card },
        testId: `d97-deck-editor-card-${copy.copyId}`,
      },
    ];
  });
}

/** The deck editor view of `collection`. Copies of unknown cards are hidden. */
export function buildD97DeckEditorView(
  collection: D97Collection,
  cards: ReadonlyMap<CardId, CardData>,
  minimumDeckSize: number,
): D97DeckEditorView {
  return {
    deck: zoneCards(collection, "deck", cards),
    reserve: zoneCards(collection, "reserve", cards),
    deckCount: copiesInZone(collection, "deck").length,
    reserveCount: copiesInZone(collection, "reserve").length,
    minimumDeckSize,
    canUnequip: canUnequip(collection, minimumDeckSize),
  };
}

// D97 deck editor view model: splits the collection into deck and reserve by
// owned-copy id, resolves cards by UUID, hides unknown cards while counting
// them, and disables unequipping at the minimum.

import { describe, expect, it } from "vitest";
import { acquireCopy, emptyCollection } from "../../../d97/collection/collection";
import type { D97Collection, D97CopyZone } from "../../../d97/collection/types";
import type { CardData } from "../../../types/cards";
import type { CardId } from "../../../types/card-identity";
import { parseD97RunSeed } from "../../../types/identifiers";
import { testCardId } from "../../../types/test-identities";
import { buildD97DeckEditorView, cardsByUuid } from "./d97-deck-editor-view-model";

const KNOWN = testCardId("deck-editor-known");
const UNKNOWN = testCardId("deck-editor-unknown");
const CARDS = cardsByUuid(
  new Map([[1, { id: KNOWN, cardNumber: 1 } as unknown as CardData]]),
);

function collection(entries: readonly [CardId, D97CopyZone][]): D97Collection {
  let next = emptyCollection();
  for (const [cardId, zone] of entries) {
    next = acquireCopy(next, {
      runSeed: parseD97RunSeed("deck-editor-seed"),
      cardId,
      provenance: { channel: "starting", battleCount: 0 },
      zone,
    }).collection;
  }
  return next;
}

describe("buildD97DeckEditorView", () => {
  it("splits deck and reserve by copy id and resolves cards by UUID", () => {
    const owned = collection([
      [KNOWN, "deck"],
      [KNOWN, "reserve"],
      [UNKNOWN, "deck"],
      [KNOWN, "deck"],
    ]);
    const view = buildD97DeckEditorView(owned, CARDS, 2);
    const ids = owned.copies.map((copy) => copy.copyId);
    expect(view.deck.map((card) => card.entryId)).toEqual([ids[0], ids[3]]);
    expect(view.reserve.map((card) => card.entryId)).toEqual([ids[1]]);
    expect(view.deck.every((card) => card.model.cardId === KNOWN)).toBe(true);
    expect(view.deckCount).toBe(3);
    expect(view.reserveCount).toBe(1);
    expect(view.canUnequip).toBe(true);
  });

  it("disables unequipping at the minimum", () => {
    const owned = collection([
      [KNOWN, "deck"],
      [KNOWN, "deck"],
    ]);
    expect(buildD97DeckEditorView(owned, CARDS, 2).canUnequip).toBe(false);
    expect(buildD97DeckEditorView(owned, CARDS, 1).canUnequip).toBe(true);
  });
});

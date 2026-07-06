import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/quest";
import { asCardId, asCardName } from "../../types/card-identity";
import { buildMobileDeckView, toDeckCardView } from "./mobile-deck-view-model";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Event"),
    id: asCardId("test-event"),
    cardNumber: 1,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<DeckEntry> = {}): DeckEntry {
  return {
    entryId: "entry-1",
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}

function database(...cards: CardData[]): Map<number, CardData> {
  return new Map(cards.map((card) => [card.cardNumber, card]));
}

describe("toDeckCardView", () => {
  it("resolves a plain entry to its card, keyed by entryId and carrying no transfiguration", () => {
    const card = makeCard({ cardNumber: 7 });
    const entry = makeEntry({ entryId: "e7", cardNumber: 7 });

    const view = toDeckCardView(entry, database(card));

    expect(view).not.toBeNull();
    expect(view?.entryId).toBe("e7");
    expect(view?.card.id).toBe(card.id);
    expect(view?.transfiguration).toBeUndefined();
    expect(view?.isBane).toBe(false);
  });

  it("returns null when the card number is not in the database", () => {
    expect(toDeckCardView(makeEntry({ cardNumber: 999 }), database())).toBeNull();
  });

  it("applies a debug stat override to the resolved card", () => {
    const card = makeCard({ cardNumber: 3, energyCost: 5 });
    const entry = makeEntry({ cardNumber: 3, statOverride: { energyCost: 0 } });

    const view = toDeckCardView(entry, database(card));

    expect(view?.card.energyCost).toBe(0);
  });

  it("carries a transfiguration display descriptor for a transfigured entry", () => {
    const card = makeCard({ cardNumber: 4, cardType: "Character", spark: 2 });
    const entry = makeEntry({ cardNumber: 4, transfiguration: "Kindled" });

    const view = toDeckCardView(entry, database(card));

    expect(view?.transfiguration).toBeDefined();
    // Kindled changes spark, so the display marks the spark as changed.
    expect(view?.transfiguration?.sparkChanged).toBe(true);
  });

  it("preserves the bane flag", () => {
    const view = toDeckCardView(
      makeEntry({ isBane: true }),
      database(makeCard()),
    );
    expect(view?.isBane).toBe(true);
  });
});

describe("buildMobileDeckView", () => {
  it("keeps deck (acquisition) order", () => {
    const a = makeCard({ cardNumber: 1, id: asCardId("a") });
    const b = makeCard({ cardNumber: 2, id: asCardId("b") });
    const deck = [
      makeEntry({ entryId: "e2", cardNumber: 2 }),
      makeEntry({ entryId: "e1", cardNumber: 1 }),
    ];

    const view = buildMobileDeckView(deck, database(a, b));

    expect(view.cards.map((c) => c.entryId)).toEqual(["e2", "e1"]);
  });

  it("drops entries whose card is missing rather than throwing", () => {
    const deck = [
      makeEntry({ entryId: "ok", cardNumber: 1 }),
      makeEntry({ entryId: "gone", cardNumber: 42 }),
    ];

    const view = buildMobileDeckView(deck, database(makeCard({ cardNumber: 1 })));

    expect(view.cards.map((c) => c.entryId)).toEqual(["ok"]);
  });

  it("keeps distinct entryId keys even when two entries share a card (and name)", () => {
    const card = makeCard({ cardNumber: 1 });
    const deck = [
      makeEntry({ entryId: "copy-a", cardNumber: 1 }),
      makeEntry({ entryId: "copy-b", cardNumber: 1 }),
    ];

    const view = buildMobileDeckView(deck, database(card));

    expect(view.cards.map((c) => c.entryId)).toEqual(["copy-a", "copy-b"]);
  });
});

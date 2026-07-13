import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import type { DeckEntry, Dreamcaller, Dreamsign } from "../../types/quest";
import { asCardId, asCardName } from "../../types/card-identity";
import { buildDesktopDeckView } from "./desktop-deck-view-model";

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

const dreamcaller: Dreamcaller = {
  id: "dc-1",
  name: "Sable",
  title: "The Unmaker",
  renderedText: "Banish a card.",
  imageNumber: "12",
  startingEssence: 3,
};

const dreamsign: Dreamsign = {
  id: "ds-1",
  name: "First Sign",
  effectDescription: "Draw an extra card.",
  isBane: false,
};

describe("buildDesktopDeckView", () => {
  it("resolves the deck in acquisition order", () => {
    const a = makeCard({ cardNumber: 1, id: asCardId("a") });
    const b = makeCard({ cardNumber: 2, id: asCardId("b") });
    const deck = [
      makeEntry({ entryId: "e2", cardNumber: 2 }),
      makeEntry({ entryId: "e1", cardNumber: 1 }),
    ];

    const view = buildDesktopDeckView(deck, database(a, b), null, []);

    expect(view.cards.map((c) => c.entryId)).toEqual(["e2", "e1"]);
  });

  it("maps the Dreamcaller to the sidebar view (portrait visual + rules text)", () => {
    const view = buildDesktopDeckView([], database(), dreamcaller, []);

    expect(view.dreamcaller).toEqual({
      id: "dc-1",
      imageNumber: "12",
      name: "Sable",
      title: "The Unmaker",
      renderedText: "Banish a card.",
    });
  });

  it("carries a null Dreamcaller through as null", () => {
    const view = buildDesktopDeckView([], database(), null, []);
    expect(view.dreamcaller).toBeNull();
  });

  it("copies the dreamsigns into the view", () => {
    const signs = [dreamsign];
    const view = buildDesktopDeckView([], database(), null, signs);

    expect(view.dreamsigns).toEqual(signs);
    // A copy, not the caller's array, so the view cannot alias live state.
    expect(view.dreamsigns).not.toBe(signs);
  });
});

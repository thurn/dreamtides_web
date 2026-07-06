import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { DeckCardView } from "./MobileDeckViewer";
import {
  DECK_SORT_OPTIONS,
  deckSortLabel,
  filterAndSortDeckCards,
} from "./mobile-deck-filter";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Card"),
    id: asCardId("test-card"),
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

/** A minimal deck-card view around a card, keyed by its entryId. */
function view(entryId: string, card: Partial<CardData>): DeckCardView {
  return { entryId, card: makeCard(card), isBane: false };
}

const ids = (cards: DeckCardView[]): string[] =>
  cards.map((card) => card.entryId);

describe("filterAndSortDeckCards — filtering", () => {
  const deck: DeckCardView[] = [
    view("char-a", { cardType: "Character" }),
    view("event-a", { cardType: "Event" }),
    view("char-b", { cardType: "Character" }),
  ];

  it("returns every card for the 'all' filter", () => {
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "deck",
    });
    expect(ids(result)).toEqual(["char-a", "event-a", "char-b"]);
  });

  it("keeps only characters when filtered to Character", () => {
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "Character",
      sort: "deck",
    });
    expect(ids(result)).toEqual(["char-a", "char-b"]);
  });

  it("keeps only events when filtered to Event", () => {
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "Event",
      sort: "deck",
    });
    expect(ids(result)).toEqual(["event-a"]);
  });
});

describe("filterAndSortDeckCards — sorting", () => {
  it("preserves acquisition order for the 'deck' sort", () => {
    const deck = [
      view("c", { energyCost: 3 }),
      view("a", { energyCost: 1 }),
      view("b", { energyCost: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "deck",
    });
    expect(ids(result)).toEqual(["c", "a", "b"]);
  });

  it("sorts by cost ascending, placing variable (null) cost at the expensive end", () => {
    const deck = [
      view("x", { energyCost: null }),
      view("three", { energyCost: 3 }),
      view("one", { energyCost: 1 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "cost-asc",
    });
    expect(ids(result)).toEqual(["one", "three", "x"]);
  });

  it("sorts by cost descending", () => {
    const deck = [
      view("one", { energyCost: 1 }),
      view("five", { energyCost: 5 }),
      view("three", { energyCost: 3 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "cost-desc",
    });
    expect(ids(result)).toEqual(["five", "three", "one"]);
  });

  it("sorts by spark high-to-low, placing no-spark cards last", () => {
    const deck = [
      view("none", { spark: null }),
      view("five", { spark: 5 }),
      view("two", { spark: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "spark-desc",
    });
    expect(ids(result)).toEqual(["five", "two", "none"]);
  });

  it("sorts by name A-to-Z", () => {
    const deck = [
      view("gamma", { name: asCardName("Gamma") }),
      view("alpha", { name: asCardName("Alpha") }),
      view("beta", { name: asCardName("Beta") }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "name-asc",
    });
    expect(ids(result)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("keeps acquisition order for cards that tie on the sort key (stable)", () => {
    const deck = [
      view("first-two", { energyCost: 2 }),
      view("second-two", { energyCost: 2 }),
      view("third-two", { energyCost: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "cost-asc",
    });
    expect(ids(result)).toEqual(["first-two", "second-two", "third-two"]);
  });

  it("does not mutate the input array", () => {
    const deck = [
      view("c", { energyCost: 3 }),
      view("a", { energyCost: 1 }),
    ];
    const before = ids(deck);
    filterAndSortDeckCards(deck, { typeFilter: "all", sort: "cost-asc" });
    expect(ids(deck)).toEqual(before);
  });

  it("filters and sorts together", () => {
    const deck = [
      view("char-3", { cardType: "Character", energyCost: 3 }),
      view("event-1", { cardType: "Event", energyCost: 1 }),
      view("char-1", { cardType: "Character", energyCost: 1 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "Character",
      sort: "cost-asc",
    });
    expect(ids(result)).toEqual(["char-1", "char-3"]);
  });
});

describe("deckSortLabel", () => {
  it("returns the display label for each known sort", () => {
    for (const option of DECK_SORT_OPTIONS) {
      expect(deckSortLabel(option.value)).toBe(option.label);
    }
  });
});

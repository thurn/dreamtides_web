import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { DeckCardView } from "./MobileDeckViewer";
import {
  BASE_DECK_TYPE_FILTER_OPTIONS,
  DECK_SORT_OPTIONS,
  SUBTYPE_FILTER_MIN_COUNT,
  buildDeckTypeFilterOptions,
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
  const displaySnapshot = makeCard(card);
  return {
    entryId,
    model: { cardId: displaySnapshot.id, displaySnapshot },
    isBane: false,
  };
}

/** N Character views of one subtype, keyed `<subtype>-0`, `<subtype>-1`, … */
function subtypeViews(subtype: string, count: number): DeckCardView[] {
  return Array.from({ length: count }, (_, i) =>
    view(`${subtype.toLowerCase() || "none"}-${String(i)}`, {
      cardType: "Character",
      subtype,
    }),
  );
}

const ids = (cards: DeckCardView[]): string[] =>
  cards.map((card) => card.entryId);

const values = <T extends string>(options: readonly { value: T }[]): T[] =>
  options.map((option) => option.value);

describe("filterAndSortDeckCards — filtering", () => {
  const deck: DeckCardView[] = [
    view("char-a", { cardType: "Character" }),
    view("event-a", { cardType: "Event" }),
    view("char-b", { cardType: "Character" }),
  ];

  it("returns every card for the 'all' filter", () => {
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "drafted",
    });
    expect(ids(result)).toEqual(["char-a", "event-a", "char-b"]);
  });

  it("keeps only characters when filtered to Character", () => {
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "type:Character",
      sort: "drafted",
    });
    expect(ids(result)).toEqual(["char-a", "char-b"]);
  });

  it("keeps only events when filtered to Event", () => {
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "type:Event",
      sort: "drafted",
    });
    expect(ids(result)).toEqual(["event-a"]);
  });

  it("keeps only the chosen subtype when filtered to a subtype", () => {
    const mixed = [
      view("warrior-1", { cardType: "Character", subtype: "Warrior" }),
      view("beast-1", { cardType: "Character", subtype: "Beast" }),
      view("warrior-2", { cardType: "Character", subtype: "Warrior" }),
    ];
    const result = filterAndSortDeckCards(mixed, {
      typeFilter: "subtype:Warrior",
      sort: "drafted",
    });
    expect(ids(result)).toEqual(["warrior-1", "warrior-2"]);
  });
});

describe("buildDeckTypeFilterOptions — smart subtype options", () => {
  it("offers only the base options when no subtype is well-represented", () => {
    const deck = [
      ...subtypeViews("Warrior", SUBTYPE_FILTER_MIN_COUNT - 1),
      view("event", { cardType: "Event" }),
    ];
    expect(values(buildDeckTypeFilterOptions(deck))).toEqual(
      values(BASE_DECK_TYPE_FILTER_OPTIONS),
    );
  });

  it("adds a subtype option once the deck holds more than the threshold", () => {
    const deck = subtypeViews("Warrior", SUBTYPE_FILTER_MIN_COUNT);
    const options = buildDeckTypeFilterOptions(deck);
    expect(values(options)).toContain("subtype:Warrior");
    const warrior = options.find((o) => o.value === "subtype:Warrior");
    expect(warrior?.label).toBeTruthy();
  });

  it("orders subtype options by count, most-represented first", () => {
    const deck = [
      ...subtypeViews("Beast", SUBTYPE_FILTER_MIN_COUNT),
      ...subtypeViews("Warrior", SUBTYPE_FILTER_MIN_COUNT + 2),
    ];
    const options = buildDeckTypeFilterOptions(deck).filter((o) =>
      o.value.startsWith("subtype:"),
    );
    expect(values(options)).toEqual(["subtype:Warrior", "subtype:Beast"]);
  });

  it("ignores cards with no subtype", () => {
    const deck = [
      ...subtypeViews("", SUBTYPE_FILTER_MIN_COUNT + 3),
      ...subtypeViews("*", SUBTYPE_FILTER_MIN_COUNT + 3),
    ];
    expect(values(buildDeckTypeFilterOptions(deck))).toEqual(
      values(BASE_DECK_TYPE_FILTER_OPTIONS),
    );
  });
});

describe("filterAndSortDeckCards — sorting", () => {
  it("preserves acquisition order for the 'drafted' sort", () => {
    const deck = [
      view("c", { energyCost: 3 }),
      view("a", { energyCost: 1 }),
      view("b", { energyCost: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "drafted",
    });
    expect(ids(result)).toEqual(["c", "a", "b"]);
  });

  it("sorts by cost low-to-high, placing variable (null) cost at the expensive end", () => {
    const deck = [
      view("x", { energyCost: null }),
      view("three", { energyCost: 3 }),
      view("one", { energyCost: 1 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "cost",
    });
    expect(ids(result)).toEqual(["one", "three", "x"]);
  });

  it("sorts by spark low-to-high, placing no-spark cards first", () => {
    const deck = [
      view("five", { spark: 5 }),
      view("none", { spark: null }),
      view("two", { spark: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "spark",
    });
    expect(ids(result)).toEqual(["none", "two", "five"]);
  });

  it("sorts by name A-to-Z", () => {
    const deck = [
      view("gamma", { name: asCardName("Gamma") }),
      view("alpha", { name: asCardName("Alpha") }),
      view("beta", { name: asCardName("Beta") }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "name",
    });
    expect(ids(result)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("sorts by subtype A-to-Z", () => {
    const deck = [
      view("wizard", { subtype: "Wizard" }),
      view("beast", { subtype: "Beast" }),
      view("mage", { subtype: "Mage" }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "subtype",
    });
    expect(ids(result)).toEqual(["beast", "mage", "wizard"]);
  });

  it("keeps acquisition order for cards that tie on the sort key (stable)", () => {
    const deck = [
      view("first-two", { energyCost: 2 }),
      view("second-two", { energyCost: 2 }),
      view("third-two", { energyCost: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "cost",
    });
    expect(ids(result)).toEqual(["first-two", "second-two", "third-two"]);
  });

  it("does not mutate the input array", () => {
    const deck = [view("c", { energyCost: 3 }), view("a", { energyCost: 1 })];
    const before = ids(deck);
    filterAndSortDeckCards(deck, { typeFilter: "all", sort: "cost" });
    expect(ids(deck)).toEqual(before);
  });

  it("filters and sorts together", () => {
    const deck = [
      view("char-3", { cardType: "Character", energyCost: 3 }),
      view("event-1", { cardType: "Event", energyCost: 1 }),
      view("char-1", { cardType: "Character", energyCost: 1 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "type:Character",
      sort: "cost",
    });
    expect(ids(result)).toEqual(["char-1", "char-3"]);
  });
});

describe("deckSortLabel", () => {
  it("returns the semantic sort value for each known sort", () => {
    for (const option of DECK_SORT_OPTIONS) {
      expect(deckSortLabel(option.value)).toBe(option.value);
    }
  });
});

import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import {
  parseCardName,
  type CardSubtype,
} from "../../types/card-identity";
import type { DeckCardView } from "./MobileDeckViewer";
import {
  BASE_DECK_TYPE_FILTER_OPTIONS,
  DECK_SORT_OPTIONS,
  SUBTYPE_FILTER_MIN_COUNT,
  buildDeckTypeFilterOptions,
  deckSortLabel,
  filterAndSortDeckCards,
} from "./mobile-deck-filter";
import type { DeckEntryId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import {
  testCardId,
  testCardSubtype,
} from "../../types/test-identities";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: parseCardName("Test Card"),
    id: testCardId("test-card"),
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
function view(entryId: DeckEntryId, card: Partial<CardData>): DeckCardView {
  const displaySnapshot = makeCard(card);
  return {
    entryId,
    model: { cardId: displaySnapshot.id, displaySnapshot },
    isBane: false,
  };
}

/** N Character views of one subtype, keyed `<subtype>-0`, `<subtype>-1`, … */
function subtypeViews(subtype: CardSubtype, count: number): DeckCardView[] {
  return Array.from({ length: count }, (_, i) =>
    view(parseDeckEntryId(`${subtype.toLowerCase() || "none"}-${String(i)}`), {
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
    view(parseDeckEntryId("char-a"), { cardType: "Character" }),
    view(parseDeckEntryId("event-a"), { cardType: "Event" }),
    view(parseDeckEntryId("char-b"), { cardType: "Character" }),
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
      view(parseDeckEntryId("warrior-1"), {
        cardType: "Character",
        subtype: "Warrior",
      }),
      view(parseDeckEntryId("beast-1"), {
        cardType: "Character",
        subtype: testCardSubtype("Beast"),
      }),
      view(parseDeckEntryId("warrior-2"), {
        cardType: "Character",
        subtype: "Warrior",
      }),
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
      view(parseDeckEntryId("event"), { cardType: "Event" }),
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
      ...subtypeViews(
        testCardSubtype("Beast"),
        SUBTYPE_FILTER_MIN_COUNT,
      ),
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
      view(parseDeckEntryId("c"), { energyCost: 3 }),
      view(parseDeckEntryId("a"), { energyCost: 1 }),
      view(parseDeckEntryId("b"), { energyCost: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "drafted",
    });
    expect(ids(result)).toEqual(["c", "a", "b"]);
  });

  it("sorts by cost low-to-high, placing variable (null) cost at the expensive end", () => {
    const deck = [
      view(parseDeckEntryId("x"), { energyCost: null }),
      view(parseDeckEntryId("three"), { energyCost: 3 }),
      view(parseDeckEntryId("one"), { energyCost: 1 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "cost",
    });
    expect(ids(result)).toEqual(["one", "three", "x"]);
  });

  it("sorts by spark low-to-high, placing no-spark cards first", () => {
    const deck = [
      view(parseDeckEntryId("five"), { spark: 5 }),
      view(parseDeckEntryId("none"), { spark: null }),
      view(parseDeckEntryId("two"), { spark: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "spark",
    });
    expect(ids(result)).toEqual(["none", "two", "five"]);
  });

  it("sorts by name A-to-Z", () => {
    const deck = [
      view(parseDeckEntryId("gamma"), { name: parseCardName("Gamma") }),
      view(parseDeckEntryId("alpha"), { name: parseCardName("Alpha") }),
      view(parseDeckEntryId("beta"), { name: parseCardName("Beta") }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "name",
    });
    expect(ids(result)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("sorts by subtype A-to-Z", () => {
    const deck = [
      view(parseDeckEntryId("wizard"), {
        subtype: testCardSubtype("Wizard"),
      }),
      view(parseDeckEntryId("beast"), {
        subtype: testCardSubtype("Beast"),
      }),
      view(parseDeckEntryId("mage"), { subtype: "Mage" }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "subtype",
    });
    expect(ids(result)).toEqual(["beast", "mage", "wizard"]);
  });

  it("keeps acquisition order for cards that tie on the sort key (stable)", () => {
    const deck = [
      view(parseDeckEntryId("first-two"), { energyCost: 2 }),
      view(parseDeckEntryId("second-two"), { energyCost: 2 }),
      view(parseDeckEntryId("third-two"), { energyCost: 2 }),
    ];
    const result = filterAndSortDeckCards(deck, {
      typeFilter: "all",
      sort: "cost",
    });
    expect(ids(result)).toEqual(["first-two", "second-two", "third-two"]);
  });

  it("does not mutate the input array", () => {
    const deck = [
      view(parseDeckEntryId("c"), { energyCost: 3 }),
      view(parseDeckEntryId("a"), { energyCost: 1 }),
    ];
    const before = ids(deck);
    filterAndSortDeckCards(deck, { typeFilter: "all", sort: "cost" });
    expect(ids(deck)).toEqual(before);
  });

  it("filters and sorts together", () => {
    const deck = [
      view(parseDeckEntryId("char-3"), { cardType: "Character", energyCost: 3 }),
      view(parseDeckEntryId("event-1"), { cardType: "Event", energyCost: 1 }),
      view(parseDeckEntryId("char-1"), { cardType: "Character", energyCost: 1 }),
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

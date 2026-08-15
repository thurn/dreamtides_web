import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type { DeckCardView } from "./MobileDeckViewer";
import {
  DEFAULT_DESKTOP_DECK_FILTER_SORT,
  buildSubtypeFilterOptions,
  filterAndSortDesktopDeckCards,
} from "./desktop-deck-filter";
import type { DeckEntryId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";

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

const ids = (cards: DeckCardView[]): string[] =>
  cards.map((card) => card.entryId);

const values = <T extends string>(options: readonly { value: T }[]): T[] =>
  options.map((option) => option.value);

describe("filterAndSortDesktopDeckCards — type + subtype filtering", () => {
  const deck: DeckCardView[] = [
    view(parseDeckEntryId("char-warrior"), {
      cardType: "Character",
      subtype: "Warrior",
    }),
    view(parseDeckEntryId("event-a"), { cardType: "Event", subtype: "" }),
    view(parseDeckEntryId("char-beast"), {
      cardType: "Character",
      subtype: "Monster",
    }),
  ];

  it("returns every card for the default (all / all) filter", () => {
    const result = filterAndSortDesktopDeckCards(
      deck,
      DEFAULT_DESKTOP_DECK_FILTER_SORT,
    );
    expect(ids(result)).toEqual(["char-warrior", "event-a", "char-beast"]);
  });

  it("keeps only the chosen card type", () => {
    const result = filterAndSortDesktopDeckCards(deck, {
      ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
      type: "Character",
    });
    expect(ids(result)).toEqual(["char-warrior", "char-beast"]);
  });

  it("keeps only the chosen subtype", () => {
    const result = filterAndSortDesktopDeckCards(deck, {
      ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
      subtype: "Warrior",
    });
    expect(ids(result)).toEqual(["char-warrior"]);
  });

  it("intersects the type and subtype axes", () => {
    const result = filterAndSortDesktopDeckCards(deck, {
      ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
      type: "Event",
      subtype: "Warrior",
    });
    expect(ids(result)).toEqual(["event-a"]);
  });
});

describe("buildSubtypeFilterOptions", () => {
  it("lists an 'all' entry then every present subtype, alphabetical", () => {
    const deck = [
      view(parseDeckEntryId("a"), { subtype: "Mage" }),
      view(parseDeckEntryId("b"), { subtype: "Monster" }),
      view(parseDeckEntryId("c"), { subtype: "Monster" }),
      view(parseDeckEntryId("d"), { subtype: "" }),
      view(parseDeckEntryId("e"), { subtype: "*" }),
    ];
    expect(values(buildSubtypeFilterOptions(deck))).toEqual([
      "all",
      "Mage",
      "Monster",
    ]);
  });

  it("returns only the 'all' entry when no card has a subtype", () => {
    const deck = [
      view(parseDeckEntryId("a"), { subtype: "" }),
      view(parseDeckEntryId("b"), { subtype: "" }),
    ];
    expect(values(buildSubtypeFilterOptions(deck))).toEqual(["all"]);
  });
});

describe("filterAndSortDesktopDeckCards — sort key + direction", () => {
  const deck: DeckCardView[] = [
    view(parseDeckEntryId("three"), { energyCost: 3 }),
    view(parseDeckEntryId("one"), { energyCost: 1 }),
    view(parseDeckEntryId("two"), { energyCost: 2 }),
  ];

  it("preserves acquisition order for drafted ascending", () => {
    const result = filterAndSortDesktopDeckCards(deck, {
      ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
      sort: "drafted",
      direction: "asc",
    });
    expect(ids(result)).toEqual(["three", "one", "two"]);
  });

  it("reverses acquisition order for drafted descending", () => {
    const result = filterAndSortDesktopDeckCards(deck, {
      ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
      sort: "drafted",
      direction: "desc",
    });
    expect(ids(result)).toEqual(["two", "one", "three"]);
  });

  it("sorts by cost low-to-high for ascending", () => {
    const result = filterAndSortDesktopDeckCards(deck, {
      ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
      sort: "cost",
      direction: "asc",
    });
    expect(ids(result)).toEqual(["one", "two", "three"]);
  });

  it("sorts by cost high-to-low for descending", () => {
    const result = filterAndSortDesktopDeckCards(deck, {
      ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
      sort: "cost",
      direction: "desc",
    });
    expect(ids(result)).toEqual(["three", "two", "one"]);
  });

  it("does not mutate the input array", () => {
    const before = ids(deck);
    filterAndSortDesktopDeckCards(deck, {
      ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
      sort: "cost",
      direction: "desc",
    });
    expect(ids(deck)).toEqual(before);
  });
});

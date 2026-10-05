import { describe, expect, it } from "vitest";
import { parseCardName, type CardSubtype } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import {
  parseAtlasNodeId,
  parseDeckEntryId,
  parseDreamsignId,
  type DeckEntryId,
} from "../../types/identifiers";
import {
  testArtAssetKey,
  testCardId,
  testCardSubtype,
  testDreamscapeId,
  testGuideId,
} from "../../types/test-identities";
import type { AtlasNodeModel } from "../components/atlas/AtlasNode";
import { artRef, resolveArtRef } from "../primitives/art";
import { atlasPreflightImageUrls } from "./atlas-preflight";
import {
  DEFAULT_DESKTOP_DECK_FILTER_SORT,
  buildSubtypeFilterOptions,
  filterAndSortDesktopDeckCards,
  type SortDirection,
} from "./desktop-deck-filter";
import { buildLoadingCalloutLeaderLine } from "./loading-callout-geometry";
import {
  BASE_DECK_TYPE_FILTER_OPTIONS,
  SUBTYPE_FILTER_MIN_COUNT,
  buildDeckTypeFilterOptions,
  filterAndSortDeckCards,
  type DeckSortId,
  type DeckTypeFilter,
} from "./mobile-deck-filter";
import type { DeckCardView } from "./MobileDeckViewer";

/** A deck-card view around a synthetic card, keyed by its entry id. */
function view(entryId: DeckEntryId, card: Partial<CardData> = {}): DeckCardView {
  const displaySnapshot: CardData = {
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
    ...card,
  };
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

describe("filterAndSortDesktopDeckCards", () => {
  const typed: DeckCardView[] = [
    view(parseDeckEntryId("char-warrior"), { cardType: "Character", subtype: "Warrior" }),
    view(parseDeckEntryId("event-a"), { cardType: "Event", subtype: "" }),
    view(parseDeckEntryId("char-beast"), { cardType: "Character", subtype: "Monster" }),
  ];
  const costed: DeckCardView[] = [
    view(parseDeckEntryId("three"), { energyCost: 3 }),
    view(parseDeckEntryId("one"), { energyCost: 1 }),
    view(parseDeckEntryId("two"), { energyCost: 2 }),
  ];

  it("filters on the type and subtype axes", () => {
    const filter = (
      overrides: Partial<typeof DEFAULT_DESKTOP_DECK_FILTER_SORT>,
    ): string[] =>
      ids(
        filterAndSortDesktopDeckCards(typed, {
          ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
          ...overrides,
        }),
      );

    expect(filter({})).toEqual(["char-warrior", "event-a", "char-beast"]);
    expect(filter({ type: "Character" })).toEqual([
      "char-warrior",
      "char-beast",
    ]);
    expect(filter({ subtype: "Warrior" })).toEqual(["char-warrior"]);
    expect(filter({ type: "Event", subtype: "Warrior" })).toEqual(["event-a"]);
  });

  it("sorts by key and direction without mutating the input", () => {
    const sort = (sortKey: DeckSortId, direction: SortDirection): string[] =>
      ids(
        filterAndSortDesktopDeckCards(costed, {
          ...DEFAULT_DESKTOP_DECK_FILTER_SORT,
          sort: sortKey,
          direction,
        }),
      );

    expect(sort("drafted", "asc")).toEqual(["three", "one", "two"]);
    expect(sort("drafted", "desc")).toEqual(["two", "one", "three"]);
    expect(sort("cost", "asc")).toEqual(["one", "two", "three"]);
    expect(sort("cost", "desc")).toEqual(["three", "two", "one"]);
    expect(ids(costed)).toEqual(["three", "one", "two"]);
  });

  it("lists 'all' then every present subtype alphabetically", () => {
    expect(
      values(
        buildSubtypeFilterOptions([
          view(parseDeckEntryId("a"), { subtype: "Mage" }),
          view(parseDeckEntryId("b"), { subtype: "Monster" }),
          view(parseDeckEntryId("c"), { subtype: "Monster" }),
          view(parseDeckEntryId("d"), { subtype: "" }),
          view(parseDeckEntryId("e"), { subtype: "*" }),
        ]),
      ),
    ).toEqual(["all", "Mage", "Monster"]);
    expect(values(buildSubtypeFilterOptions([view(parseDeckEntryId("a"))]))).toEqual(["all"]);
  });
});

describe("filterAndSortDeckCards", () => {
  it("filters by card type and by subtype", () => {
    const deck = [
      view(parseDeckEntryId("warrior-1"), { cardType: "Character", subtype: "Warrior" }),
      view(parseDeckEntryId("event-a"), { cardType: "Event" }),
      view(parseDeckEntryId("beast-1"), {
        cardType: "Character",
        subtype: testCardSubtype("Beast"),
      }),
      view(parseDeckEntryId("warrior-2"), { cardType: "Character", subtype: "Warrior" }),
    ];
    const filter = (typeFilter: DeckTypeFilter): string[] =>
      ids(filterAndSortDeckCards(deck, { typeFilter, sort: "drafted" }));

    expect(filter("all")).toEqual([
      "warrior-1",
      "event-a",
      "beast-1",
      "warrior-2",
    ]);
    expect(filter("type:Character")).toEqual([
      "warrior-1",
      "beast-1",
      "warrior-2",
    ]);
    expect(filter("subtype:Warrior")).toEqual(["warrior-1", "warrior-2"]);
  });

  it("sorts stably by each key, placing null costs last and null sparks first", () => {
    const sort = (deck: DeckCardView[], sortKey: DeckSortId): string[] =>
      ids(filterAndSortDeckCards(deck, { typeFilter: "all", sort: sortKey }));
    const costed = [
      view(parseDeckEntryId("x"), { energyCost: null }),
      view(parseDeckEntryId("three"), { energyCost: 3 }),
      view(parseDeckEntryId("one"), { energyCost: 1 }),
    ];

    expect(sort(costed, "drafted")).toEqual(["x", "three", "one"]);
    expect(sort(costed, "cost")).toEqual(["one", "three", "x"]);
    expect(ids(costed)).toEqual(["x", "three", "one"]);
    expect(
      sort(
        [
          view(parseDeckEntryId("five"), { spark: 5 }),
          view(parseDeckEntryId("none"), { spark: null }),
          view(parseDeckEntryId("two"), { spark: 2 }),
        ],
        "spark",
      ),
    ).toEqual(["none", "two", "five"]);
    expect(
      sort(
        [
          view(parseDeckEntryId("gamma"), { name: parseCardName("Gamma") }),
          view(parseDeckEntryId("alpha"), { name: parseCardName("Alpha") }),
          view(parseDeckEntryId("beta"), { name: parseCardName("Beta") }),
        ],
        "name",
      ),
    ).toEqual(["alpha", "beta", "gamma"]);
    expect(
      sort(
        [
          view(parseDeckEntryId("wizard"), { subtype: testCardSubtype("Wizard") }),
          view(parseDeckEntryId("beast"), { subtype: testCardSubtype("Beast") }),
          view(parseDeckEntryId("mage"), { subtype: "Mage" }),
        ],
        "subtype",
      ),
    ).toEqual(["beast", "mage", "wizard"]);
    expect(
      sort(
        [
          view(parseDeckEntryId("first-two"), { energyCost: 2 }),
          view(parseDeckEntryId("second-two"), { energyCost: 2 }),
          view(parseDeckEntryId("third-two"), { energyCost: 2 }),
        ],
        "cost",
      ),
    ).toEqual(["first-two", "second-two", "third-two"]);
  });

  it("filters and sorts together", () => {
    const deck = [
      view(parseDeckEntryId("char-3"), { cardType: "Character", energyCost: 3 }),
      view(parseDeckEntryId("event-1"), { cardType: "Event", energyCost: 1 }),
      view(parseDeckEntryId("char-1"), { cardType: "Character", energyCost: 1 }),
    ];
    expect(
      ids(
        filterAndSortDeckCards(deck, {
          typeFilter: "type:Character",
          sort: "cost",
        }),
      ),
    ).toEqual(["char-1", "char-3"]);
  });
});

describe("buildDeckTypeFilterOptions", () => {
  const base = values(BASE_DECK_TYPE_FILTER_OPTIONS);

  it("offers only the base options until a subtype reaches the threshold", () => {
    expect(
      values(
        buildDeckTypeFilterOptions([
          ...subtypeViews("Warrior", SUBTYPE_FILTER_MIN_COUNT - 1),
          view(parseDeckEntryId("event"), { cardType: "Event" }),
        ]),
      ),
    ).toEqual(base);
    expect(
      values(
        buildDeckTypeFilterOptions([
          ...subtypeViews("", SUBTYPE_FILTER_MIN_COUNT + 3),
          ...subtypeViews("*", SUBTYPE_FILTER_MIN_COUNT + 3),
        ]),
      ),
    ).toEqual(base);
  });

  it("adds subtype options at the threshold, most-represented first", () => {
    const options = buildDeckTypeFilterOptions([
      ...subtypeViews(testCardSubtype("Beast"), SUBTYPE_FILTER_MIN_COUNT),
      ...subtypeViews("Warrior", SUBTYPE_FILTER_MIN_COUNT + 2),
    ]);
    expect(
      values(options).filter((value) => value.startsWith("subtype:")),
    ).toEqual(["subtype:Warrior", "subtype:Beast"]);
  });
});

describe("atlasPreflightImageUrls", () => {
  function item(
    idSeed: string,
    overrides: Partial<AtlasNodeModel>,
  ): AtlasNodeModel {
    return {
      id: parseAtlasNodeId(idSeed),
      name: idSeed,
      state: "available",
      role: "regular",
      isReachable: true,
      iconRef: null,
      unrevealedFrameRef: artRef.atlasAsset(
        testArtAssetKey("fixture-frame.png"),
      ),
      siteBadgeGlyph: null,
      knownDreamsignRef: null,
      primary: {
        sceneArt: null,
        figureArt: null,
        title: "Guide",
        body: "A dreamscape.",
        placeName: "Place",
        guideName: "Guide",
      },
      dreamsign: null,
      site: null,
      affiliation: null,
      ...overrides,
    };
  }

  it("collects screen and reveal images once in first-seen order", () => {
    const icon = artRef.dreamscapeIcon(testDreamscapeId("wilderveil"));
    const scene = artRef.dreamscapeScene(testDreamscapeId("wilderveil"));
    const guide = artRef.dreamGuide(testGuideId("aldric"));
    const dreamsign = artRef.dreamsign("magic-ball.png");
    const primary = {
      ...item("base", {}).primary,
      sceneArt: scene,
      figureArt: guide,
    };

    const urls = atlasPreflightImageUrls([
      item("first", {
        iconRef: icon,
        knownDreamsignRef: dreamsign,
        primary,
        dreamsign: {
          id: parseDreamsignId("00000000-0000-4000-8000-000000000099"),
          name: "The Held Star",
          art: dreamsign,
          rulesText: "Gain 1 essence.",
        },
      }),
      item("duplicate", { iconRef: icon, primary }),
    ]);

    expect(urls).toEqual([
      resolveArtRef(icon),
      resolveArtRef(dreamsign),
      resolveArtRef(scene),
      resolveArtRef(guide),
    ]);
  });
});

describe("buildLoadingCalloutLeaderLine", () => {
  it("connects a left callout to the target's left edge", () => {
    const line = buildLoadingCalloutLeaderLine(
      { left: 100, top: 50, right: 600, bottom: 650, width: 500, height: 600 },
      { left: 120, top: 140, right: 220, bottom: 188, width: 100, height: 48 },
      { left: 260, top: 150, right: 296, bottom: 186, width: 36, height: 36 },
    );

    expect(line).toMatchObject({
      startX: 120,
      startY: 118,
      endX: 160,
      endY: 118,
    });
    expect(line.path.endsWith("L 160 118")).toBe(true);
  });

  it("connects a right callout to the target's right edge", () => {
    const line = buildLoadingCalloutLeaderLine(
      { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 },
      { left: 380, top: 80, right: 480, bottom: 128, width: 100, height: 48 },
      { left: 330, top: 70, right: 370, bottom: 110, width: 40, height: 40 },
    );

    expect(line.startX).toBe(380);
    expect(line.endX).toBe(370);
    expect(line.endY).toBe(90);
  });

  it("clamps the line start away from the bubble's rounded corners", () => {
    const line = buildLoadingCalloutLeaderLine(
      { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 },
      { left: 20, top: 200, right: 120, bottom: 248, width: 100, height: 48 },
      { left: 200, top: 150, right: 220, bottom: 170, width: 20, height: 20 },
    );

    expect(line.startY).toBe(208);
    expect(line.endY).toBe(160);
    expect(line.path.endsWith("L 192 160 L 200 160")).toBe(true);
  });
});

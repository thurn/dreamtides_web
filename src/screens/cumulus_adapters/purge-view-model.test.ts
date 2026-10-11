import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { testJourneyState } from "../../testing/journey-genesis";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type {
  DeckEntry,
  SiteState,
} from "../../types/journey";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import {
  testCardId,
  testDreamscapeId,
  testGuideArtKey,
  testGuideId,
} from "../../types/test-identities";
import type { DreamGuideContent } from "../../types/content";
import { economyFixture } from "../../testing/economy-fixture";
import {
  buildPurgeCardViews as buildPurgeCardViewsImpl,
  buildPurgeSiteView as buildPurgeSiteViewImpl,
} from "./purge-view-model";
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";

describe("purge-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const transfigurationData = transfigurationFixture();

  const buildPurgeCardViews = (
    ...args: Parameters<typeof buildPurgeCardViewsImpl> extends readonly [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ) => buildPurgeCardViewsImpl(transfigurationData, ...args);

  const buildPurgeSiteView = (
    params: Omit<
      Parameters<typeof buildPurgeSiteViewImpl>[0],
      "transfigurationData" | "sitesData"
    >,
  ) =>
    buildPurgeSiteViewImpl({
      ...params,
      transfigurationData,
      sitesData: MINIMAL_SITES_DATA,
    });

  const GUIDE = {
    id: testGuideId("fixture-purge-guide"),
    name: "Fixture Purge Guide",
    homeDreamscapeId: testDreamscapeId("fixture-home"),
    siteType: "Purge",
    portraitSource: "fixture-guide.png",
    artKey: testGuideArtKey("fixture-guide"),
    headTargetX: 0.6,
    dialogue: { site: ["Fixture line."] },
    homeSpecialty: "Fixture specialty.",
  } satisfies DreamGuideContent;

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

  function makeEntry(overrides: Partial<DeckEntry> = {}): DeckEntry {
    return {
      entryId: parseDeckEntryId("entry-1"),
      cardNumber: 1,
      transfiguration: null,
      isBane: false,
      ...overrides,
    };
  }

  function database(...cards: CardData[]): Map<number, CardData> {
    return new Map(cards.map((card) => [card.cardNumber, card]));
  }

  const site: SiteState = {
    id: parseSiteId("site-purge"),
    type: "Purge",
    isEnhanced: false,
    isVisited: false,
  };

  describe("buildPurgeCardViews", () => {
    it("keeps concrete entry ids and marks Nightmare as free", () => {
      const cards = buildPurgeCardViews(
        [
          makeEntry({ entryId: parseDeckEntryId("paid"), cardNumber: 1 }),
          makeEntry({
            entryId: parseDeckEntryId("nightmare"),
            cardNumber: 10002,
            isBane: true,
          }),
        ],
        database(makeCard({ cardNumber: 1 }), makeCard({ cardNumber: 10002 })),
      );

      expect(cards.map((card) => [card.entryId, card.purgeCostKind])).toEqual([
        ["paid", "paid"],
        ["nightmare", "free"],
      ]);
    });
  });

  describe("buildPurgeSiteView", () => {
    it("caps paid selections by current essence and leaves free Nightmare selectable", () => {
      const base = testJourneyState();
      const state = {
        ...base,
        essence: 0,
        deck: [
          makeEntry({ entryId: parseDeckEntryId("paid-a"), cardNumber: 1 }),
          makeEntry({ entryId: parseDeckEntryId("paid-b"), cardNumber: 2 }),
          makeEntry({
            entryId: parseDeckEntryId("nightmare"),
            cardNumber: 10002,
            isBane: true,
          }),
        ],
      };

      const view = buildPurgeSiteView({
        state,
        scene: null,
        site,
        cardDatabase: database(
          makeCard({ cardNumber: 1 }),
          makeCard({ cardNumber: 2 }),
          makeCard({ cardNumber: 10002 }),
        ),
        guide: GUIDE,
        guideLine: "Fixture line.",
        economyData: economyFixture(),
      });

      expect(view.maxPaidSelections).toBe(0);
      expect(
        view.cards.map((card) => [card.entryId, card.purgeCostKind]),
      ).toEqual([
        ["paid-a", "paid"],
        ["paid-b", "paid"],
        ["nightmare", "free"],
      ]);
    });
  });
});

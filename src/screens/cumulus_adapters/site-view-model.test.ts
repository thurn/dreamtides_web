import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { createDefaultState } from "../../state/journey-context";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type {
  CardChoiceSiteRuntime,
  DeckEntry,
  TransfigurationType,
  SiteState,
  DreamscapeNode,
  RewardSiteRuntime,
} from "../../types/journey";
import { buildTransfigurationCandidates as buildTransfigurationCandidatesImpl } from "./transfiguration-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import {
  parseDeckEntryId,
  parseSiteId,
  parseAtlasNodeId,
} from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import {
  testCardId,
  testDreamscapeId,
  testGuideId,
  testDreamsignId,
} from "../../types/test-identities";
import type { DreamGuideContent } from "../../types/content";
import { economyFixture } from "../../testing/economy-fixture";
import {
  buildPurgeCardViews as buildPurgeCardViewsImpl,
  buildPurgeSiteView as buildPurgeSiteViewImpl,
} from "./purge-view-model";
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import {
  buildDuplicationCards as buildDuplicationCardsImpl,
  buildDuplicationOfferLog,
} from "./duplication-view-model";
import { LayerName } from "../../types/layer-name";
import { buildRandomSiteView } from "./random-site-view-model";
import { buildInlineRewardCompletionLog } from "./inline-reward-view-model";

describe("transfiguration-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const transfigurationData = transfigurationFixture();

  const buildTransfigurationCandidates = (
    ...args: Parameters<
      typeof buildTransfigurationCandidatesImpl
    > extends readonly [unknown, ...infer Rest]
      ? Rest
      : never
  ) => buildTransfigurationCandidatesImpl(transfigurationData, ...args);

  function makeCard(cardNumber: number): CardData {
    return {
      name: parseCardName(`Fixture ${String(cardNumber)}`),
      id: testCardId(
        `00000000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`,
      ),
      cardNumber,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 2,
      spark: 2,
      isFast: false,
      renderedText: "Materialized: Gain 1 essence.",
      imageNumber: cardNumber,
      artOwned: true,
    };
  }

  function makeEntry(cardNumber: number): DeckEntry {
    return {
      entryId: parseDeckEntryId(`entry-${String(cardNumber)}`),
      cardNumber,
      transfiguration: null,
      isBane: false,
    };
  }

  function offer(
    entryId: DeckEntryId,
    type: TransfigurationType,
    cost: number,
  ) {
    return {
      entryId,
      type,
      effectDescription: `${type} fixture effect.`,
      effectDetails: { fixture: type },
      previewCard: makeCard(Number(entryId.replace("entry-", ""))),
      essenceCost: cost,
    };
  }

  function runtime(): CardChoiceSiteRuntime {
    return {
      kind: "cardChoice",
      choiceKind: "transfiguration",
      entryIds: [
        parseDeckEntryId("entry-1"),
        parseDeckEntryId("entry-2"),
        parseDeckEntryId("entry-3"),
        parseDeckEntryId("entry-4"),
      ],
      acceptedEntryIds: [],
      transfigurationOffers: [
        offer(parseDeckEntryId("entry-1"), "Empowered", 40),
        offer(parseDeckEntryId("entry-1"), "Kindled", 70),
        offer(parseDeckEntryId("entry-2"), "Amplified", 20),
        offer(parseDeckEntryId("entry-3"), "Resonant", 30),
        offer(parseDeckEntryId("entry-4"), "Perfected", 50),
      ],
    };
  }

  describe("buildTransfigurationCandidates", () => {
    it("groups form rows by concrete entry id, keeps UUID card identity, and caps the standard offer at three cards", () => {
      const state = {
        ...createDefaultState(),
        essence: 50,
        deck: [makeEntry(1), makeEntry(2), makeEntry(3), makeEntry(4)],
      };
      const cardDatabase = new Map(
        state.deck.map((entry) => [
          entry.cardNumber,
          makeCard(entry.cardNumber),
        ]),
      );

      const candidates = buildTransfigurationCandidates(
        state,
        runtime(),
        cardDatabase,
        false,
      );

      expect(candidates.map((candidate) => candidate.entryId)).toEqual([
        "entry-1",
        "entry-2",
        "entry-3",
      ]);
      expect(candidates[0]?.model.cardId).toBe(cardDatabase.get(1)?.id);
      expect(candidates[0]?.forms.map((form) => form.type)).toEqual([
        "Empowered",
        "Kindled",
      ]);
      expect(candidates[0]?.forms.map((form) => form.pricing)).toEqual([
        { kind: "essence", amount: 40, affordable: true },
        { kind: "essence", amount: 70, affordable: false },
      ]);
      expect(candidates[0]?.forms[0]?.previewModel.transfiguration?.type).toBe(
        "Empowered",
      );
    });

    it("skips missing, already-transfigured, and form-less entries", () => {
      const state = {
        ...createDefaultState(),
        essence: 100,
        deck: [{ ...makeEntry(1), transfiguration: "Kindled" as const }],
      };
      expect(
        buildTransfigurationCandidates(
          state,
          runtime(),
          new Map([[1, makeCard(1)]]),
          false,
        ),
      ).toEqual([]);
    });

    it("shows the whole enhanced deck in deck order and keeps reforged cards as disabled context", () => {
      const state = {
        ...createDefaultState(),
        essence: 100,
        deck: [
          makeEntry(4),
          makeEntry(2),
          { ...makeEntry(5), transfiguration: "Kindled" as const },
          makeEntry(1),
          makeEntry(3),
        ],
      };
      const cardDatabase = new Map(
        state.deck.map((entry) => [
          entry.cardNumber,
          makeCard(entry.cardNumber),
        ]),
      );

      const candidates = buildTransfigurationCandidates(
        state,
        runtime(),
        cardDatabase,
        true,
      );

      expect(candidates.map((candidate) => candidate.entryId)).toEqual([
        "entry-4",
        "entry-2",
        "entry-5",
        "entry-1",
        "entry-3",
      ]);
      expect(candidates.map((candidate) => candidate.availability)).toEqual([
        "available",
        "available",
        "reforged",
        "available",
        "available",
      ]);
      expect(candidates[2]).toMatchObject({
        reforgedType: "Kindled",
        forms: [],
      });
      expect(candidates[2]?.model.transfiguration?.type).toBe("Kindled");
    });
  });
});

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
      const base = createDefaultState();
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
        sceneNode: null,
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

describe("duplication-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const transfigurationData = transfigurationFixture();

  const buildDuplicationCards = (
    ...args: Parameters<typeof buildDuplicationCardsImpl> extends readonly [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ) => buildDuplicationCardsImpl(transfigurationData, ...args);

  function makeCard(cardNumber: number): CardData {
    return {
      name: parseCardName(`Fixture ${String(cardNumber)}`),
      id: testCardId(
        `00000000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`,
      ),
      cardNumber,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 2,
      spark: 2,
      isFast: false,
      renderedText: "Materialized: Gain 1 essence.",
      imageNumber: cardNumber,
      artOwned: true,
    };
  }

  function makeEntry(cardNumber: number): DeckEntry {
    return {
      entryId: parseDeckEntryId(`entry-${String(cardNumber)}`),
      cardNumber,
      transfiguration: null,
      isBane: false,
    };
  }

  function runtime(
    acceptedEntryIds: DeckEntryId[] = [],
  ): CardChoiceSiteRuntime {
    return {
      kind: "cardChoice",
      choiceKind: "duplication",
      entryIds: [
        parseDeckEntryId("entry-2"),
        parseDeckEntryId("missing-entry"),
        parseDeckEntryId("entry-1"),
      ],
      acceptedEntryIds,
    };
  }

  describe("buildDuplicationCards", () => {
    it("preserves persisted concrete entry order and canonical UUID identity", () => {
      const state = {
        ...createDefaultState(),
        deck: [makeEntry(1), makeEntry(2)],
      };
      const cardDatabase = new Map([
        [1, makeCard(1)],
        [2, makeCard(2)],
      ]);

      const cards = buildDuplicationCards(state, runtime(), cardDatabase);

      expect(cards.map((card) => card.entryId)).toEqual(["entry-2", "entry-1"]);
      expect(cards.map((card) => card.model.cardId)).toEqual([
        cardDatabase.get(2)?.id,
        cardDatabase.get(1)?.id,
      ]);
    });
  });

  describe("buildDuplicationOfferLog", () => {
    it("records persisted entry ids with canonical card UUIDs", () => {
      const state = {
        ...createDefaultState(),
        deck: [makeEntry(1), makeEntry(2)],
      };
      const cardDatabase = new Map([
        [1, makeCard(1)],
        [2, makeCard(2)],
      ]);

      expect(buildDuplicationOfferLog(state, runtime(), cardDatabase)).toEqual([
        {
          entryId: parseDeckEntryId("entry-2"),
          cardId: cardDatabase.get(2)?.id,
        },
        {
          entryId: parseDeckEntryId("entry-1"),
          cardId: cardDatabase.get(1)?.id,
        },
      ]);
    });
  });
});

describe("random-site-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  describe("buildRandomSiteView", () => {
    it("projects guide dialogue and site-registry icons into the display model", () => {
      const sitesData = {
        ...MINIMAL_SITES_DATA,
        siteTypes: {
          ...MINIMAL_SITES_DATA.siteTypes,
          Shop: {
            ...MINIMAL_SITES_DATA.siteTypes.Shop,
            icon: "synthetic-toml-shop-icon",
          },
        },
      };
      const site: SiteState & { type: "RandomSite" } = {
        id: parseSiteId("fixture-random-site"),
        type: "RandomSite",
        isEnhanced: true,
        isVisited: false,
      };
      const node: DreamscapeNode = {
        id: parseAtlasNodeId("fixture-node"),
        layer: LayerName.Four,
        indexInLayer: 0,
        dreamscapeId: testDreamscapeId("fixture-dreamscape"),
        sites: [site],
        position: { x: 0, y: 0 },
        state: "available",
        enhancedSiteType: "RandomSite",
        forwardIds: [],
        backwardIds: [],
        knownDreamsignId: null,
      };

      const view = buildRandomSiteView({
        sceneNode: node,
        site,
        runtime: {
          kind: "randomSite",
          offeredSiteTypes: ["Shop"],
          selectedSiteType: null,
        },
        guide: {
          id: sitesData.randomSite.guideId,
          name: "Fixture Guide",
          homeDreamscapeId: testDreamscapeId("fixture-dreamscape"),
          siteType: "RandomSite",
          portraitSource: "fixture-guide.png",
          dialogue: { site: [] },
          homeSpecialty: "Fixture specialty",
        },
        sitesData,
        guideLine: "Synthetic guide copy",
      });

      expect(view.guide.line).toBe("Synthetic guide copy");
      expect(view.choices[0].icon).toBe(sitesData.siteTypes.Shop.icon);
    });
  });
});

describe("inline-reward-view-model", () => {
  const STATE = { essence: 90 };

  function site(type: SiteState["type"]): SiteState {
    return {
      id: parseSiteId("site-uuid"),
      type,
      isEnhanced: false,
      isVisited: false,
    };
  }

  describe("buildInlineRewardCompletionLog", () => {
    it("identifies a Dreamsign grant by UUID", () => {
      const dreamsignId = testDreamsignId("dreamsign-uuid");
      const runtime: RewardSiteRuntime = {
        kind: "reward",
        reward: {
          rewardType: "dreamsign",
          dreamsign: {
            id: dreamsignId,
            name: "Display name",
            effectDescription: "A test effect.",
          },
        },
        remainingDreamsignPoolIds: [],
        accepted: false,
      };

      const result = buildInlineRewardCompletionLog(
        site("Reward"),
        runtime,
        STATE,
      );
      expect(result?.kind).toBe("reward");
      expect(result?.fields.rewardType).toBe("dreamsign");
      expect(result?.fields.dreamsignId).toBe(dreamsignId);
    });
  });
});

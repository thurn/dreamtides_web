import { testJourneySeed } from "../types/test-identities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import {
  loadTestAffiliations,
  loadTestAtlasData,
  loadTestSitesData,
  loadTestDreamGuides,
  loadTestDreamscapes,
  makeTestAtlasNode,
} from "../__test-helpers__/atlas-fixtures";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import type {
  DreamAvatarContent,
  ResolvedDreamAvatarPackage,
} from "../types/content";
import type { JourneyContent } from "../data/journey-content";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
  TEST_STARTER_CARD_NUMBERS,
} from "../__test-helpers__/pool-context";
import type { DreamAtlas, JourneyState } from "../types/journey";
import type { PoolDraftState } from "../types/draft";
import { toJourneyDreamAvatar } from "../data/dream-avatar-selection";
import { createDefaultState } from "./journey-context";
import {
  addCardToJourneyState,
  changeJourneyEssence,
  commitPreparedDraftCardPickInJourneyState,
  completeJourneySite,
  insertPreparedSiteInJourneyState,
  nextDeckEntryId,
  pickDraftCardInJourneyState,
  prepareDraftCardPickInJourneyState,
  setJourneyScreen,
  startJourneyFromDreamAvatar,
  updateJourneyAtlas,
} from "./journey-state-actions";
import { parseAtlasNodeId } from "../types/identifiers";
import { parseSiteId } from "../types/identifiers";
import { parseDeckEntryId } from "../types/identifiers";
import { testDreamAvatarId, testDreamsignId, testCardId } from "../types/test-identities";

function makeCard(
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    name: parseCardName(`Card ${String(cardNumber)}`),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Event",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
    ...overrides,
  };
}

function makeDreamAvatar(): DreamAvatarContent {
  return {
    id: testDreamAvatarId("dream-avatar-1"),
    name: "Test DreamAvatar",
    title: "State Witness",
    renderedText: "Test ability.",
    imageNumber: "0006",
    portraitFocus: { x: 0.42, y: 0.18 },
    startingEssence: 275,
    signatureCards: [parseCardName("Alpha Card 1")],
  };
}

function makeJourneyContent(
  dreamAvatar: DreamAvatarContent = makeDreamAvatar(),
): JourneyContent {
  const starterCards = TEST_STARTER_CARD_NUMBERS.map((cardNumber) =>
    makeCard(cardNumber, { isStarter: true }),
  );
  const corpusCards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    [...starterCards, ...corpusCards].map((card) => [card.cardNumber, card]),
  );

  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase,
    dreamAvatars: [dreamAvatar],

    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: loadTestDreamscapes(),
    affiliations: loadTestAffiliations(),
    guides: loadTestDreamGuides(),
    atlasData: loadTestAtlasData(),
    sitesData: loadTestSitesData(),
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
    poolContext: makeTestPoolContext(["dreamsign-a", "dreamsign-b"]),
  };
}

function makeAtlas(): DreamAtlas {
  return {
    layers: [[parseAtlasNodeId("dreamscape-1")]],
    startingNodeId: parseAtlasNodeId("dreamscape-1"),
    bossNodeId: parseAtlasNodeId("dreamscape-1"),
    currentNodeId: parseAtlasNodeId("dreamscape-1"),
    knownDreamsignCarrierIds: [],
    nodes: {
      [parseAtlasNodeId("dreamscape-1")]: makeTestAtlasNode(
        "dreamscape-1",
        [
          {
            id: parseSiteId("site-1"),
            type: "Draft",
            isEnhanced: false,
            isVisited: false,
          },
          {
            id: parseSiteId("site-2"),
            type: "Battle",
            isEnhanced: false,
            isVisited: false,
          },
        ],
        { position: { x: 200, y: 0 } },
      ),
    },
  };
}

beforeEach(() => {
  // Restore first so each test starts with a clean console.log spy: journey start
  // now emits a `draft_pool_constructed` log, and without clearing, that call
  // count would leak into later tests' `not.toHaveBeenCalled()` assertions.
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("journey state actions", () => {
  it("commits a prepared append only against the exact current sibling order", () => {
    const state: JourneyState = {
      ...createDefaultState(),
      currentDreamscape: parseAtlasNodeId("dreamscape-1"),
      atlas: makeAtlas(),
    };
    const site = {
      id: parseSiteId("site-exploration-source-action"),
      type: "Shop" as const,
      isEnhanced: false,
      isVisited: false,
    };
    const prepared = {
      targetNodeId: parseAtlasNodeId("dreamscape-1"),
      insertionIndex: 2,
      siblingSiteIdsBefore: ["site-1", "site-2"],
      site,
    };

    const inserted = insertPreparedSiteInJourneyState(state, prepared);
    if (inserted === null) throw new Error("Expected prepared site insertion");
    expect(inserted.atlas.nodes[parseAtlasNodeId("dreamscape-1")]?.sites).toEqual([
      ...(makeAtlas().nodes[parseAtlasNodeId("dreamscape-1")]?.sites ?? []),
      site,
    ]);
    expect(
      insertPreparedSiteInJourneyState(state, {
        ...prepared,
        siblingSiteIdsBefore: ["site-2", "site-1"],
      }),
    ).toBeNull();
    expect(insertPreparedSiteInJourneyState(inserted, prepared)).toBeNull();
  });

  it("derives the next deck entry id from the high-water deck id", () => {
    expect(
      nextDeckEntryId([
        {
          entryId: parseDeckEntryId("deck-2"),
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("starter-99"),
          cardNumber: 202,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("deck-15"),
          cardNumber: 10002,
          transfiguration: null,
          isBane: true,
        },
      ]),
    ).toBe("deck-16");
  });

  it("changes journey essence without replacing the deck", () => {
    const prev = createDefaultState();
    const startingEssence = prev.essence;
    const next = changeJourneyEssence(prev, 25);

    expect(next.essence).toBe(startingEssence + 25);
    expect(prev.essence).toBe(startingEssence);
    expect(next.deck).toBe(prev.deck);
  });

  it("adds a card with the next stable deck id", () => {
    const prev: JourneyState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: parseDeckEntryId("deck-7"),
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
    };

    const next = addCardToJourneyState(prev, 202);

    expect(next.deck).toEqual([
      prev.deck[0],
      {
        entryId: parseDeckEntryId("deck-8"),
        cardNumber: 202,
        transfiguration: null,
        isBane: false,
      },
    ]);
  });

  it("picks a draft card in one state transition", () => {
    const cardDatabase = new Map<number, CardData>(
      [101, 102, 103, 104, 201, 202, 203, 204].map((cardNumber) => [
        cardNumber,
        makeCard(cardNumber),
      ]),
    );
    const prev: JourneyState = {
      ...createDefaultState(),
      draftState: {
        mode: "tides4",
        draftPoolCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        remainingCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: parseSiteId("site-1"),
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };

    const next = pickDraftCardInJourneyState({
      prev,
      siteId: parseSiteId("site-1"),
      cardNumber: 101,
      cardDatabase,
    });

    expect(next.deck).toEqual([
      {
        entryId: parseDeckEntryId("deck-1"),
        cardNumber: 101,
        transfiguration: null,
        isBane: false,
      },
    ]);
    expect(next.draftState?.pickNumber).toBe(2);
    expect(next.draftState?.sitePicksCompleted).toBe(1);
    expect(next.draftState?.currentOffer).not.toEqual([101, 102, 103, 104]);
    expect(next.draftState?.currentOffer).toHaveLength(4);
    expect(prev.draftState?.pickNumber).toBe(1);
    expect(prev.deck).toEqual([]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it("commits only a prepared draft pick that matches the expected offer", () => {
    const cardDatabase = new Map<number, CardData>(
      [101, 102, 103, 104, 201, 202, 203, 204].map((cardNumber) => [
        cardNumber,
        makeCard(cardNumber),
      ]),
    );
    const prev: JourneyState = {
      ...createDefaultState(),
      draftState: {
        mode: "tides4",
        draftPoolCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        remainingCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: parseSiteId("site-1"),
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };
    const prepared = prepareDraftCardPickInJourneyState({
      prev,
      siteId: parseSiteId("site-1"),
      cardNumber: 101,
      cardDatabase,
    });
    const stale: JourneyState = {
      ...prev,
      draftState: {
        ...prev.draftState!,
        currentOffer: [102, 103, 104, 201],
      },
    };

    expect(
      commitPreparedDraftCardPickInJourneyState({ prev, prepared })?.deck,
    ).toEqual(prepared.next.deck);
    expect(
      commitPreparedDraftCardPickInJourneyState({ prev: stale, prepared }),
    ).toBeNull();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("starts a journey from a DreamAvatar in one state transition", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dreamAvatar = makeDreamAvatar();
    const journeyContent = makeJourneyContent(dreamAvatar);
    const prev = createDefaultState();

    const next = startJourneyFromDreamAvatar({
      prev,
      dreamAvatar,
      journeyContent,
      seedOverride: testJourneySeed("journey-seed-1"),
    });
    const firstAvailableNode = Object.values(next.atlas.nodes).find(
      (node) => node.state === "available",
    );

    expect(next.dreamAvatar).toEqual(toJourneyDreamAvatar(dreamAvatar));
    expect(next.dreamAvatar?.portraitFocus).toEqual({ x: 0.42, y: 0.18 });
    expect(next.dreamAvatar?.startingEssence).toBe(275);
    expect(next.essence).toBe(dreamAvatar.startingEssence);
    expect(prev.essence).toBe(createDefaultState().essence);
    // The package is built from the run pool context at journey start; assert a
    // non-empty draft pool was produced rather than checking exact card numbers.
    expect(next.resolvedPackage).not.toBeNull();
    expect(next.resolvedPackage?.draftPoolSize).toBeGreaterThan(0);
    expect(
      Object.keys(next.resolvedPackage?.draftPoolCopiesByCard ?? {}).length,
    ).toBeGreaterThan(0);
    // The state seed matches the seed the pool was built from.
    expect(next.seed).toBe("journey-seed-1");
    // The remaining dreamsign pool is the resolved pool minus any dreamsigns the
    // atlas granted as pre-revealed known dreamsigns, and is a fresh array.
    const knownIds = new Set(
      next.atlas.knownDreamsignCarrierIds
        .map((id) => next.atlas.nodes[id]?.knownDreamsignId)
        .filter((id): id is NonNullable<typeof id> => id != null),
    );
    expect(next.remainingDreamsignPool).toEqual(
      (next.resolvedPackage?.dreamsignPoolIds ?? []).filter(
        (id) => !knownIds.has(id),
      ),
    );
    expect(next.remainingDreamsignPool).not.toBe(
      next.resolvedPackage?.dreamsignPoolIds,
    );
    expect(next.deck.map((entry) => entry.cardNumber)).toEqual(
      TEST_STARTER_CARD_NUMBERS,
    );
    expect(next.deck.map((entry) => entry.entryId)).toEqual(
      TEST_STARTER_CARD_NUMBERS.map((_, index) => `deck-${String(index + 1)}`),
    );
    const nextPoolState = next.draftState;
    expect(nextPoolState?.draftPoolCopiesByCard).toEqual(
      next.resolvedPackage?.draftPoolCopiesByCard,
    );
    expect(nextPoolState?.remainingCopiesByCard).toEqual(
      next.resolvedPackage?.draftPoolCopiesByCard,
    );
    expect(next.draftState?.currentOffer).toEqual([]);
    expect(next.draftState?.pickNumber).toBe(1);
    expect(next.draftState?.sitePicksCompleted).toBe(0);
    expect(firstAvailableNode).toBeDefined();
    expect(next.currentDreamscape).toBe(firstAvailableNode?.id);
    expect(next.visitedSites).toEqual([]);
    expect(next.screen).toEqual({ type: "dreamscape" });
    expect(next.activeSiteId).toBeNull();
    // The starter-deck reveal popup is gated entirely by the
    // `hasSeenStartingDeckPopup` flag. A fresh journey start leaves the flag
    // at the default `false` so the popup opens once when the dreamAvatar
    // is first picked.
    expect(next.hasSeenStartingDeckPopup).toBe(false);
    // Journey start builds the draft pool, which emits exactly one provenance log
    // recording the algorithm and seed the pool was constructed from.
    expect(logSpy).toHaveBeenCalledTimes(1);
    const constructed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(constructed.event).toBe("draft_pool_constructed");
    expect(constructed.dreamAvatarId).toBe(dreamAvatar.id);
    expect(typeof constructed.seed).toBe("number");
  });

  it("uses an authored package override for a tutorial journey start", () => {
    const dreamAvatar = makeDreamAvatar();
    const journeyContent = makeJourneyContent(dreamAvatar);
    const authoredCardNumbers = [...journeyContent.cardDatabase.keys()]
      .filter(
        (cardNumber) =>
          !TEST_STARTER_CARD_NUMBERS.includes(
            cardNumber as (typeof TEST_STARTER_CARD_NUMBERS)[number],
          ),
      )
      .slice(0, 2);
    const authoredCopies = {
      [String(authoredCardNumbers[0])]: 2,
      [String(authoredCardNumbers[1])]: 1,
    };
    const dreamsignAId = testDreamsignId("dreamsign-a");
    const authoredPackage: ResolvedDreamAvatarPackage = {
      dreamAvatar,
      draftPoolCopiesByCard: authoredCopies,
      openingDreamsignOfferIds: [dreamsignAId],
      dreamsignPoolIds: [
        dreamsignAId,
        testDreamsignId("dreamsign-b"),
      ],
      mandatoryOnlyPoolSize: 3,
      draftPoolSize: 3,
      doubledCardCount: 1,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
    };

    const next = startJourneyFromDreamAvatar({
      prev: createDefaultState(),
      dreamAvatar,
      journeyContent,
      seedOverride: testJourneySeed("tutorial-seed"),
      atlasRng: () => 0,
      resolvedPackageOverride: authoredPackage,
      isTutorialJourney: true,
    });

    expect(next.resolvedPackage).toBe(authoredPackage);
    expect(next.isTutorialJourney).toBe(true);
    expect(next.draftState?.mode).toBe("tides4");
    expect((next.draftState as PoolDraftState).draftPoolCopiesByCard).toEqual(
      authoredCopies,
    );
    expect(next.remainingDreamsignPool).toContain(dreamsignAId);
    expect(
      next.atlas.knownDreamsignCarrierIds
        .map((id) => next.atlas.nodes[id]?.knownDreamsignId)
        .filter(
          (id): id is NonNullable<typeof id> => id !== null && id !== undefined,
        ),
    ).not.toContain(dreamsignAId);
  });

  it("sets the journey screen and active site together", () => {
    const prev = createDefaultState();
    const siteScreen = setJourneyScreen(prev, {
      type: "site",
      siteId: parseSiteId("site-1"),
    });
    const atlasScreen = setJourneyScreen(siteScreen, { type: "atlas" });

    expect(siteScreen.screen).toEqual({
      type: "site",
      siteId: parseSiteId("site-1"),
    });
    expect(siteScreen.activeSiteId).toBe("site-1");
    expect(atlasScreen.screen).toEqual({ type: "atlas" });
    expect(atlasScreen.activeSiteId).toBeNull();
  });

  it("updates the journey atlas by reference", () => {
    const prev = createDefaultState();
    const atlas = makeAtlas();
    const next = updateJourneyAtlas(prev, atlas);

    expect(next.atlas).toBe(atlas);
    expect(prev.atlas).toEqual({
      layers: [],
      nodes: {},
      startingNodeId: null,
      bossNodeId: null,
      bossIncarnationId: null,
      currentNodeId: null,
      knownDreamsignCarrierIds: [],
    });
  });

  it("completes a site while preserving unrelated site runtime", () => {
    const runtime = {
      kind: "essence" as const,
      amount: 25,
      accepted: false,
    };
    const prev: JourneyState = {
      ...createDefaultState(),
      atlas: makeAtlas(),
      siteRuntime: {
        [parseSiteId("site-2")]: runtime,
      },
    };

    const next = completeJourneySite(prev, parseSiteId("site-1"));

    expect(next.visitedSites).toEqual(["site-1"]);
    expect(next.atlas.nodes[parseAtlasNodeId("dreamscape-1")].sites[0]).toEqual({
      id: parseSiteId("site-1"),
      type: "Draft",
      isEnhanced: false,
      isVisited: true,
    });
    expect(next.siteRuntime[parseSiteId("site-2")]).toBe(runtime);
  });
});

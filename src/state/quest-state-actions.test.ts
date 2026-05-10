import { beforeEach, describe, expect, it, vi } from "vitest";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import type { CardData } from "../types/cards";
import type {
  DreamcallerContent,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { QuestContent } from "../data/quest-content";
import type { DreamAtlas, QuestState } from "../types/quest";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import { createDefaultState } from "./quest-context";
import {
  addCardToQuestState,
  changeQuestEssence,
  commitPreparedDraftCardPickInQuestState,
  completeQuestSite,
  nextDeckEntryId,
  pickDraftCardInQuestState,
  prepareDraftCardPickInQuestState,
  setQuestScreen,
  startQuestFromDreamcaller,
  updateQuestAtlas,
} from "./quest-state-actions";

function makeCard(
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Event",
    subtype: "Test",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    tides: ["core"],
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
    ...overrides,
  };
}

function makeDreamcaller(): DreamcallerContent {
  return {
    id: "dreamcaller-1",
    name: "Test Dreamcaller",
    title: "State Witness",
    renderedText: "Test ability.",
    imageNumber: "0006",
    startingEssence: 275,
    mandatoryTides: ["core"],
    optionalTides: ["support-a", "support-b", "support-c", "support-d"],
  };
}

function makeResolvedPackage(
  dreamcaller: DreamcallerContent = makeDreamcaller(),
): ResolvedDreamcallerPackage {
  return {
    dreamcaller,
    mandatoryTides: ["core"],
    optionalSubset: ["support-a", "support-b", "support-c"],
    selectedTides: ["core", "support-a", "support-b", "support-c"],
    draftPoolCopiesByCard: {
      "101": 2,
      "202": 1,
    },
    dreamsignPoolIds: ["embers-whisper", "glacial-insight"],
    mandatoryOnlyPoolSize: 120,
    draftPoolSize: 210,
    doubledCardCount: 1,
    legalSubsetCount: 2,
    preferredSubsetCount: 1,
  };
}

function makeQuestContent(
  resolvedPackage: ResolvedDreamcallerPackage = makeResolvedPackage(),
): QuestContent {
  const starterCards = STARTER_CARD_NUMBERS.map((cardNumber) =>
    makeCard(cardNumber, { isStarter: true }),
  );
  const draftCards = [makeCard(101), makeCard(202)];
  const cardDatabase = new Map<number, CardData>(
    [...starterCards, ...draftCards].map((card) => [card.cardNumber, card]),
  );

  return {
    cardDatabase,
    cardsByPackageTide: new Map([["core", draftCards]]),
    dreamcallers: [resolvedPackage.dreamcaller],
    dreamsignTemplates: [],
    resolvedPackagesByDreamcallerId: new Map([
      [resolvedPackage.dreamcaller.id, resolvedPackage],
    ]),
  };
}

function makeAtlas(): DreamAtlas {
  return {
    nexusId: "nexus",
    edges: [["nexus", "dreamscape-1"]],
    nodes: {
      nexus: {
        id: "nexus",
        biomeName: "Nexus",
        biomeColor: "#7c3aed",
        sites: [],
        position: { x: 0, y: 0 },
        status: "completed",
        enhancedSiteType: null,
      },
      "dreamscape-1": {
        id: "dreamscape-1",
        biomeName: "Test Biome",
        biomeColor: "#22c55e",
        sites: [
          {
            id: "site-1",
            type: "Draft",
            isEnhanced: false,
            isVisited: false,
          },
          {
            id: "site-2",
            type: "Battle",
            isEnhanced: false,
            isVisited: false,
          },
        ],
        position: { x: 200, y: 0 },
        status: "available",
        enhancedSiteType: null,
      },
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("quest state actions", () => {
  it("derives the next deck entry id from the high-water deck id", () => {
    expect(
      nextDeckEntryId([
        {
          entryId: "deck-2",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "starter-99",
          cardNumber: 202,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "deck-15",
          cardNumber: 303,
          transfiguration: null,
          isBane: true,
        },
      ]),
    ).toBe("deck-16");
  });

  it("changes quest essence without replacing the deck", () => {
    const prev = createDefaultState();
    const next = changeQuestEssence(prev, 25);

    expect(next.essence).toBe(275);
    expect(prev.essence).toBe(250);
    expect(next.deck).toBe(prev.deck);
  });

  it("adds a card with the next stable deck id", () => {
    const prev: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-7",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
    };

    const next = addCardToQuestState(prev, 202, false);

    expect(next.deck).toEqual([
      prev.deck[0],
      {
        entryId: "deck-8",
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
    const prev: QuestState = {
      ...createDefaultState(),
      draftState: {
        remainingCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: "site-1",
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };

    const next = pickDraftCardInQuestState({
      prev,
      siteId: "site-1",
      cardNumber: 101,
      cardDatabase,
    });

    expect(next.deck).toEqual([
      {
        entryId: "deck-1",
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
    const prev: QuestState = {
      ...createDefaultState(),
      draftState: {
        remainingCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: "site-1",
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };
    const prepared = prepareDraftCardPickInQuestState({
      prev,
      siteId: "site-1",
      cardNumber: 101,
      cardDatabase,
    });
    const stale: QuestState = {
      ...prev,
      draftState: {
        ...prev.draftState!,
        currentOffer: [102, 103, 104, 201],
      },
    };

    expect(
      commitPreparedDraftCardPickInQuestState({ prev, prepared })?.deck,
    ).toEqual(prepared.next.deck);
    expect(
      commitPreparedDraftCardPickInQuestState({ prev: stale, prepared }),
    ).toBeNull();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("starts a quest from a Dreamcaller in one state transition", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dreamcaller = makeDreamcaller();
    const resolvedPackage = makeResolvedPackage(dreamcaller);
    const questContent = makeQuestContent(resolvedPackage);
    const prev = createDefaultState();

    const next = startQuestFromDreamcaller({
      prev,
      dreamcaller,
      questContent,
    });
    const firstAvailableNode = Object.values(next.atlas.nodes).find(
      (node) => node.status === "available",
    );

    expect(next.dreamcaller).toEqual(toQuestDreamcaller(dreamcaller));
    expect(next.dreamcaller?.startingEssence).toBe(275);
    expect(next.essence).toBe(dreamcaller.startingEssence);
    expect(prev.essence).toBe(250);
    expect(next.resolvedPackage).toBe(resolvedPackage);
    expect(next.remainingDreamsignPool).toEqual(
      resolvedPackage.dreamsignPoolIds,
    );
    expect(next.remainingDreamsignPool).not.toBe(
      resolvedPackage.dreamsignPoolIds,
    );
    expect(next.deck.map((entry) => entry.cardNumber)).toEqual(
      STARTER_CARD_NUMBERS,
    );
    expect(next.deck.map((entry) => entry.entryId)).toEqual(
      STARTER_CARD_NUMBERS.map((_, index) => `deck-${String(index + 1)}`),
    );
    expect(next.draftState).toEqual({
      remainingCopiesByCard: {
        "101": 2,
        "202": 1,
      },
      currentOffer: [],
      activeSiteId: null,
      pickNumber: 1,
      sitePicksCompleted: 0,
    });
    expect(firstAvailableNode).toBeDefined();
    expect(next.currentDreamscape).toBe(firstAvailableNode?.id);
    expect(next.visitedSites).toEqual([]);
    expect(next.screen).toEqual({ type: "dreamscape" });
    expect(next.activeSiteId).toBeNull();
    // The starter-deck reveal popup is gated entirely by the
    // `hasSeenStartingDeckPopup` flag. A fresh quest start leaves the flag
    // at the default `false` so the popup opens once when the dreamcaller
    // is first picked.
    expect(next.hasSeenStartingDeckPopup).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("sets the quest screen and active site together", () => {
    const prev = createDefaultState();
    const siteScreen = setQuestScreen(prev, { type: "site", siteId: "site-1" });
    const atlasScreen = setQuestScreen(siteScreen, { type: "atlas" });

    expect(siteScreen.screen).toEqual({ type: "site", siteId: "site-1" });
    expect(siteScreen.activeSiteId).toBe("site-1");
    expect(atlasScreen.screen).toEqual({ type: "atlas" });
    expect(atlasScreen.activeSiteId).toBeNull();
  });

  it("updates the quest atlas by reference", () => {
    const prev = createDefaultState();
    const atlas = makeAtlas();
    const next = updateQuestAtlas(prev, atlas);

    expect(next.atlas).toBe(atlas);
    expect(prev.atlas).toEqual({ nodes: {}, edges: [], nexusId: "" });
  });

  it("completes a site while preserving unrelated site runtime", () => {
    const runtime = {
      kind: "essence" as const,
      amount: 25,
      accepted: false,
    };
    const prev: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlas(),
      siteRuntime: {
        "site-2": runtime,
      },
    };

    const next = completeQuestSite(prev, "site-1");

    expect(next.visitedSites).toEqual(["site-1"]);
    expect(next.atlas.nodes["dreamscape-1"].sites[0]).toEqual({
      id: "site-1",
      type: "Draft",
      isEnhanced: false,
      isVisited: true,
    });
    expect(next.siteRuntime["site-2"]).toBe(runtime);
  });
});

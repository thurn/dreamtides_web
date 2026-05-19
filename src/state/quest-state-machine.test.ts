// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "../data/quest-content";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import { getLogEntries, resetLog } from "../logging";
import type { CardData } from "../types/cards";
import type { ResolvedDreamcallerPackage } from "../types/content";
import type { DraftState } from "../types/draft";
import type {
  CardSourceDebugState,
  Dreamcaller,
  Dreamsign,
  QuestState,
} from "../types/quest";
import {
  applyCardSourceDebug,
  QuestProvider,
  applyDraftState,
  applyDreamcallerSelection,
  applyRemainingDreamsignPool,
  createDefaultState,
  deriveEntryIdCounter,
  useQuest,
  type QuestContextValue,
} from "./quest-context";

const roots: Root[] = [];

function makeQuestContent(
  resolvedPackage: ResolvedDreamcallerPackage | null = null,
  cardDatabase: Map<number, CardData> = new Map(),
): QuestContent {
  return {
    cardDatabase,
    cardsByPackageTide: new Map(),
    dreamcallers: resolvedPackage === null ? [] : [resolvedPackage.dreamcaller],
    dreamsignTemplates: [],
    resolvedPackagesByDreamcallerId:
      resolvedPackage === null
        ? new Map<string, ResolvedDreamcallerPackage>()
        : new Map([[resolvedPackage.dreamcaller.id, resolvedPackage]]),
  };
}

function captureQuestContext(): QuestContextValue {
  let captured: QuestContextValue | null = null;

  function Capture() {
    captured = useQuest();
    return null;
  }

  renderToStaticMarkup(
    createElement(QuestProvider, {
      cardDatabase: new Map(),
      questContent: makeQuestContent(),
      children: createElement(Capture),
    }),
  );

  if (captured === null) {
    throw new Error("Failed to capture quest context");
  }

  return captured;
}

function makeDreamcaller(): Dreamcaller {
  return {
    id: "dreamcaller-1",
    name: "Test Dreamcaller",
    title: "State Witness",
    renderedText: "Test ability.",
    imageNumber: "0006",
    startingEssence: 250,
  };
}

function makeResolvedPackage(): ResolvedDreamcallerPackage {
  return {
    dreamcaller: {
      id: "dreamcaller-1",
      name: "Test Dreamcaller",
      title: "State Witness",
      renderedText: "Test rules text.",
      imageNumber: "0006",
      startingEssence: 250,
      mandatoryTides: ["core"],
      optionalTides: ["support-a", "support-b", "support-c", "support-d"],
    },
    mandatoryTides: ["core"],
    optionalSubset: ["support-a", "support-b", "support-c"],
    selectedTides: ["core", "support-a", "support-b", "support-c"],
    draftPoolCopiesByCard: {
      "101": 2,
      "202": 1,
    },
    dreamsignPoolIds: ["embers-whisper", "glacial-insight", "ashbloom-mantle"],
    mandatoryOnlyPoolSize: 120,
    draftPoolSize: 210,
    doubledCardCount: 1,
    legalSubsetCount: 2,
    preferredSubsetCount: 1,
  };
}

function makeCard(cardNumber: number, tides: CardData["tides"] = []): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: STARTER_CARD_NUMBERS.includes(cardNumber),
    energyCost: 1,
    spark: 1,
    isFast: false,
    tides,
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDraftState(): DraftState {
  return {
    draftPoolCopiesByCard: {
      "101": 1,
      "202": 2,
    },
    remainingCopiesByCard: {
      "101": 1,
      "202": 2,
    },
    currentOffer: [101, 202, 303, 404],
    activeSiteId: "site-1",
    pickNumber: 3,
    sitePicksCompleted: 2,
  };
}

function makeDreamsign(id: string, name: string): Dreamsign {
  return {
    id,
    name,
    effectDescription: `${name} effect.`,
    isBane: false,
  };
}

function makeCardSourceDebugState(): CardSourceDebugState {
  return {
    screenLabel: "Draft Picks",
    surface: "Draft",
    entries: [
      {
        cardNumber: 101,
        cardName: "Lantern Witness",
        cardTides: ["core", "support-a"],
        matchedMandatoryTides: ["core"],
        matchedOptionalTides: ["support-a"],
        sourceTides: [
          {
            tideId: "core",
            displayName: "Core",
            requirement: "required",
            role: "supporting",
          },
        ],
        isFallback: false,
      },
    ],
  };
}

function mount(element: ReactElement): void {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(element);
  });
}

function mountQuestContext({
  cardDatabase = new Map(),
  questContent = makeQuestContent(null, cardDatabase),
}: {
  cardDatabase?: Map<number, CardData>;
  questContent?: QuestContent;
} = {}): QuestContextValue {
  let captured: QuestContextValue | null = null;

  function Capture() {
    captured = useQuest();
    return null;
  }

  mount(
    createElement(QuestProvider, {
      cardDatabase,
      questContent,
      children: createElement(Capture),
    }),
  );

  if (captured === null) {
    throw new Error("Failed to capture quest context");
  }

  return captured;
}

beforeEach(() => {
  resetLog();
  sessionStorage.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("deriveEntryIdCounter", () => {
  it("returns 0 for an empty deck", () => {
    expect(deriveEntryIdCounter([])).toBe(0);
  });

  it("returns the highest numeric suffix for matching deck-N entry ids", () => {
    expect(
      deriveEntryIdCounter([
        { entryId: "deck-1", cardNumber: 1, transfiguration: null, isBane: false },
        { entryId: "deck-7", cardNumber: 2, transfiguration: null, isBane: false },
        { entryId: "deck-3", cardNumber: 3, transfiguration: null, isBane: false },
      ]),
    ).toBe(7);
  });

  it("ignores entry ids that do not match the deck-N pattern", () => {
    expect(
      deriveEntryIdCounter([
        { entryId: "deck-2", cardNumber: 1, transfiguration: null, isBane: false },
        { entryId: "starter-9", cardNumber: 2, transfiguration: null, isBane: false },
      ]),
    ).toBe(2);
  });
});

describe("QuestProvider default state contract", () => {
  it("exposes the package-driven default state shape", () => {
    const state = createDefaultState();

    expect(state.resolvedPackage).toBeNull();
    expect(state.cardSourceDebug).toBeNull();
    expect(state.remainingDreamsignPool).toEqual([]);
    expect(state.siteRuntime).toEqual({});
    expect(state.draftState).toBeNull();
  });

  it("exposes the package-driven mutators", () => {
    const mutationNames = Object.keys(captureQuestContext().mutations);

    expect(mutationNames).toContain("setDreamcallerSelection");
    expect(mutationNames).toContain("setCardSourceDebug");
    expect(mutationNames).toContain("setRemainingDreamsignPool");
    expect(mutationNames).toContain("setDraftState");
  });
});

describe("QuestProvider composed mutations", () => {
  it("preserves quest start instrumentation while applying one state transition", () => {
    const resolvedPackage = makeResolvedPackage();
    const cardDatabase = new Map<number, CardData>([
      [101, makeCard(101, ["core"])],
      [202, makeCard(202, ["support-a"])],
      ...STARTER_CARD_NUMBERS.map(
        (cardNumber) =>
          [cardNumber, makeCard(cardNumber)] as const,
      ),
    ]);
    const quest = mountQuestContext({
      cardDatabase,
      questContent: makeQuestContent(resolvedPackage, cardDatabase),
    });

    act(() => {
      quest.mutations.startQuest(resolvedPackage.dreamcaller);
    });

    const entries = getLogEntries();
    expect(
      entries.filter((entry) => entry.event === "card_added").map((entry) => ({
        cardNumber: entry.cardNumber,
        source: entry.source,
      })),
    ).toEqual(
      STARTER_CARD_NUMBERS.map((cardNumber) => ({
        cardNumber,
        source: "quest_start_starter_deck",
      })),
    );
    expect(entries.some((entry) => entry.event === "dreamcaller_selected")).toBe(false);
    expect(entries.some((entry) => entry.event === "draft_pool_initialized")).toBe(true);
    expect(entries.some((entry) => entry.event === "draft_state_updated")).toBe(true);
    expect(entries.some((entry) => entry.event === "dreamscape_entered")).toBe(true);
    expect(entries.some((entry) => entry.event === "screen_transition")).toBe(true);

    const starterDeckEntry = entries.find(
      (entry) => entry.event === "starter_deck_initialized",
    );
    expect(starterDeckEntry).toMatchObject({
      starterCardNumbers: [...STARTER_CARD_NUMBERS],
      totalDeckSize: STARTER_CARD_NUMBERS.length,
    });

    const questStartedEntry = entries.find(
      (entry) => entry.event === "quest_started",
    );
    expect(questStartedEntry).toMatchObject({
      initialEssence: resolvedPackage.dreamcaller.startingEssence,
      startingDeckSize: STARTER_CARD_NUMBERS.length,
      dreamcallerId: resolvedPackage.dreamcaller.id,
      dreamcallerName: resolvedPackage.dreamcaller.name,
      selectedPackageTides: resolvedPackage.selectedTides,
    });
  });

  it("does not log duplicate local site completion", () => {
    sessionStorage.setItem(
      "quest-prototype-state-v1",
      JSON.stringify({
        version: 1,
        state: {
          ...createDefaultState(),
          visitedSites: ["site-1"],
        },
      }),
    );
    const quest = mountQuestContext();

    act(() => {
      quest.mutations.completeSite("site-1", "draft");
    });

    expect(
      getLogEntries().some((entry) => entry.event === "site_completed"),
    ).toBe(false);
  });

  it("rejects local Dreamsign acceptance when purge index is out of range", () => {
    const selectedDreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    sessionStorage.setItem(
      "quest-prototype-state-v1",
      JSON.stringify({
        version: 1,
        state: {
          ...createDefaultState(),
          dreamsigns: [makeDreamsign("held-0", "Held 0")],
          siteRuntime: {
            "site-1": {
              kind: "dreamsignOffer",
              offeredDreamsigns: [selectedDreamsign],
              remainingDreamsignPool: [],
              accepted: false,
            },
          },
          screen: { type: "site", siteId: "site-1" },
          activeSiteId: "site-1",
        },
      }),
    );
    const captured: QuestContextValue[] = [];

    function Capture() {
      captured.push(useQuest());
      return null;
    }

    mount(
      createElement(QuestProvider, {
        cardDatabase: new Map(),
        questContent: makeQuestContent(),
        children: createElement(Capture),
      }),
    );

    act(() => {
      captured[captured.length - 1]?.mutations.acceptDreamsignOffer(
        "site-1",
        selectedDreamsign,
        5,
      );
    });
    const latest = captured[captured.length - 1];

    expect(latest?.state.dreamsigns).toEqual([
      makeDreamsign("held-0", "Held 0"),
    ]);
    expect(latest?.state.siteRuntime["site-1"]).toEqual({
      kind: "dreamsignOffer",
      offeredDreamsigns: [selectedDreamsign],
      remainingDreamsignPool: [],
      accepted: false,
    });
    expect(latest?.state.screen).toEqual({ type: "site", siteId: "site-1" });
    expect(latest?.state.visitedSites).toEqual([]);
  });
});

describe("Task 02 state transitions", () => {
  it("stores the resolved package and initializes the shared Dreamsign pool from it", () => {
    const resolvedPackage = makeResolvedPackage();
    const next = applyDreamcallerSelection(
      createDefaultState(),
      resolvedPackage,
    );

    expect(next.dreamcaller).toEqual(toQuestDreamcaller(resolvedPackage.dreamcaller));
    expect(next.resolvedPackage).toEqual(resolvedPackage);
    expect(next.remainingDreamsignPool).toEqual(resolvedPackage.dreamsignPoolIds);

    resolvedPackage.dreamsignPoolIds.push("verdant-accord");
    expect(next.remainingDreamsignPool).toEqual([
      "embers-whisper",
      "glacial-insight",
      "ashbloom-mantle",
    ]);
  });

  it("updates the remaining Dreamsign pool without mutating prior state", () => {
    const initial = applyDreamcallerSelection(
      createDefaultState(),
      makeResolvedPackage(),
    );
    const nextPool = ["glacial-insight"];
    const next = applyRemainingDreamsignPool(initial, nextPool);

    expect(initial.remainingDreamsignPool).toEqual([
      "embers-whisper",
      "glacial-insight",
      "ashbloom-mantle",
    ]);
    expect(next.remainingDreamsignPool).toEqual(["glacial-insight"]);

    nextPool.push("ashbloom-mantle");
    expect(next.remainingDreamsignPool).toEqual(["glacial-insight"]);
  });

  it("persists fixed-pool draft progress, including drafted cards for site completion", () => {
    const next = applyDraftState(createDefaultState(), makeDraftState());

    expect(next.draftState).toEqual({
      draftPoolCopiesByCard: {
        "101": 1,
        "202": 2,
      },
      remainingCopiesByCard: {
        "101": 1,
        "202": 2,
      },
      currentOffer: [101, 202, 303, 404],
      activeSiteId: "site-1",
      pickNumber: 3,
      sitePicksCompleted: 2,
    });
    expect("seenCards" in (next.draftState as unknown as Record<string, unknown>)).toBe(false);
  });

  it("stores and clears card source debug data without mutating prior state", () => {
    const initial = createDefaultState();
    const overlay = makeCardSourceDebugState();
    const next = applyCardSourceDebug(initial, overlay);

    expect(initial.cardSourceDebug).toBeNull();
    expect(next.cardSourceDebug).toEqual(overlay);

    overlay.entries.push({
      cardNumber: 202,
      cardName: "Late Mutation",
      cardTides: ["support-b"],
      matchedMandatoryTides: [],
      matchedOptionalTides: ["support-b"],
      sourceTides: [
        {
          tideId: "support-b",
          displayName: "Support B",
          requirement: "optional",
          role: "supporting",
        },
      ],
      isFallback: false,
    });

    expect(next.cardSourceDebug?.entries).toHaveLength(1);
    expect(applyCardSourceDebug(next, null).cardSourceDebug).toBeNull();
  });

  it("resets package-driven run state back to an empty quest shell", () => {
    const populated: QuestState = {
      ...createDefaultState(),
      dreamcaller: makeDreamcaller(),
      resolvedPackage: makeResolvedPackage(),
      cardSourceDebug: makeCardSourceDebugState(),
      remainingDreamsignPool: ["embers-whisper"],
      draftState: makeDraftState(),
      visitedSites: ["site-1"],
      currentDreamscape: "dreamscape-1",
    };

    const reset = createDefaultState();

    expect(reset).toEqual({
      ...createDefaultState(),
      essence: 250,
      deck: [],
      dreamcaller: null,
      resolvedPackage: null,
      cardSourceDebug: null,
      remainingDreamsignPool: [],
      dreamsigns: [],
      completionLevel: 0,
      atlas: { nodes: {}, edges: [], startingNodeId: "" },
      currentDreamscape: null,
      visitedSites: [],
      siteRuntime: {},
      draftState: null,
      screen: { type: "questStart" },
      activeSiteId: null,
      failureSummary: null,
      hasSeenStartingDeckPopup: false,
    });
    expect(populated.resolvedPackage).not.toBeNull();
  });
});

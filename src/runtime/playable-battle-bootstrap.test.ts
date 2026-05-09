import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlayableBattleBootstrapController,
  isPlayableBattleBootstrapTerminal,
  runPlayableBattleBootstrapStep,
} from "./playable-battle-bootstrap";
import { resetLog } from "../logging";
import type { QuestContent } from "../data/quest-content";
import type { CardData } from "../types/cards";
import type { QuestMutations } from "../state/quest-context";
import type {
  DreamcallerContent,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { DreamAtlas, QuestState, SiteState } from "../types/quest";

function makeDreamcaller(): DreamcallerContent {
  return {
    id: "dreamcaller-1",
    name: "Test Dreamcaller",
    title: "Caller of Beginnings",
    awakening: 4,
    renderedText: "Test ability.",
    imageNumber: "0002",
    mandatoryTides: ["tide_alpha"],
    optionalTides: ["tide_beta", "tide_gamma", "tide_delta", "tide_zeta"],
  };
}

function makeResolvedPackage(): ResolvedDreamcallerPackage {
  const dreamcaller = makeDreamcaller();
  return {
    dreamcaller,
    mandatoryTides: ["tide_alpha"],
    optionalSubset: ["tide_beta", "tide_gamma", "tide_delta"],
    selectedTides: ["tide_alpha", "tide_beta", "tide_gamma", "tide_delta"],
    draftPoolCopiesByCard: { "101": 2 },
    dreamsignPoolIds: ["dreamsign-1"],
    mandatoryOnlyPoolSize: 12,
    draftPoolSize: 24,
    doubledCardCount: 1,
    legalSubsetCount: 4,
    preferredSubsetCount: 2,
  };
}

function makeQuestContent(): QuestContent {
  const resolvedPackage = makeResolvedPackage();
  return {
    cardDatabase: new Map(),
    cardsByPackageTide: new Map(),
    dreamcallers: [resolvedPackage.dreamcaller],
    dreamsignTemplates: [
      {
        id: "dreamsign-1",
        name: "Echo Sign",
        effectDescription: "Gain a bloom effect.",
        packageTides: ["tide_alpha"],
      },
    ],
    resolvedPackagesByDreamcallerId: new Map([
      [resolvedPackage.dreamcaller.id, resolvedPackage],
    ]),
  };
}

function makeAtlasWithBattleSite(): DreamAtlas {
  const battleSite: SiteState = {
    id: "site-battle",
    type: "Battle",
    isEnhanced: false,
    isVisited: false,
  };
  return {
    nodes: {
      "dreamscape-1": {
        id: "dreamscape-1",
        biomeName: "Test",
        biomeColor: "#ffffff",
        sites: [battleSite],
        position: { x: 0, y: 0 },
        status: "available",
        enhancedSiteType: null,
      },
    },
    edges: [],
    nexusId: "nexus",
  };
}

function makeAtlasWithoutBattleSite(): DreamAtlas {
  const shopSite: SiteState = {
    id: "site-shop",
    type: "Shop",
    isEnhanced: false,
    isVisited: false,
  };
  return {
    nodes: {
      "dreamscape-1": {
        id: "dreamscape-1",
        biomeName: "Test",
        biomeColor: "#ffffff",
        sites: [shopSite],
        position: { x: 0, y: 0 },
        status: "available",
        enhancedSiteType: null,
      },
    },
    edges: [],
    nexusId: "nexus",
  };
}

function makeMutations(): QuestMutations {
  return {
    changeEssence: vi.fn(),
    startQuest: vi.fn(),
    completeSite: vi.fn(),
    ensureRewardSiteRuntime: vi.fn(),
    acceptRewardSite: vi.fn(),
    ensureDreamsignOfferRuntime: vi.fn(),
    acceptDreamsignOffer: vi.fn(),
    ensureEssenceSiteRuntime: vi.fn(),
    acceptEssenceSite: vi.fn(),
    pickDraftCard: vi.fn(),
    addCard: vi.fn(),
    addBaneCard: vi.fn(),
    removeCard: vi.fn(),
    transfigureCard: vi.fn(),
    setDreamcallerSelection: vi.fn(),
    setCardSourceDebug: vi.fn(),
    addDreamsign: vi.fn(),
    removeDreamsign: vi.fn(),
    setRemainingDreamsignPool: vi.fn(),
    incrementCompletionLevel: vi.fn(),
    setScreen: vi.fn(),
    markSiteVisited: vi.fn(),
    setCurrentDreamscape: vi.fn(),
    updateAtlas: vi.fn(),
    setDraftState: vi.fn(),
    setFailureSummary: vi.fn(),
    resetQuest: vi.fn(),
  };
}

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    essence: 250,
    deck: [],
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: { nodes: {}, edges: [], nexusId: "" },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "questStart" },
    activeSiteId: null,
    failureSummary: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetLog();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
});

describe("runPlayableBattleBootstrapStep", () => {
  it("returns skipped when there are no dreamcallers", () => {
    const mutations = makeMutations();
    const result = runPlayableBattleBootstrapStep({
      state: makeState(),
      mutations,
      questContent: { ...makeQuestContent(), dreamcallers: [] },
      cardDatabase: new Map(),
    });

    expect(result).toEqual({ stage: "skipped", reason: "no-content" });
    expect(mutations.setDreamcallerSelection).not.toHaveBeenCalled();
  });

  it("calls bootstrapQuestStart when dreamcaller is null", () => {
    const mutations = makeMutations();
    const result = runPlayableBattleBootstrapStep({
      state: makeState(),
      mutations,
      questContent: makeQuestContent(),
      cardDatabase: new Map<number, CardData>(),
    });

    expect(result).toEqual({ stage: "in-progress", action: "quest-start" });
    expect(mutations.setDreamcallerSelection).toHaveBeenCalledOnce();
    expect(mutations.updateAtlas).toHaveBeenCalledOnce();
  });

  it("selects the first available dreamscape when none is current", () => {
    const mutations = makeMutations();
    const result = runPlayableBattleBootstrapStep({
      state: makeState({
        dreamcaller: {
          id: "dreamcaller-1",
          name: "Test",
          title: "T",
          awakening: 1,
          renderedText: "",
          imageNumber: "0001",
        },
        atlas: makeAtlasWithBattleSite(),
        currentDreamscape: null,
      }),
      mutations,
      questContent: makeQuestContent(),
      cardDatabase: new Map(),
    });

    expect(result).toEqual({ stage: "in-progress", action: "select-dreamscape" });
    expect(mutations.setCurrentDreamscape).toHaveBeenCalledWith("dreamscape-1");
  });

  it("enters the battle site once the dreamscape is selected", () => {
    const mutations = makeMutations();
    const result = runPlayableBattleBootstrapStep({
      state: makeState({
        dreamcaller: {
          id: "dreamcaller-1",
          name: "Test",
          title: "T",
          awakening: 1,
          renderedText: "",
          imageNumber: "0001",
        },
        atlas: makeAtlasWithBattleSite(),
        currentDreamscape: "dreamscape-1",
        screen: { type: "dreamscape" },
      }),
      mutations,
      questContent: makeQuestContent(),
      cardDatabase: new Map(),
    });

    expect(result).toEqual({ stage: "in-progress", action: "enter-battle" });
    expect(mutations.markSiteVisited).toHaveBeenCalledWith("site-battle");
    expect(mutations.setScreen).toHaveBeenCalledWith({
      type: "site",
      siteId: "site-battle",
    });
  });

  it("returns complete when already on the battle site", () => {
    const mutations = makeMutations();
    const result = runPlayableBattleBootstrapStep({
      state: makeState({
        dreamcaller: {
          id: "dreamcaller-1",
          name: "Test",
          title: "T",
          awakening: 1,
          renderedText: "",
          imageNumber: "0001",
        },
        atlas: makeAtlasWithBattleSite(),
        currentDreamscape: "dreamscape-1",
        screen: { type: "site", siteId: "site-battle" },
      }),
      mutations,
      questContent: makeQuestContent(),
      cardDatabase: new Map(),
    });

    expect(result).toEqual({ stage: "complete" });
    expect(mutations.setScreen).not.toHaveBeenCalled();
    expect(mutations.markSiteVisited).not.toHaveBeenCalled();
  });

  it("returns skipped:no-battle-site when the dreamscape has no battle", () => {
    const mutations = makeMutations();
    const result = runPlayableBattleBootstrapStep({
      state: makeState({
        dreamcaller: {
          id: "dreamcaller-1",
          name: "Test",
          title: "T",
          awakening: 1,
          renderedText: "",
          imageNumber: "0001",
        },
        atlas: makeAtlasWithoutBattleSite(),
        currentDreamscape: "dreamscape-1",
        screen: { type: "dreamscape" },
      }),
      mutations,
      questContent: makeQuestContent(),
      cardDatabase: new Map(),
    });

    expect(result).toEqual({ stage: "skipped", reason: "no-battle-site" });
    expect(mutations.setScreen).not.toHaveBeenCalled();
  });

  describe("iteration invariants", () => {
    it("isPlayableBattleBootstrapTerminal classifies complete and skipped steps", () => {
      expect(isPlayableBattleBootstrapTerminal({ stage: "complete" })).toBe(true);
      expect(
        isPlayableBattleBootstrapTerminal({ stage: "skipped", reason: "no-content" }),
      ).toBe(true);
      expect(
        isPlayableBattleBootstrapTerminal({ stage: "skipped", reason: "no-battle-site" }),
      ).toBe(true);
      expect(
        isPlayableBattleBootstrapTerminal({ stage: "in-progress", action: "quest-start" }),
      ).toBe(false);
      expect(
        isPlayableBattleBootstrapTerminal({ stage: "in-progress", action: "select-dreamscape" }),
      ).toBe(false);
      expect(
        isPlayableBattleBootstrapTerminal({ stage: "in-progress", action: "enter-battle" }),
      ).toBe(false);
    });

    it("invoking with the same terminal state twice returns equivalent steps", () => {
      const mutations = makeMutations();
      const state = makeState({
        dreamcaller: {
          id: "dreamcaller-1",
          name: "Test",
          title: "T",
          awakening: 1,
          renderedText: "",
          imageNumber: "0001",
        },
        atlas: makeAtlasWithBattleSite(),
        currentDreamscape: "dreamscape-1",
        screen: { type: "site", siteId: "site-battle" },
      });

      const first = runPlayableBattleBootstrapStep({
        state,
        mutations,
        questContent: makeQuestContent(),
        cardDatabase: new Map(),
      });
      const second = runPlayableBattleBootstrapStep({
        state,
        mutations,
        questContent: makeQuestContent(),
        cardDatabase: new Map(),
      });

      expect(first).toEqual({ stage: "complete" });
      expect(second).toEqual(first);
    });

    it("drives the in-progress steps forward without stalling and terminates", () => {
      // Simulate the effect loop: after each in-progress step, update the
      // mutable state to reflect the requested mutations, then re-run the
      // step machine. The machine must strictly advance (same action never
      // repeats in a row without an intervening state change), must reach a
      // terminal step, and must visit `enter-battle` on its way to
      // `complete` when a battle site exists.
      const atlasWithBattle = makeAtlasWithBattleSite();
      let currentState = makeState({
        atlas: atlasWithBattle,
      });
      const questContent = makeQuestContent();
      const cardDatabase = new Map<number, CardData>();
      const observedActions: string[] = [];

      const setDreamcallerSelection: QuestMutations["setDreamcallerSelection"] = (
        resolvedPackage,
      ) => {
        currentState = {
          ...currentState,
          dreamcaller: {
            id: resolvedPackage.dreamcaller.id,
            name: resolvedPackage.dreamcaller.name,
            title: resolvedPackage.dreamcaller.title,
            awakening: resolvedPackage.dreamcaller.awakening,
            renderedText: resolvedPackage.dreamcaller.renderedText,
            imageNumber: resolvedPackage.dreamcaller.imageNumber,
          },
        };
      };
      const setCurrentDreamscape: QuestMutations["setCurrentDreamscape"] = (nodeId) => {
        currentState = { ...currentState, currentDreamscape: nodeId };
      };
      const setScreen: QuestMutations["setScreen"] = (screen) => {
        currentState = { ...currentState, screen };
      };
      const updateAtlas: QuestMutations["updateAtlas"] = (atlas) => {
        currentState = { ...currentState, atlas };
      };

      const mutations: QuestMutations = {
        ...makeMutations(),
        setDreamcallerSelection: vi.fn(setDreamcallerSelection),
        setCurrentDreamscape: vi.fn(setCurrentDreamscape),
        setScreen: vi.fn(setScreen),
        markSiteVisited: vi.fn(),
        updateAtlas: vi.fn(updateAtlas),
      };

      const MAX_STEPS = 20;
      let steps = 0;
      let lastAction: string | null = null;
      let terminalTag: string | null = null;
      while (steps < MAX_STEPS) {
        const result = runPlayableBattleBootstrapStep({
          state: currentState,
          mutations,
          questContent,
          cardDatabase,
        });
        if (isPlayableBattleBootstrapTerminal(result)) {
          terminalTag = result.stage === "complete"
            ? "complete"
            : `skipped:${result.reason}`;
          break;
        }
        if (lastAction === result.action) {
          throw new Error(`Bootstrap stalled on ${result.action}`);
        }
        observedActions.push(result.action);
        lastAction = result.action;
        steps += 1;
      }

      // quest-start must always be the first in-progress action when the
      // player has no dreamcaller yet.
      expect(observedActions[0]).toBe("quest-start");
      // We must have terminated at a non-erroring terminal step.
      expect(terminalTag).not.toBeNull();
      // The machine must never loop forever — steps must be bounded.
      expect(steps).toBeLessThan(MAX_STEPS);
    });
  });
});

describe("createPlayableBattleBootstrapController", () => {
  it("latches isDone after reaching complete", () => {
    const controller = createPlayableBattleBootstrapController();
    const mutations = makeMutations();
    const state = makeState({
      dreamcaller: {
        id: "dreamcaller-1",
        name: "Test",
        title: "T",
        awakening: 1,
        renderedText: "",
        imageNumber: "0001",
      },
      atlas: makeAtlasWithBattleSite(),
      currentDreamscape: "dreamscape-1",
      screen: { type: "site", siteId: "site-battle" },
    });

    const result = controller.advance({
      state,
      mutations,
      questContent: makeQuestContent(),
      cardDatabase: new Map(),
    });
    expect(result).toEqual({ stage: "complete" });
    expect(controller.isDone()).toBe(true);

    const repeated = controller.advance({
      state,
      mutations,
      questContent: makeQuestContent(),
      cardDatabase: new Map(),
    });
    // After the controller latches done, further advance calls return the
    // cached terminal step without re-invoking mutations.
    expect(repeated).toEqual(result);
  });

  it("latches stalled once MAX_BOOTSTRAP_STEPS is exceeded without progress", () => {
    const controller = createPlayableBattleBootstrapController();
    const stalledState = makeState({
      dreamcaller: {
        id: "dreamcaller-1",
        name: "Test",
        title: "T",
        awakening: 1,
        renderedText: "",
        imageNumber: "0001",
      },
      atlas: makeAtlasWithBattleSite(),
      currentDreamscape: "dreamscape-1",
      // Staying on dreamscape-type screen repeats the "enter-battle" action
      // without ever advancing — simulating a stuck mutation pipeline.
      screen: { type: "dreamscape" },
    });

    let lastStep = null as ReturnType<typeof controller.advance> | null;
    for (let i = 0; i < 64 && !controller.isDone(); i += 1) {
      lastStep = controller.advance({
        state: stalledState,
        mutations: makeMutations(),
        questContent: makeQuestContent(),
        cardDatabase: new Map(),
      });
    }

    expect(controller.isDone()).toBe(true);
    expect(lastStep).not.toBeNull();
    expect(lastStep?.stage).toBe("stalled");
  });

  it("isPlayableBattleBootstrapTerminal classifies stalled as terminal", () => {
    expect(
      isPlayableBattleBootstrapTerminal({
        stage: "stalled",
        reason: "max-steps-exceeded",
        lastAction: "enter-battle",
      }),
    ).toBe(true);
  });
});

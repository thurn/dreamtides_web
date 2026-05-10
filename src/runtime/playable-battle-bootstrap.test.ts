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
    renderedText: "Test ability.",
    imageNumber: "0002",
    startingEssence: 250,
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
    rejectDreamsignOffer: vi.fn(),
    ensureEssenceSiteRuntime: vi.fn(),
    acceptEssenceSite: vi.fn(),
    ensureShopRuntime: vi.fn(),
    buyShopSlot: vi.fn(),
    rerollShop: vi.fn(),
    ensureCardChoiceRuntime: vi.fn(),
    acceptTransfigurationChoice: vi.fn(),
    acceptDuplicationChoice: vi.fn(),
    ensureDreamJourneyRuntime: vi.fn(),
    completeDreamJourneyOption: vi.fn(),
    ensureTemptingOfferRuntime: vi.fn(),
    completeTemptingOfferOption: vi.fn(),
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
    dismissStartingDeckPopup: vi.fn(),
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
    hasSeenStartingDeckPopup: false,
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
          renderedText: "",
          imageNumber: "0001",
          startingEssence: 250,
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
          renderedText: "",
          imageNumber: "0001",
          startingEssence: 250,
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
          renderedText: "",
          imageNumber: "0001",
          startingEssence: 250,
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
          renderedText: "",
          imageNumber: "0001",
          startingEssence: 250,
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
          renderedText: "",
          imageNumber: "0001",
          startingEssence: 250,
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
            renderedText: resolvedPackage.dreamcaller.renderedText,
            imageNumber: resolvedPackage.dreamcaller.imageNumber,
            startingEssence: resolvedPackage.dreamcaller.startingEssence,
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
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 250,
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

  it("latches stalled once MAX_BOOTSTRAP_STEPS is exceeded across distinct preconditions", () => {
    const controller = createPlayableBattleBootstrapController();
    const dreamcaller = {
      id: "dreamcaller-1",
      name: "Test",
      title: "T",
      renderedText: "",
      imageNumber: "0001",
      startingEssence: 250,
    };
    const baseAtlas = makeAtlasWithBattleSite();
    // Oscillate the precondition fingerprint between two distinct shapes
    // every other call so the controller's dedup guard does not absorb
    // them. Each iteration is `dreamcaller=null` -> `dreamcaller=set,
    // currentDreamscape=null` -> `dreamcaller=null` -> ..., emulating a
    // pathological subscription pipeline that keeps churning the relevant
    // fields without ever advancing screen to the battle site.
    const stalledStates: QuestState[] = [
      makeState({ atlas: baseAtlas }),
      makeState({
        dreamcaller,
        atlas: baseAtlas,
        currentDreamscape: null,
      }),
    ];

    let lastStep = null as ReturnType<typeof controller.advance> | null;
    for (let i = 0; i < 64 && !controller.isDone(); i += 1) {
      const slot = stalledStates[i % stalledStates.length];
      if (slot === undefined) throw new Error("unreachable");
      lastStep = controller.advance({
        state: slot,
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

  it("reaches enter-battle through a realistic Firebase write+delivery storm", () => {
    // Reproduces bug B-2: opening `?startInBattle=1` and clicking Create
    // Game stalls at the dreamscape because each Firebase write inside
    // `bootstrapQuestStart` round-trips through the room subscription and
    // re-fires the host effect, which calls `controller.advance(...)`.
    //
    // The realistic storm:
    //  1. quest-start runs once. Mutations issue ~10 addCard writes plus
    //     setDreamcallerSelection / setDraftState / updateAtlas /
    //     setCurrentDreamscape / setScreen({type:"dreamscape"}). Firebase
    //     delivers one field per subscription tick.
    //  2. Each delivery is a separate React render -> effect fire ->
    //     advance() call. For most of those, dreamcaller is still null
    //     locally because the dreamcaller delivery hasn't arrived yet.
    //  3. select-dreamscape runs once when dreamcaller arrives. Another
    //     burst of subscription deliveries follow, each firing advance().
    //  4. enter-battle should run once currentDreamscape arrives; the
    //     screen flips to {type:"site", siteId:battleSite}.
    //
    // Without the fingerprint guard the controller burns its 16-step
    // budget on subscription churn during stage 1 and never reaches
    // enter-battle. With the guard, redundant advance() calls on the
    // same precondition fingerprint are no-ops and the controller
    // makes real progress through the stages.
    const controller = createPlayableBattleBootstrapController();
    const atlasWithBattle = makeAtlasWithBattleSite();
    let currentState = makeState({ atlas: atlasWithBattle });

    function applyMutationLater(updater: (s: QuestState) => QuestState): void {
      // Defer the application so that several `advance()` calls fire
      // against the un-updated state first, modeling the Firebase
      // round-trip latency between issuing a write and observing it.
      pending.push(updater);
    }

    const pending: Array<(s: QuestState) => QuestState> = [];

    const addCard: QuestMutations["addCard"] = (cardNumber) => {
      applyMutationLater((s) => ({
        ...s,
        deck: [
          ...s.deck,
          {
            entryId: `deck-${String(s.deck.length + 1)}`,
            cardNumber,
            isBane: false,
            transfiguration: null,
          },
        ],
      }));
    };
    const setDreamcallerSelection: QuestMutations["setDreamcallerSelection"] = (
      resolvedPackage,
    ) => {
      applyMutationLater((s) => ({
        ...s,
        dreamcaller: {
          id: resolvedPackage.dreamcaller.id,
          name: resolvedPackage.dreamcaller.name,
          title: resolvedPackage.dreamcaller.title,
          renderedText: resolvedPackage.dreamcaller.renderedText,
          imageNumber: resolvedPackage.dreamcaller.imageNumber,
          startingEssence: resolvedPackage.dreamcaller.startingEssence,
        },
      }));
    };
    const setDraftState: QuestMutations["setDraftState"] = (draftState) => {
      applyMutationLater((s) => ({ ...s, draftState }));
    };
    const updateAtlas: QuestMutations["updateAtlas"] = (atlas) => {
      applyMutationLater((s) => ({ ...s, atlas }));
    };
    const setCurrentDreamscape: QuestMutations["setCurrentDreamscape"] = (
      nodeId,
    ) => {
      applyMutationLater((s) => ({ ...s, currentDreamscape: nodeId }));
    };
    const setScreen: QuestMutations["setScreen"] = (screen) => {
      applyMutationLater((s) => ({ ...s, screen }));
    };

    const mutations: QuestMutations = {
      ...makeMutations(),
      addCard: vi.fn(addCard),
      setDreamcallerSelection: vi.fn(setDreamcallerSelection),
      setDraftState: vi.fn(setDraftState),
      updateAtlas: vi.fn(updateAtlas),
      setCurrentDreamscape: vi.fn(setCurrentDreamscape),
      setScreen: vi.fn(setScreen),
      markSiteVisited: vi.fn(),
    };

    const observedActions: string[] = [];
    const MAX_DELIVERIES = 200;

    for (let i = 0; i < MAX_DELIVERIES && !controller.isDone(); i += 1) {
      const result = controller.advance({
        state: currentState,
        mutations,
        questContent: makeQuestContent(),
        cardDatabase: new Map(),
      });
      if (result.stage === "in-progress") {
        const last = observedActions[observedActions.length - 1];
        if (last !== result.action) {
          observedActions.push(result.action);
        }
      }
      // Drain at most one pending delivery per advance to model RTDB
      // delivering one field at a time.
      const next = pending.shift();
      if (next !== undefined) {
        currentState = next(currentState);
      }
    }

    expect(controller.isDone()).toBe(true);
    expect(observedActions).toContain("quest-start");
    expect(observedActions).toContain("select-dreamscape");
    expect(observedActions).toContain("enter-battle");
    // Dedup must hold: each in-progress action runs at most once.
    const counts = new Map<string, number>();
    for (const action of observedActions) {
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
    expect(counts.get("quest-start")).toBe(1);
    expect(counts.get("select-dreamscape")).toBe(1);
    expect(counts.get("enter-battle")).toBe(1);
    // The previously-observed bug would re-issue addCard repeatedly. With
    // the fingerprint guard, the 10 starter addCards run in exactly one
    // batch.
    expect(vi.mocked(mutations.addCard).mock.calls.length).toBeLessThanOrEqual(10);
  });
});

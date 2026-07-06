import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeBattleSiteVictory,
  resetBattleCompletionBridge,
  type CompleteBattleSiteVictoryInput,
} from "./battle-completion-bridge";
import { LayerName } from "../../types/layer-name";

const mocks = vi.hoisted(() => ({
  advanceAtlas: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("../../atlas/atlas-generator", () => ({
  advanceAtlas: mocks.advanceAtlas,
}));

const TEST_ATLAS_BUILD_CONTEXT = {
  dreamscapes: [],
  atlasConfig: {
    layerSpecs: [],
    connectionAverage: 2,
    bonusReveal: { min: 0, max: 2, mode: 1 },
    repeatDiscourageStrength: 2,
    knownDreamsign: {
      maxPerAtlas: 2,
      eligibleLayers: [3, 4, 5, 6],
      placementProbability: 0.5,
      earlyRevealBias: 1,
    },
  },
  dreamsignPoolIds: [],
};

vi.mock("../../logging", () => ({
  logEvent: mocks.logEvent,
}));

function makeMutations() {
  return {
    changeEssence: vi.fn(),
    incrementCompletionLevel: vi.fn(),
    markSiteVisited: vi.fn(),
    setCurrentDreamscape: vi.fn(),
    setScreen: vi.fn(),
    updateAtlas: vi.fn(),
  };
}

function makeInput(
  overrides: Partial<CompleteBattleSiteVictoryInput> = {},
): CompleteBattleSiteVictoryInput {
  return {
    battleId: "battle:dreamscape-1:site-4:2",
    siteId: "site-4",
    dreamscapeId: "dreamscape-1",
    completionLevelAtBattleStart: 2,
    atlasSnapshot: {
      nodes: {
        "dreamscape-1": {
          id: "dreamscape-1",
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: "test_dreamscape",
          biomeName: "Luminous Reaches",
          biomeColor: "#fff",
          sites: [
            {
              id: "site-1",
              type: "Draft",
              isEnhanced: false,
              isVisited: true,
            },
            {
              id: "site-4",
              type: "Battle",
              isEnhanced: false,
              isVisited: false,
            },
          ],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: "dreamscape-1",
      bossNodeId: "dreamscape-1",
      currentNodeId: "dreamscape-1",
      layers: [],
      knownDreamsignCarrierIds: [],
    },
    essenceReward: 200,
    isFinalBoss: false,
    atlasBuildContext: TEST_ATLAS_BUILD_CONTEXT,
    mutations: makeMutations(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBattleCompletionBridge();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("completeBattleSiteVictory", () => {
  it("applies rewards immediately and defers atlas handoff through a bridge-owned timer", () => {
    vi.useFakeTimers();
    const updatedAtlas = {
      nodes: {},
      startingNodeId: "updated",
      bossNodeId: "updated",
      currentNodeId: "updated",
      layers: [],
      knownDreamsignCarrierIds: [],
    };
    const clearBattleStateForRoom = vi.fn();
    const input = makeInput({
      mutations: makeMutations(),
      postVictoryHandoffDelayMs: 800,
      clearBattleStateForRoom,
    });

    mocks.advanceAtlas.mockReturnValue(updatedAtlas);

    completeBattleSiteVictory(input);

    expect(input.mutations.changeEssence).toHaveBeenCalledWith(
      200,
      "battle_reward",
    );
    expect(input.mutations.markSiteVisited).toHaveBeenCalledWith("site-4");
    expect(input.mutations.incrementCompletionLevel).toHaveBeenCalledWith(
      200,
      null,
      null,
    );
    expect(input.mutations.setScreen).not.toHaveBeenCalled();
    expect(mocks.advanceAtlas).not.toHaveBeenCalled();
    expect(clearBattleStateForRoom).not.toHaveBeenCalled();

    vi.advanceTimersByTime(799);

    expect(input.mutations.setScreen).not.toHaveBeenCalled();
    expect(mocks.advanceAtlas).not.toHaveBeenCalled();
    expect(clearBattleStateForRoom).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(input.mutations.setScreen).toHaveBeenCalledWith({ type: "atlas" });
    expect(clearBattleStateForRoom).toHaveBeenCalledTimes(1);
    expect(mocks.advanceAtlas).toHaveBeenCalledWith(
      input.atlasSnapshot,
      "dreamscape-1",
      3,
      {},
      TEST_ATLAS_BUILD_CONTEXT,
    );
    expect(input.mutations.updateAtlas).toHaveBeenCalledWith(updatedAtlas);
    expect(input.mutations.setCurrentDreamscape).toHaveBeenCalledWith(null);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "battle_proto_completion_applied",
      expect.objectContaining({
        battleId: input.battleId,
        completionLevelAfterVictory: 3,
        siteId: "site-4",
      }),
    );
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "site_completed",
      expect.objectContaining({
        siteType: "Battle",
      }),
    );
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "essence_granted",
      expect.objectContaining({
        amount: 200,
        source: "battle_reward",
        battleId: input.battleId,
        siteId: "site-4",
      }),
    );
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "dreamscape_completed",
      expect.objectContaining({
        dreamscapeId: "dreamscape-1",
        sitesVisitedCount: 2,
      }),
    );
  });

  it("skips the atlas transition for final boss victories", () => {
    const clearBattleStateForRoom = vi.fn();
    const input = makeInput({
      battleId: "battle:none:site-final:6",
      siteId: "site-final",
      dreamscapeId: null,
      completionLevelAtBattleStart: 6,
      atlasSnapshot: {
        nodes: {},
        startingNodeId: "dreamscape-1",
        bossNodeId: "dreamscape-1",
        currentNodeId: "dreamscape-1",
        layers: [],
        knownDreamsignCarrierIds: [],
      },
      essenceReward: 400,
      isFinalBoss: true,
      mutations: makeMutations(),
      clearBattleStateForRoom,
    });

    completeBattleSiteVictory(input);

    expect(input.mutations.setScreen).not.toHaveBeenCalled();
    expect(input.mutations.updateAtlas).not.toHaveBeenCalled();
    expect(input.mutations.setCurrentDreamscape).not.toHaveBeenCalled();
    expect(clearBattleStateForRoom).toHaveBeenCalledTimes(1);
  });

  it("passes active dreamscape modifiers into atlas expansion", () => {
    vi.useFakeTimers();
    const updatedAtlas = {
      nodes: {},
      startingNodeId: "updated",
      bossNodeId: "updated",
      currentNodeId: "updated",
      layers: [],
      knownDreamsignCarrierIds: [],
    };
    const modifier = {
      kind: "boost_site_appearance" as const,
      siteType: "Shop" as const,
      percent: 50,
      dreamscapesRemaining: 3,
      source: "test:boost",
    };
    const input = makeInput({
      battleId: "battle:dreamscape-1:site-4:modifier",
      dreamscapeModifiers: [modifier],
    });

    mocks.advanceAtlas.mockReturnValue(updatedAtlas);

    completeBattleSiteVictory(input);
    vi.advanceTimersByTime(800);

    expect(mocks.advanceAtlas).toHaveBeenCalledWith(
      input.atlasSnapshot,
      "dreamscape-1",
      3,
      {
        dreamscapeModifiers: [modifier],
      },
      TEST_ATLAS_BUILD_CONTEXT,
    );
  });

  it("ignores duplicate completion for the same battle id", () => {
    vi.useFakeTimers();
    const updatedAtlas = {
      nodes: {},
      startingNodeId: "updated",
      bossNodeId: "updated",
      currentNodeId: "updated",
      layers: [],
      knownDreamsignCarrierIds: [],
    };
    const input = makeInput({
      battleId: "battle:dreamscape-1:site-4:3",
      mutations: makeMutations(),
      postVictoryHandoffDelayMs: 800,
    });

    mocks.advanceAtlas.mockReturnValue(updatedAtlas);

    completeBattleSiteVictory(input);
    completeBattleSiteVictory(input);

    expect(input.mutations.changeEssence).toHaveBeenCalledTimes(1);
    expect(input.mutations.markSiteVisited).toHaveBeenCalledTimes(1);
    expect(input.mutations.incrementCompletionLevel).toHaveBeenCalledTimes(1);
    expect(
      mocks.logEvent.mock.calls.filter(([event]) => event === "battle_proto_completion_applied"),
    ).toHaveLength(1);

    vi.runAllTimers();

    expect(input.mutations.setScreen).toHaveBeenCalledTimes(1);
    expect(mocks.advanceAtlas).toHaveBeenCalledTimes(1);
    expect(input.mutations.updateAtlas).toHaveBeenCalledTimes(1);
    expect(input.mutations.setCurrentDreamscape).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the idempotency set after resetBattleCompletionBridge so a recycled battleEntryKey can re-run completion", () => {
    const firstMutations = makeMutations();
    const secondMutations = makeMutations();
    const recycledBattleId = "battle:dreamscape-1:site-4:reset-cycle";

    completeBattleSiteVictory(
      makeInput({ battleId: recycledBattleId, mutations: firstMutations }),
    );
    expect(firstMutations.changeEssence).toHaveBeenCalledTimes(1);

    completeBattleSiteVictory(
      makeInput({ battleId: recycledBattleId, mutations: secondMutations }),
    );
    expect(secondMutations.changeEssence).not.toHaveBeenCalled();

    resetBattleCompletionBridge();

    const postResetMutations = makeMutations();
    completeBattleSiteVictory(
      makeInput({ battleId: recycledBattleId, mutations: postResetMutations }),
    );
    expect(postResetMutations.changeEssence).toHaveBeenCalledTimes(1);
    expect(postResetMutations.markSiteVisited).toHaveBeenCalledTimes(1);
    expect(postResetMutations.incrementCompletionLevel).toHaveBeenCalledTimes(1);
  });

  it("ignores a deferred handoff timer that fires after resetBattleCompletionBridge", () => {
    vi.useFakeTimers();
    const updatedAtlas = {
      nodes: {},
      startingNodeId: "updated",
      bossNodeId: "updated",
      currentNodeId: "updated",
      layers: [],
      knownDreamsignCarrierIds: [],
    };
    const input = makeInput({
      battleId: "battle:dreamscape-1:site-4:abort-cycle",
      mutations: makeMutations(),
      postVictoryHandoffDelayMs: 800,
    });
    mocks.advanceAtlas.mockReturnValue(updatedAtlas);

    completeBattleSiteVictory(input);
    expect(input.mutations.changeEssence).toHaveBeenCalledTimes(1);
    expect(input.mutations.setScreen).not.toHaveBeenCalled();

    resetBattleCompletionBridge();

    vi.advanceTimersByTime(5_000);
    vi.runAllTimers();

    expect(input.mutations.setScreen).not.toHaveBeenCalled();
    expect(mocks.advanceAtlas).not.toHaveBeenCalled();
    expect(input.mutations.updateAtlas).not.toHaveBeenCalled();
    expect(input.mutations.setCurrentDreamscape).not.toHaveBeenCalled();
  });
});

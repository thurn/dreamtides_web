import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeBattleSiteVictory,
  resetBattleCompletionBridge,
  type CompleteBattleSiteVictoryInput,
} from "./battle-completion-bridge";

const mocks = vi.hoisted(() => ({
  generateNewNodes: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("../../atlas/atlas-generator", () => ({
  generateNewNodes: mocks.generateNewNodes,
}));

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
          status: "available",
          enhancedSiteType: null,
        },
      },
      edges: [],
      startingNodeId: "dreamscape-1",
    },
    essenceReward: 200,
    omenReward: 2,
    isMiniboss: false,
    isFinalBoss: false,
    playerHasBanes: true,
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
      edges: [],
      startingNodeId: "updated",
    };
    const clearBattleStateForRoom = vi.fn();
    const input = makeInput({
      mutations: makeMutations(),
      postVictoryHandoffDelayMs: 800,
      clearBattleStateForRoom,
    });

    mocks.generateNewNodes.mockReturnValue(updatedAtlas);

    completeBattleSiteVictory(input);

    expect(input.mutations.changeEssence).toHaveBeenCalledWith(
      200,
      "battle_reward",
    );
    expect(input.mutations.markSiteVisited).toHaveBeenCalledWith("site-4");
    expect(input.mutations.incrementCompletionLevel).toHaveBeenCalledWith(
      200,
      2,
      null,
      null,
      false,
    );
    expect(input.mutations.setScreen).not.toHaveBeenCalled();
    expect(mocks.generateNewNodes).not.toHaveBeenCalled();
    expect(clearBattleStateForRoom).not.toHaveBeenCalled();

    vi.advanceTimersByTime(799);

    expect(input.mutations.setScreen).not.toHaveBeenCalled();
    expect(mocks.generateNewNodes).not.toHaveBeenCalled();
    expect(clearBattleStateForRoom).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(input.mutations.setScreen).toHaveBeenCalledWith({ type: "atlas" });
    expect(clearBattleStateForRoom).toHaveBeenCalledTimes(1);
    expect(mocks.generateNewNodes).toHaveBeenCalledWith(
      input.atlasSnapshot,
      "dreamscape-1",
      3,
      { playerHasBanes: true },
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
        edges: [],
        startingNodeId: "dreamscape-1",
      },
      essenceReward: 400,
      isFinalBoss: true,
      playerHasBanes: false,
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
      edges: [],
      startingNodeId: "updated",
    };
    const modifier = {
      kind: "boost_site_appearance" as const,
      siteType: "SpecialtyShop" as const,
      percent: 50,
      dreamscapesRemaining: 3,
      source: "test:boost",
    };
    const input = makeInput({
      battleId: "battle:dreamscape-1:site-4:modifier",
      dreamscapeModifiers: [modifier],
    });

    mocks.generateNewNodes.mockReturnValue(updatedAtlas);

    completeBattleSiteVictory(input);
    vi.advanceTimersByTime(800);

    expect(mocks.generateNewNodes).toHaveBeenCalledWith(
      input.atlasSnapshot,
      "dreamscape-1",
      3,
      {
        playerHasBanes: true,
        dreamscapeModifiers: [modifier],
      },
    );
  });

  it("ignores duplicate completion for the same battle id", () => {
    vi.useFakeTimers();
    const updatedAtlas = {
      nodes: {},
      edges: [],
      startingNodeId: "updated",
    };
    const input = makeInput({
      battleId: "battle:dreamscape-1:site-4:3",
      mutations: makeMutations(),
      postVictoryHandoffDelayMs: 800,
    });

    mocks.generateNewNodes.mockReturnValue(updatedAtlas);

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
    expect(mocks.generateNewNodes).toHaveBeenCalledTimes(1);
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
      edges: [],
      startingNodeId: "updated",
    };
    const input = makeInput({
      battleId: "battle:dreamscape-1:site-4:abort-cycle",
      mutations: makeMutations(),
      postVictoryHandoffDelayMs: 800,
    });
    mocks.generateNewNodes.mockReturnValue(updatedAtlas);

    completeBattleSiteVictory(input);
    expect(input.mutations.changeEssence).toHaveBeenCalledTimes(1);
    expect(input.mutations.setScreen).not.toHaveBeenCalled();

    resetBattleCompletionBridge();

    vi.advanceTimersByTime(5_000);
    vi.runAllTimers();

    expect(input.mutations.setScreen).not.toHaveBeenCalled();
    expect(mocks.generateNewNodes).not.toHaveBeenCalled();
    expect(input.mutations.updateAtlas).not.toHaveBeenCalled();
    expect(input.mutations.setCurrentDreamscape).not.toHaveBeenCalled();
  });
});

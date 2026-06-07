import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../logging";
import {
  beginQuestFailureRoute,
  freezeQuestFailureSummary,
} from "./failure-route";
import type { BattleMutableState } from "../types";

function makeMutableState(
  overrides: Partial<BattleMutableState> = {},
): Pick<BattleMutableState, "turnNumber" | "sides"> {
  return {
    turnNumber: 4,
    sides: {
      player: {
        currentEnergy: 3,
        maxEnergy: 3,
        score: 12,
        visibility: {},
        deck: [],
        hand: [],
        void: [],
        banished: [],
        backRank: { B0: null, B1: null, B2: null, B3: null, B4: null },
        frontRank: { F0: null, F1: null, F2: null, F3: null },
      },
      enemy: {
        currentEnergy: 0,
        maxEnergy: 0,
        score: 15,
        visibility: {},
        deck: [],
        hand: [],
        void: [],
        banished: [],
        backRank: { B0: null, B1: null, B2: null, B3: null, B4: null },
        frontRank: { F0: null, F1: null, F2: null, F3: null },
      },
    },
    ...overrides,
  };
}

function makeMutations() {
  return {
    setFailureSummary: vi.fn(),
    dismissStartingDeckPopup: vi.fn(),
    setScreen: vi.fn(),
  };
}

beforeEach(() => {
  resetLog();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("freezeQuestFailureSummary", () => {
  it("captures every required field from the battle state", () => {
    const summary = freezeQuestFailureSummary({
      battleInit: {
        battleId: "battle-1",
        siteId: "site-7",
        dreamscapeId: "dreamscape-2",
      },
      mutableState: makeMutableState(),
      result: "defeat",
      reason: "score_target_reached",
      siteLabel: "Battle",
    });

    expect(summary).toEqual({
      battleId: "battle-1",
      result: "defeat",
      reason: "score_target_reached",
      siteId: "site-7",
      siteLabel: "Battle",
      dreamscapeIdOrNone: "dreamscape-2",
      turnNumber: 4,
      playerScore: 12,
      enemyScore: 15,
    });
  });

  it("preserves the null dreamscape id when no dreamscape is active", () => {
    const summary = freezeQuestFailureSummary({
      battleInit: {
        battleId: "battle-2",
        siteId: "site-1",
        dreamscapeId: null,
      },
      mutableState: makeMutableState(),
      result: "draw",
      reason: "turn_limit_reached",
      siteLabel: "Battle",
    });

    expect(summary.dreamscapeIdOrNone).toBeNull();
    expect(summary.result).toBe("draw");
    expect(summary.reason).toBe("turn_limit_reached");
  });
});

describe("beginQuestFailureRoute", () => {
  it("freezes the summary, pushes it onto quest state, and routes to questFailed without resetting the quest", () => {
    const mutations = makeMutations();

    const summary = beginQuestFailureRoute({
      battleInit: {
        battleId: "battle-3",
        siteId: "site-9",
        dreamscapeId: "dreamscape-4",
      },
      mutableState: makeMutableState(),
      result: "defeat",
      reason: "forced_result",
      siteLabel: "Battle",
      mutations,
    });

    expect(summary.battleId).toBe("battle-3");
    expect(summary.result).toBe("defeat");
    expect(summary.reason).toBe("forced_result");
    expect(summary.playerScore).toBe(12);

    expect(mutations.setFailureSummary).toHaveBeenCalledTimes(1);
    expect(mutations.setFailureSummary).toHaveBeenCalledWith(
      summary,
      "battle_failure_confirmed",
    );
    expect(mutations.setScreen).toHaveBeenCalledTimes(1);
    expect(mutations.setScreen).toHaveBeenCalledWith({ type: "questFailed" });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "battle_proto_failure_route_begin",
          battleId: "battle-3",
          result: "defeat",
          reason: "forced_result",
        }),
      ]),
    );
  });

  it("invokes clearBattleStateForRoom once after setScreen", () => {
    const mutations = makeMutations();
    const clearBattleStateForRoom = vi.fn();
    const callOrder: string[] = [];
    mutations.setFailureSummary.mockImplementation(() => {
      callOrder.push("setFailureSummary");
    });
    mutations.setScreen.mockImplementation(() => {
      callOrder.push("setScreen");
    });
    clearBattleStateForRoom.mockImplementation(() => {
      callOrder.push("clearBattleStateForRoom");
    });

    beginQuestFailureRoute({
      battleInit: {
        battleId: "battle-4",
        siteId: "site-10",
        dreamscapeId: null,
      },
      mutableState: makeMutableState(),
      result: "defeat",
      reason: "forced_result",
      siteLabel: "Battle",
      mutations,
      clearBattleStateForRoom,
    });

    expect(clearBattleStateForRoom).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual([
      "setFailureSummary",
      "setScreen",
      "clearBattleStateForRoom",
    ]);
  });
});

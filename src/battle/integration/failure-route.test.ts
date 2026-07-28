import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../logging";
import {
  beginJourneyFailureRoute,
  freezeJourneyFailureSummary,
} from "./failure-route";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../test-support";
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
        backRank: emptyBackRankSlots(),
        frontRank: emptyFrontRankSlots(),
        fatigueCount: 0,
        dreamwellCardIndex: null,
        dreamwellDrawnTurn: null,
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
        backRank: emptyBackRankSlots(),
        frontRank: emptyFrontRankSlots(),
        fatigueCount: 0,
        dreamwellCardIndex: null,
        dreamwellDrawnTurn: null,
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

describe("freezeJourneyFailureSummary", () => {
  it("captures every required field from the battle state", () => {
    const summary = freezeJourneyFailureSummary({
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
    const summary = freezeJourneyFailureSummary({
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

describe("beginJourneyFailureRoute", () => {
  it("freezes the summary, pushes it onto journey state, and routes to journeyFailed without resetting the journey", () => {
    const mutations = makeMutations();

    const summary = beginJourneyFailureRoute({
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
    expect(mutations.setScreen).toHaveBeenCalledWith({ type: "journeyFailed" });
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

    beginJourneyFailureRoute({
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

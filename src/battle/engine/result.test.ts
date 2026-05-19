import { describe, expect, it } from "vitest";
import { evaluateBattleResult } from "./result";

describe("evaluateBattleResult", () => {
  it("awards the higher simultaneous score target as the winner", () => {
    const evaluation = evaluateBattleResult(
      makeResultState(27, 25),
      { scoreToWin: 25, turnLimit: 50 },
    );

    expect(evaluation).toEqual({
      result: "victory",
      reason: "score_target_reached",
    });
  });

  it("returns a draw for an exact simultaneous score target tie", () => {
    const evaluation = evaluateBattleResult(
      makeResultState(25, 25),
      { scoreToWin: 25, turnLimit: 50 },
    );

    expect(evaluation).toEqual({
      result: "draw",
      reason: "score_target_reached",
    });
  });

  it("returns a draw when the turn limit is reached without a winner", () => {
    const evaluation = evaluateBattleResult(makeTurnLimitState(12, 10), {
      scoreToWin: 25,
      turnLimit: 50,
    });

    expect(evaluation).toEqual({
      result: "draw",
      reason: "turn_limit_reached",
    });
  });

  it("does not draw before the 50-turn limit is reached", () => {
    const evaluation = evaluateBattleResult(
      {
        ...makeTurnLimitState(12, 10),
        turnNumber: 49,
      },
      { scoreToWin: 25, turnLimit: 50 },
    );

    expect(evaluation).toEqual({
      result: null,
      reason: null,
    });
  });

  it("draws when turnNumber exceeds the limit regardless of phase (bug-035 backstop)", () => {
    const evaluation = evaluateBattleResult(
      {
        ...makeTurnLimitState(12, 10),
        activeSide: "player" as const,
        turnNumber: 51,
        phase: "day" as const,
      },
      { scoreToWin: 25, turnLimit: 50 },
    );

    expect(evaluation).toEqual({
      result: "draw",
      reason: "turn_limit_reached",
    });
  });
});

function makeResultState(playerScore: number, enemyScore: number) {
  return {
    battleId: "battle-1",
    activeSide: "player" as const,
    turnNumber: 1,
    phase: "day" as const,
    result: null,
    forcedResult: null,
    nextBattleCardOrdinal: 1,
    sides: {
      player: {
        currentEnergy: 1,
        maxEnergy: 1,
        score: playerScore,
        pendingExtraTurns: 0,
        visibility: {},
        deck: [],
        hand: [],
        void: [],
        banished: [],
        reserve: {
          R0: null,
          R1: null,
          R2: null,
          R3: null,
          R4: null,
        },
        deployed: {
          D0: null,
          D1: null,
          D2: null,
          D3: null,
        },
      },
      enemy: {
        currentEnergy: 0,
        maxEnergy: 0,
        score: enemyScore,
        pendingExtraTurns: 0,
        visibility: {},
        deck: [],
        hand: [],
        void: [],
        banished: [],
        reserve: {
          R0: null,
          R1: null,
          R2: null,
          R3: null,
          R4: null,
        },
        deployed: {
          D0: null,
          D1: null,
          D2: null,
          D3: null,
        },
      },
    },
    cardInstances: {},
  };
}

function makeTurnLimitState(playerScore: number, enemyScore: number) {
  return {
    ...makeResultState(playerScore, enemyScore),
    activeSide: "enemy" as const,
    turnNumber: 50,
    phase: "ending" as const,
  };
}

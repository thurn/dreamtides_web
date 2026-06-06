import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import type { AiCard, AiOpponentBody, ForwardModel } from "./forward-model";

function emptyDeployed(): ForwardModel["aiDeployed"] {
  return { D0: null, D1: null, D2: null, D3: null };
}

function emptyReserve(): ForwardModel["aiReserve"] {
  return { R0: null, R1: null, R2: null, R3: null, R4: null };
}

function baseModel(overrides: Partial<ForwardModel> = {}): ForwardModel {
  return {
    aiEnergy: 0,
    aiMaxEnergy: 0,
    aiScore: 0,
    playerScore: 0,
    aiHand: [],
    aiDeck: [],
    aiVoid: [],
    aiDeployed: emptyDeployed(),
    aiReserve: emptyReserve(),
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

let nextId = 0;

function makeCard(overrides: Partial<AiCard> = {}): AiCard {
  nextId += 1;
  return {
    battleCardId: `card-${nextId}`,
    cardNumber: 999, // unmodeled by default: no static spark, no valueHint
    name: "Test Body",
    energyCost: 0,
    basePrintedSpark: 0,
    sparkDelta: 0,
    figmentCount: 1,
    canChallengeThisTurn: true,
    ...overrides,
  };
}

function opponentBody(overrides: Partial<AiOpponentBody> = {}): AiOpponentBody {
  nextId += 1;
  return {
    battleCardId: `opp-${nextId}`,
    effectiveSpark: 0,
    energyCost: 0,
    rank: "front",
    slot: "D0",
    isFigment: false,
    ...overrides,
  };
}

describe("evaluate", () => {
  describe("terminal", () => {
    it("returns +Infinity when the AI has reached the win threshold", () => {
      expect(evaluate(baseModel({ aiScore: 25 }))).toBe(Number.POSITIVE_INFINITY);
      expect(evaluate(baseModel({ aiScore: 30 }))).toBe(Number.POSITIVE_INFINITY);
    });

    it("returns -Infinity when the player has reached the win threshold", () => {
      expect(evaluate(baseModel({ playerScore: 25 }))).toBe(Number.NEGATIVE_INFINITY);
      expect(evaluate(baseModel({ playerScore: 31 }))).toBe(Number.NEGATIVE_INFINITY);
    });

    it("short-circuits the AI win even with an otherwise terrible board", () => {
      const terrible = baseModel({
        aiScore: 25,
        opponentBodies: [
          opponentBody({ effectiveSpark: 99, rank: "front", slot: "D0" }),
        ],
      });
      expect(evaluate(terrible)).toBe(Number.POSITIVE_INFINITY);
    });

    it("short-circuits the player win even with an otherwise winning board", () => {
      const board = baseModel({
        playerScore: 25,
        aiDeployed: {
          ...emptyDeployed(),
          D0: makeCard({ basePrintedSpark: 99 }),
        },
      });
      expect(evaluate(board)).toBe(Number.NEGATIVE_INFINITY);
    });

    it("treats AI win as dominant when both sides are at/over the threshold", () => {
      // AI check happens first; reaching the goal is a win for the AI.
      expect(evaluate(baseModel({ aiScore: 25, playerScore: 25 }))).toBe(
        Number.POSITIVE_INFINITY,
      );
    });
  });

  describe("dominant score term", () => {
    it("is strictly increasing in aiScore below the win threshold", () => {
      const low = evaluate(baseModel({ aiScore: 5 }));
      const high = evaluate(baseModel({ aiScore: 10 }));
      expect(high).toBeGreaterThan(low);
    });

    it("is strictly decreasing in playerScore below the win threshold", () => {
      const low = evaluate(baseModel({ playerScore: 5 }));
      const high = evaluate(baseModel({ playerScore: 10 }));
      expect(high).toBeLessThan(low);
    });
  });

  describe("board spark", () => {
    it("favors the AI when it has strictly more board spark", () => {
      const aiAhead = baseModel({
        aiDeployed: {
          ...emptyDeployed(),
          D0: makeCard({ basePrintedSpark: 5 }),
        },
        opponentBodies: [opponentBody({ effectiveSpark: 1, rank: "front", slot: "D0" })],
      });
      const oppAhead = baseModel({
        aiDeployed: {
          ...emptyDeployed(),
          D0: makeCard({ basePrintedSpark: 1 }),
        },
        opponentBodies: [opponentBody({ effectiveSpark: 5, rank: "front", slot: "D0" })],
      });
      expect(evaluate(aiAhead)).toBeGreaterThan(evaluate(oppAhead));
    });

    it("weights front-rank spark above back-rank spark", () => {
      const front = baseModel({
        aiDeployed: { ...emptyDeployed(), D0: makeCard({ basePrintedSpark: 4 }) },
      });
      const back = baseModel({
        aiReserve: { ...emptyReserve(), R0: makeCard({ basePrintedSpark: 4 }) },
      });
      expect(evaluate(front)).toBeGreaterThan(evaluate(back));
    });
  });

  describe("symmetry", () => {
    it("evaluates an empty, even board near zero", () => {
      const result = evaluate(baseModel());
      expect(Math.abs(result)).toBeLessThan(1);
    });
  });
});

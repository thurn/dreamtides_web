import { describe, expect, it } from "vitest";
import { planDefense } from "./defense";
import type { AiCard, AiOpponentBody, ForwardModel } from "./forward-model";

function makeCard(overrides: Partial<AiCard> & Pick<AiCard, "battleCardId">): AiCard {
  return {
    cardNumber: 512,
    name: "body",
    energyCost: 0,
    basePrintedSpark: 1,
    sparkDelta: 0,
    figmentCount: 1,
    canChallengeThisTurn: true,
    ...overrides,
  };
}

function makeBody(overrides: Partial<AiOpponentBody> & Pick<AiOpponentBody, "battleCardId">): AiOpponentBody {
  return {
    effectiveSpark: 1,
    energyCost: 0,
    rank: "front",
    slot: "F0",
    isFigment: false,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ForwardModel> = {}): ForwardModel {
  return {
    aiEnergy: 0,
    aiMaxEnergy: 5,
    aiScore: 0,
    playerScore: 0,
    aiHand: [],
    aiDeck: [],
    aiVoid: [],
    aiFrontRank: { F0: null, F1: null, F2: null, F3: null },
    aiBackRank: { B0: null, B1: null, B2: null, B3: null, B4: null },
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

const OPTS = { scoreToWin: 25 };

describe("planDefense", () => {
  it("returns no moves when the opponent has no front-rank challengers", () => {
    const model = makeModel({
      aiBackRank: {
        B0: makeCard({ battleCardId: "blocker", basePrintedSpark: 5 }),
        B1: null,
        B2: null,
        B3: null,
        B4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "back", rank: "back", slot: "B0" })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("blocks a challenger in its own lane with a favorable body that survives", () => {
    const model = makeModel({
      aiBackRank: {
        B0: makeCard({ battleCardId: "wolf", basePrintedSpark: 4 }),
        B1: null,
        B2: null,
        B3: null,
        B4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "F2", effectiveSpark: 3 })],
    });

    const moves = planDefense(model, OPTS);
    expect(moves).toHaveLength(1);
    expect(moves[0].kind).toBe("MOVE_CARD");
    expect(moves[0].self?.battleCardId).toBe("wolf");
    // The defender goes into the lane directly opposite the challenger.
    expect(moves[0].toSlot).toBe("F2");
  });

  it("prefers the smallest body that still beats the challenger", () => {
    const model = makeModel({
      aiBackRank: {
        B0: makeCard({ battleCardId: "huge", basePrintedSpark: 9 }),
        B1: makeCard({ battleCardId: "just-enough", basePrintedSpark: 4 }),
        B2: null,
        B3: null,
        B4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "F0", effectiveSpark: 3 })],
    });

    const moves = planDefense(model, OPTS);
    expect(moves).toHaveLength(1);
    expect(moves[0].self?.battleCardId).toBe("just-enough");
  });

  it("does not move a still-exhausted reserve body up to block", () => {
    const model = makeModel({
      aiBackRank: {
        B0: makeCard({ battleCardId: "exhausted", basePrintedSpark: 6, canChallengeThisTurn: false }),
        B1: null,
        B2: null,
        B3: null,
        B4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "F0", effectiveSpark: 3 })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("skips a lane already defended by a deployed body", () => {
    const model = makeModel({
      aiFrontRank: {
        F0: makeCard({ battleCardId: "onguard", basePrintedSpark: 2 }),
        F1: null,
        F2: null,
        F3: null,
      },
      aiBackRank: {
        B0: makeCard({ battleCardId: "backRank", basePrintedSpark: 5 }),
        B1: null,
        B2: null,
        B3: null,
        B4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "F0", effectiveSpark: 3 })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("chump-blocks with the smallest body when behind and unable to win the trade", () => {
    const model = makeModel({
      aiScore: 0,
      playerScore: 5,
      aiBackRank: {
        B0: makeCard({ battleCardId: "small", basePrintedSpark: 1 }),
        B1: makeCard({ battleCardId: "medium", basePrintedSpark: 2 }),
        B2: null,
        B3: null,
        B4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "F1", effectiveSpark: 6 })],
    });

    const moves = planDefense(model, OPTS);
    expect(moves).toHaveLength(1);
    expect(moves[0].self?.battleCardId).toBe("small");
    expect(moves[0].toSlot).toBe("F1");
  });

  it("does not chump-block a small threat when safely ahead", () => {
    const model = makeModel({
      aiScore: 20,
      playerScore: 0,
      aiBackRank: {
        B0: makeCard({ battleCardId: "precious", basePrintedSpark: 5 }),
        B1: null,
        B2: null,
        B3: null,
        B4: null,
      },
      // Challenger outsparks the only blocker, and the hit is far from lethal.
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "F0", effectiveSpark: 8 })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("assigns the strongest blockers to the biggest threats first", () => {
    const model = makeModel({
      aiBackRank: {
        B0: makeCard({ battleCardId: "b3", basePrintedSpark: 3 }),
        B1: makeCard({ battleCardId: "b5", basePrintedSpark: 5 }),
        B2: null,
        B3: null,
        B4: null,
      },
      opponentBodies: [
        makeBody({ battleCardId: "small", slot: "F0", effectiveSpark: 2 }),
        makeBody({ battleCardId: "big", slot: "F1", effectiveSpark: 4 }),
      ],
    });

    const moves = planDefense(model, OPTS);
    expect(moves).toHaveLength(2);
    const byLane = new Map(moves.map((m) => [m.toSlot, m.self?.battleCardId]));
    // Big threat (4✦ in F1) gets the body that can beat it; the small threat
    // takes the smaller favorable blocker.
    expect(byLane.get("F1")).toBe("b5");
    expect(byLane.get("F0")).toBe("b3");
  });
});

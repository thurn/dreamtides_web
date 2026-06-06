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
    slot: "D0",
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
    aiDeployed: { D0: null, D1: null, D2: null, D3: null },
    aiReserve: { R0: null, R1: null, R2: null, R3: null, R4: null },
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
      aiReserve: {
        R0: makeCard({ battleCardId: "blocker", basePrintedSpark: 5 }),
        R1: null,
        R2: null,
        R3: null,
        R4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "back", rank: "back", slot: "R0" })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("blocks a challenger in its own lane with a favorable body that survives", () => {
    const model = makeModel({
      aiReserve: {
        R0: makeCard({ battleCardId: "wolf", basePrintedSpark: 4 }),
        R1: null,
        R2: null,
        R3: null,
        R4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "D2", effectiveSpark: 3 })],
    });

    const moves = planDefense(model, OPTS);
    expect(moves).toHaveLength(1);
    expect(moves[0].kind).toBe("MOVE_CARD");
    expect(moves[0].self?.battleCardId).toBe("wolf");
    // The defender goes into the lane directly opposite the challenger.
    expect(moves[0].toSlot).toBe("D2");
  });

  it("prefers the smallest body that still beats the challenger", () => {
    const model = makeModel({
      aiReserve: {
        R0: makeCard({ battleCardId: "huge", basePrintedSpark: 9 }),
        R1: makeCard({ battleCardId: "just-enough", basePrintedSpark: 4 }),
        R2: null,
        R3: null,
        R4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "D0", effectiveSpark: 3 })],
    });

    const moves = planDefense(model, OPTS);
    expect(moves).toHaveLength(1);
    expect(moves[0].self?.battleCardId).toBe("just-enough");
  });

  it("does not move a still-exhausted reserve body up to block", () => {
    const model = makeModel({
      aiReserve: {
        R0: makeCard({ battleCardId: "exhausted", basePrintedSpark: 6, canChallengeThisTurn: false }),
        R1: null,
        R2: null,
        R3: null,
        R4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "D0", effectiveSpark: 3 })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("skips a lane already defended by a deployed body", () => {
    const model = makeModel({
      aiDeployed: {
        D0: makeCard({ battleCardId: "onguard", basePrintedSpark: 2 }),
        D1: null,
        D2: null,
        D3: null,
      },
      aiReserve: {
        R0: makeCard({ battleCardId: "reserve", basePrintedSpark: 5 }),
        R1: null,
        R2: null,
        R3: null,
        R4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "D0", effectiveSpark: 3 })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("chump-blocks with the smallest body when behind and unable to win the trade", () => {
    const model = makeModel({
      aiScore: 0,
      playerScore: 5,
      aiReserve: {
        R0: makeCard({ battleCardId: "small", basePrintedSpark: 1 }),
        R1: makeCard({ battleCardId: "medium", basePrintedSpark: 2 }),
        R2: null,
        R3: null,
        R4: null,
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "D1", effectiveSpark: 6 })],
    });

    const moves = planDefense(model, OPTS);
    expect(moves).toHaveLength(1);
    expect(moves[0].self?.battleCardId).toBe("small");
    expect(moves[0].toSlot).toBe("D1");
  });

  it("does not chump-block a small threat when safely ahead", () => {
    const model = makeModel({
      aiScore: 20,
      playerScore: 0,
      aiReserve: {
        R0: makeCard({ battleCardId: "precious", basePrintedSpark: 5 }),
        R1: null,
        R2: null,
        R3: null,
        R4: null,
      },
      // Challenger outsparks the only blocker, and the hit is far from lethal.
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "D0", effectiveSpark: 8 })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("assigns the strongest blockers to the biggest threats first", () => {
    const model = makeModel({
      aiReserve: {
        R0: makeCard({ battleCardId: "b3", basePrintedSpark: 3 }),
        R1: makeCard({ battleCardId: "b5", basePrintedSpark: 5 }),
        R2: null,
        R3: null,
        R4: null,
      },
      opponentBodies: [
        makeBody({ battleCardId: "small", slot: "D0", effectiveSpark: 2 }),
        makeBody({ battleCardId: "big", slot: "D1", effectiveSpark: 4 }),
      ],
    });

    const moves = planDefense(model, OPTS);
    expect(moves).toHaveLength(2);
    const byLane = new Map(moves.map((m) => [m.toSlot, m.self?.battleCardId]));
    // Big threat (4✦ in D1) gets the body that can beat it; the small threat
    // takes the smaller favorable blocker.
    expect(byLane.get("D1")).toBe("b5");
    expect(byLane.get("D0")).toBe("b3");
  });
});

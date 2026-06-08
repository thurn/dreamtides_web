import { describe, expect, it, vi } from "vitest";

import type { AiCard, AiOpponentBody, ForwardModel } from "./forward-model";
import { scoreAgainstOpponent } from "./opponent-model";

// --- Fixtures -------------------------------------------------------------

function makeCard(overrides: Partial<AiCard> & { battleCardId: string }): AiCard {
  return {
    cardNumber: 0,
    name: "Test",
    energyCost: 0,
    basePrintedSpark: 0,
    sparkDelta: 0,
    figmentCount: 1,
    canChallengeThisTurn: true,
    ...overrides,
  };
}

function makeBody(overrides: Partial<AiOpponentBody> & { battleCardId: string }): AiOpponentBody {
  return {
    effectiveSpark: 1,
    energyCost: 0,
    rank: "front",
    slot: "F0",
    isFigment: false,
    ...overrides,
  };
}

function emptyModel(): ForwardModel {
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
  };
}

/** A model with three AI challengers (sparks 5, 3, 2) and no opponent bodies. */
function modelWithChallengers(): ForwardModel {
  const model = emptyModel();
  model.aiFrontRank.F0 = makeCard({
    battleCardId: "ai-0",
    basePrintedSpark: 5,
    canChallengeThisTurn: true,
  });
  model.aiFrontRank.F1 = makeCard({
    battleCardId: "ai-1",
    basePrintedSpark: 3,
    canChallengeThisTurn: true,
  });
  model.aiFrontRank.F2 = makeCard({
    battleCardId: "ai-2",
    basePrintedSpark: 2,
    canChallengeThisTurn: true,
  });
  return model;
}

// --- Tests ----------------------------------------------------------------

describe("scoreAgainstOpponent", () => {
  it("is deterministic for identical (model, mode, sampleCap, seed)", () => {
    const model = modelWithChallengers();
    model.opponentBodies = [
      makeBody({ battleCardId: "op-0", effectiveSpark: 4, slot: "F0" }),
      makeBody({ battleCardId: "op-1", effectiveSpark: 2, slot: "F1" }),
    ];
    model.opponentHandCount = 3;

    const a = scoreAgainstOpponent(model, "expectiminimax", 8, 12345);
    const b = scoreAgainstOpponent(model, "expectiminimax", 8, 12345);
    expect(a).toBe(b);

    const c = scoreAgainstOpponent(model, "worstCase", 8, 999);
    const d = scoreAgainstOpponent(model, "worstCase", 8, 999);
    expect(c).toBe(d);
  });

  it("worstCase <= expectiminimax for the same board and seed (min <= mean)", () => {
    const model = modelWithChallengers();
    model.opponentBodies = [
      makeBody({ battleCardId: "op-0", effectiveSpark: 6, slot: "F0" }),
      makeBody({ battleCardId: "op-1", effectiveSpark: 4, slot: "F1" }),
    ];
    model.opponentHandCount = 2;

    const worst = scoreAgainstOpponent(model, "worstCase", 12, 555);
    const expected = scoreAgainstOpponent(model, "expectiminimax", 12, 555);
    expect(worst).toBeLessThanOrEqual(expected);
  });

  it("no opponent bodies (best case) scores higher than a board with big blockers", () => {
    const open = modelWithChallengers();
    open.opponentBodies = [];

    const blocked = modelWithChallengers();
    blocked.opponentBodies = [
      makeBody({ battleCardId: "op-0", effectiveSpark: 9, slot: "F0" }),
      makeBody({ battleCardId: "op-1", effectiveSpark: 9, slot: "F1" }),
      makeBody({ battleCardId: "op-2", effectiveSpark: 9, slot: "F2" }),
    ];

    const openScore = scoreAgainstOpponent(open, "expectiminimax", 8, 7);
    const blockedScore = scoreAgainstOpponent(blocked, "expectiminimax", 8, 7);
    expect(openScore).toBeGreaterThan(blockedScore);
  });

  it("bounds the number of sampled responses by sampleCap", async () => {
    const evaluateModule = await import("./evaluate");
    const spy = vi.spyOn(evaluateModule, "evaluate");

    const model = modelWithChallengers();
    model.aiFrontRank.F3 = makeCard({
      battleCardId: "ai-3",
      basePrintedSpark: 7,
      canChallengeThisTurn: true,
    });
    model.opponentBodies = [
      makeBody({ battleCardId: "op-0", effectiveSpark: 8, slot: "F0" }),
      makeBody({ battleCardId: "op-1", effectiveSpark: 7, slot: "F1" }),
      makeBody({ battleCardId: "op-2", effectiveSpark: 6, slot: "F2", rank: "back" }),
      makeBody({ battleCardId: "op-3", effectiveSpark: 5, slot: "F3" }),
    ];
    model.opponentHandCount = 5;

    spy.mockClear();
    const score = scoreAgainstOpponent(model, "expectiminimax", 4, 42);
    expect(Number.isFinite(score)).toBe(true);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(4);

    spy.mockRestore();
  });

  it("does not explode on a large board with a small sampleCap", () => {
    const model = modelWithChallengers();
    model.aiFrontRank.F3 = makeCard({
      battleCardId: "ai-3",
      basePrintedSpark: 9,
      canChallengeThisTurn: true,
    });
    for (let i = 0; i < 9; i += 1) {
      model.opponentBodies.push(
        makeBody({
          battleCardId: `op-${String(i)}`,
          effectiveSpark: 3 + i,
          slot: i < 4 ? `D${String(i)}` : `R${String(i - 4)}`,
          rank: i < 4 ? "front" : "back",
        }),
      );
    }
    model.opponentHandCount = 7;

    const score = scoreAgainstOpponent(model, "worstCase", 4, 314);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("reads only abstract opponent fields (asymmetric knowledge)", () => {
    // The opponent bodies carry no card identity beyond the abstract handle —
    // confirm the function runs and returns a finite number without touching
    // any concrete card definition.
    const model = modelWithChallengers();
    model.opponentBodies = [makeBody({ battleCardId: "anon", effectiveSpark: 4 })];
    model.opponentHandCount = 4;

    const score = scoreAgainstOpponent(model, "expectiminimax", 8, 1);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("returns a finite number when the AI has no challengers", () => {
    const model = emptyModel();
    model.opponentBodies = [makeBody({ battleCardId: "op-0", effectiveSpark: 5 })];
    const score = scoreAgainstOpponent(model, "expectiminimax", 8, 2);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("returns a finite number when samples mix +Infinity and −Infinity evaluations", () => {
    // Fixture designed to produce both terminal infinities in a single sample set:
    // - playerScore = 25 means evaluate() returns -Infinity unless aiScore also
    //   reaches 25 first (aiScore check is first in evaluate()).
    // - aiScore = 20 + a challenger with spark 5 means the "noDefense" archetype
    //   (unblocked scoring) pushes aiScore to 25 → +Infinity.
    // - A "tradeEvenly" response with a bigger blocker prevents scoring, leaving
    //   aiScore < 25 while playerScore = 25 → -Infinity.
    // Without the clamp, weightedSum = (+Inf)*w1 + (-Inf)*w2 = NaN.
    const model = emptyModel();
    model.aiScore = 20;
    model.playerScore = 25;
    // Single challenger with spark 5: unblocked it scores 5, reaching aiScore 25.
    model.aiFrontRank.F0 = makeCard({
      battleCardId: "ai-near-win",
      basePrintedSpark: 5,
      canChallengeThisTurn: true,
    });
    // One big blocker to ensure "tradeEvenly" keeps the AI from scoring.
    model.opponentBodies = [makeBody({ battleCardId: "op-blocker", effectiveSpark: 6, slot: "F0" })];
    model.opponentHandCount = 0;

    const emResult = scoreAgainstOpponent(model, "expectiminimax", 8, 77);
    const wcResult = scoreAgainstOpponent(model, "worstCase", 8, 77);
    expect(Number.isFinite(emResult)).toBe(true);
    expect(Number.isFinite(wcResult)).toBe(true);
  });

  it("ignores deployed cards that cannot challenge this turn", () => {
    const exhausted = modelWithChallengers();
    for (const slot of ["F0", "F1", "F2"] as const) {
      const card = exhausted.aiFrontRank[slot];
      if (card !== null) {
        card.canChallengeThisTurn = false;
      }
    }
    const active = modelWithChallengers();

    // With no opponent bodies, active challengers score; exhausted ones do not,
    // so the active board should evaluate strictly higher.
    const exhaustedScore = scoreAgainstOpponent(exhausted, "expectiminimax", 8, 3);
    const activeScore = scoreAgainstOpponent(active, "expectiminimax", 8, 3);
    expect(activeScore).toBeGreaterThan(exhaustedScore);
  });
});

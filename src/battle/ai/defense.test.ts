import { describe, expect, it } from "vitest";
import { planDefense, planDefenseWithDecision } from "./defense";
import type { AiCard, AiOpponentBody, ForwardModel } from "./forward-model";
import { emptyFrontRankSlots, emptyBackRankSlots } from "../test-support";

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
    aiFrontRank: emptyFrontRankSlots(),
    aiBackRank: emptyBackRankSlots(),
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
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: "blocker", basePrintedSpark: 5 }),
      },
      opponentBodies: [makeBody({ battleCardId: "back", rank: "back", slot: "B0" })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("blocks a challenger in its own lane with a favorable body that survives", () => {
    const model = makeModel({
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: "wolf", basePrintedSpark: 4 }),
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
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: "huge", basePrintedSpark: 9 }),
        B1: makeCard({ battleCardId: "just-enough", basePrintedSpark: 4 }),
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
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: "exhausted", basePrintedSpark: 6, canChallengeThisTurn: false }),
      },
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "F0", effectiveSpark: 3 })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("skips a lane already defended by a deployed body", () => {
    const model = makeModel({
      aiFrontRank: {
        ...emptyFrontRankSlots(),
        F0: makeCard({ battleCardId: "onguard", basePrintedSpark: 2 }),
      },
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: "backRank", basePrintedSpark: 5 }),
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
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: "small", basePrintedSpark: 1 }),
        B1: makeCard({ battleCardId: "medium", basePrintedSpark: 2 }),
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
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: "precious", basePrintedSpark: 5 }),
      },
      // Challenger outsparks the only blocker, and the hit is far from lethal.
      opponentBodies: [makeBody({ battleCardId: "atk", slot: "F0", effectiveSpark: 8 })],
    });
    expect(planDefense(model, OPTS)).toHaveLength(0);
  });

  it("chump-blocks aggregate lethal even when no single challenger is lethal", () => {
    const blockerId = "5cfe3a4a-05d8-4be9-9ab3-0ad31e6dc24b";
    const largerChallengerId = "7d6825de-1923-4dd5-adbb-01910c347fec";
    const smallerChallengerId = "55f731c8-95f9-4505-868d-f93aeed9a3cf";
    const model = makeModel({
      aiScore: 9,
      playerScore: 6,
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: blockerId, basePrintedSpark: 1 }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: largerChallengerId,
          slot: "F0",
          effectiveSpark: 3,
        }),
        makeBody({
          battleCardId: smallerChallengerId,
          slot: "F1",
          effectiveSpark: 2,
        }),
      ],
    });

    const plan = planDefenseWithDecision(model, { scoreToWin: 10 });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      kind: "MOVE_CARD",
      self: { battleCardId: blockerId },
      toSlot: "F0",
    });
    expect(plan.decision).toMatchObject({
      opponentScore: 6,
      scoreToWin: 10,
      incomingScoreBeforeBlocks: 5,
      incomingScoreAfterBlocks: 2,
      lethalBeforeBlocks: true,
      lethalPreventable: true,
      availableBlockerBattleCardIds: [blockerId],
      lanes: [
        {
          challengerBattleCardId: largerChallengerId,
          lane: "F0",
          outcome: "blocked",
          reason: "prevent-lethal",
          blockerBattleCardId: blockerId,
        },
        {
          challengerBattleCardId: smallerChallengerId,
          lane: "F1",
          outcome: "declined",
          reason: "no-available-blocker",
          blockerBattleCardId: null,
        },
      ],
    });
  });

  it("assigns the strongest blockers to the biggest threats first", () => {
    const model = makeModel({
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({ battleCardId: "b3", basePrintedSpark: 3 }),
        B1: makeCard({ battleCardId: "b5", basePrintedSpark: 5 }),
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

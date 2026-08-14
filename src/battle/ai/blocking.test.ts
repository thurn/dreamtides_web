import { describe, expect, it } from "vitest";
import { planBlocking, planBlockingWithDecision } from "./blocking";
import type { AiCard, AiOpponentBody, ForwardModel } from "./forward-model";
import { emptyFrontRankSlots, emptyBackRankSlots } from "../test-support";
import { asBattleCardId } from "../../types/identifiers";

function makeCard(
  overrides: Partial<AiCard> & Pick<AiCard, "battleCardId">,
): AiCard {
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

function makeBody(
  overrides: Partial<AiOpponentBody> & Pick<AiOpponentBody, "battleCardId">,
): AiOpponentBody {
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

describe("planBlocking", () => {
  it("returns no moves when the opponent has no front-rank challengers", () => {
    const model = makeModel({
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({
          battleCardId: asBattleCardId("blocker"),
          basePrintedSpark: 5,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("back"),
          rank: "back",
          slot: "B0",
        }),
      ],
    });
    expect(planBlocking(model, OPTS)).toHaveLength(0);
  });

  it("blocks a challenger in its own lane with a favorable body that survives", () => {
    const model = makeModel({
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({
          battleCardId: asBattleCardId("wolf"),
          basePrintedSpark: 4,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("challenger"),
          slot: "F2",
          effectiveSpark: 3,
        }),
      ],
    });

    const moves = planBlocking(model, OPTS);
    expect(moves).toHaveLength(1);
    expect(moves[0].kind).toBe("MOVE_CARD");
    expect(moves[0].self?.battleCardId).toBe("wolf");
    // The blocker goes into the lane directly opposite the challenger.
    expect(moves[0].toSlot).toBe("F2");
  });

  it("prefers the smallest body that still beats the challenger", () => {
    const model = makeModel({
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({
          battleCardId: asBattleCardId("huge"),
          basePrintedSpark: 9,
        }),
        B1: makeCard({
          battleCardId: asBattleCardId("just-enough"),
          basePrintedSpark: 4,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("challenger"),
          slot: "F0",
          effectiveSpark: 3,
        }),
      ],
    });

    const moves = planBlocking(model, OPTS);
    expect(moves).toHaveLength(1);
    expect(moves[0].self?.battleCardId).toBe("just-enough");
  });

  it("does not move a still-exhausted reserve body up to block", () => {
    const model = makeModel({
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({
          battleCardId: asBattleCardId("exhausted"),
          basePrintedSpark: 6,
          canChallengeThisTurn: false,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("challenger"),
          slot: "F0",
          effectiveSpark: 3,
        }),
      ],
    });
    expect(planBlocking(model, OPTS)).toHaveLength(0);
  });

  it("skips a lane already blocked by a deployed body", () => {
    const model = makeModel({
      aiFrontRank: {
        ...emptyFrontRankSlots(),
        F0: makeCard({
          battleCardId: asBattleCardId("onguard"),
          basePrintedSpark: 2,
        }),
      },
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({
          battleCardId: asBattleCardId("backRank"),
          basePrintedSpark: 5,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("challenger"),
          slot: "F0",
          effectiveSpark: 3,
        }),
      ],
    });
    expect(planBlocking(model, OPTS)).toHaveLength(0);
  });

  it("counts only a blocker's spark as prevented score", () => {
    const model = makeModel({
      aiScore: 0,
      playerScore: 3,
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({
          battleCardId: asBattleCardId("2-spark-blocker"),
          basePrintedSpark: 2,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("8-spark-challenger"),
          effectiveSpark: 8,
        }),
      ],
    });

    expect(
      planBlockingWithDecision(model, { scoreToWin: 10 }).decision,
    ).toMatchObject({
      incomingScoreBeforeBlocks: 8,
      incomingScoreAfterBlocks: 6,
      lethalBeforeBlocks: true,
      lethalPreventable: true,
    });
  });

  it("chump-blocks with the smallest body when behind and unable to win the trade", () => {
    const model = makeModel({
      aiScore: 0,
      playerScore: 5,
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({
          battleCardId: asBattleCardId("small"),
          basePrintedSpark: 1,
        }),
        B1: makeCard({
          battleCardId: asBattleCardId("medium"),
          basePrintedSpark: 2,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("challenger"),
          slot: "F1",
          effectiveSpark: 6,
        }),
      ],
    });

    const moves = planBlocking(model, OPTS);
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
        B0: makeCard({
          battleCardId: asBattleCardId("precious"),
          basePrintedSpark: 5,
        }),
      },
      // Challenger outsparks the only blocker, and the hit is far from lethal.
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("challenger"),
          slot: "F0",
          effectiveSpark: 8,
        }),
      ],
    });
    expect(planBlocking(model, OPTS)).toHaveLength(0);
  });

  it("chump-blocks aggregate lethal even when no single challenger is lethal", () => {
    const blockerId = "5cfe3a4a-05d8-4be9-9ab3-0ad31e6dc24b";
    const largerChallengerId = "7d6825de-1923-4dd5-adbb-01910c347fec";
    const smallerChallengerId = "55f731c8-95f9-4505-868d-f93aeed9a3cf";
    const model = makeModel({
      aiScore: 9,
      playerScore: 5,
      aiBackRank: {
        ...emptyBackRankSlots(),
        B0: makeCard({
          battleCardId: asBattleCardId(blockerId),
          basePrintedSpark: 1,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId(largerChallengerId),
          slot: "F0",
          effectiveSpark: 3,
        }),
        makeBody({
          battleCardId: asBattleCardId(smallerChallengerId),
          slot: "F1",
          effectiveSpark: 2,
        }),
      ],
    });

    const plan = planBlockingWithDecision(model, { scoreToWin: 10 });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      kind: "MOVE_CARD",
      self: { battleCardId: asBattleCardId(blockerId) },
      toSlot: "F0",
    });
    expect(plan.decision).toMatchObject({
      opponentScore: 5,
      scoreToWin: 10,
      incomingScoreBeforeBlocks: 5,
      incomingScoreAfterBlocks: 4,
      lethalBeforeBlocks: true,
      lethalPreventable: true,
      availableBlockerBattleCardIds: [blockerId],
      lanes: [
        {
          challengerBattleCardId: asBattleCardId(largerChallengerId),
          lane: "F0",
          outcome: "blocked",
          reason: "prevent-lethal",
          blockerBattleCardId: asBattleCardId(blockerId),
        },
        {
          challengerBattleCardId: asBattleCardId(smallerChallengerId),
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
        B0: makeCard({
          battleCardId: asBattleCardId("b3"),
          basePrintedSpark: 3,
        }),
        B1: makeCard({
          battleCardId: asBattleCardId("b5"),
          basePrintedSpark: 5,
        }),
      },
      opponentBodies: [
        makeBody({
          battleCardId: asBattleCardId("small"),
          slot: "F0",
          effectiveSpark: 2,
        }),
        makeBody({
          battleCardId: asBattleCardId("big"),
          slot: "F1",
          effectiveSpark: 4,
        }),
      ],
    });

    const moves = planBlocking(model, OPTS);
    expect(moves).toHaveLength(2);
    const byLane = new Map(moves.map((m) => [m.toSlot, m.self?.battleCardId]));
    // Big threat (4✦ in F1) gets the body that can beat it; the small threat
    // takes the smaller favorable blocker.
    expect(byLane.get("F1")).toBe("b5");
    expect(byLane.get("F0")).toBe("b3");
  });
});

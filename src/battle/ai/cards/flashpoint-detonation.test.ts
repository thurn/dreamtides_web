import { describe, expect, it } from "vitest";
import { testCardName } from "../../../types/test-identities";
import { flashpointDetonation } from "./flashpoint-detonation";
import type { AiCard, AiOpponentBody, ForwardModel } from "../forward-model";
import { emptyFrontRankSlots, emptyBackRankSlots } from "../../test-support";
import { parseBattleCardId } from "../../../types/identifiers";

function makeCard(
  overrides: Partial<AiCard> & Pick<AiCard, "battleCardId" | "cardNumber">,
): AiCard {
  return {
    name: testCardName("card"),
    energyCost: 0,
    basePrintedSpark: 0,
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
    rank: "back",
    slot: "B0",
    isFigment: false,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ForwardModel> = {}): ForwardModel {
  return {
    aiEnergy: 5,
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

describe("Flashpoint Detonation (#516)", () => {
  it("canPlay is false with no opponent bodies", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("blast"),
      cardNumber: 516,
      energyCost: 2,
    });
    expect(
      flashpointDetonation.canPlay(makeModel({ opponentBodies: [] }), self),
    ).toBe(false);
  });

  it("canPlay is false without enough energy", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("blast"),
      cardNumber: 516,
      energyCost: 2,
    });
    const model = makeModel({
      aiEnergy: 1,
      opponentBodies: [
        makeBody({ battleCardId: parseBattleCardId("x"), effectiveSpark: 3 }),
      ],
    });
    expect(flashpointDetonation.canPlay(model, self)).toBe(false);
  });

  it("chooseTargets prefers a front-rank body when one exists", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("blast"),
      cardNumber: 516,
      energyCost: 2,
    });
    const model = makeModel({
      opponentBodies: [
        makeBody({
          battleCardId: parseBattleCardId("bigBack"),
          rank: "back",
          slot: "B1",
          effectiveSpark: 9,
        }),
        makeBody({
          battleCardId: parseBattleCardId("front"),
          rank: "front",
          slot: "F0",
          effectiveSpark: 2,
        }),
      ],
    });
    expect(
      flashpointDetonation.chooseTargets(model, self)?.targetBattleCardId,
    ).toBe("front");
  });

  it("chooseTargets picks the highest-spark body when none are front rank", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("blast"),
      cardNumber: 516,
      energyCost: 2,
    });
    const model = makeModel({
      opponentBodies: [
        makeBody({
          battleCardId: parseBattleCardId("small"),
          rank: "back",
          slot: "B0",
          effectiveSpark: 2,
        }),
        makeBody({
          battleCardId: parseBattleCardId("big"),
          rank: "back",
          slot: "B1",
          effectiveSpark: 7,
        }),
      ],
    });
    expect(
      flashpointDetonation.chooseTargets(model, self)?.targetBattleCardId,
    ).toBe("big");
  });

  it("canPlay is false when every enemy body costs more than 2", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("blast"),
      cardNumber: 516,
      energyCost: 2,
    });
    const model = makeModel({
      opponentBodies: [
        makeBody({
          battleCardId: parseBattleCardId("colossus"),
          rank: "front",
          slot: "F0",
          effectiveSpark: 6,
          energyCost: 6,
        }),
      ],
    });
    expect(flashpointDetonation.canPlay(model, self)).toBe(false);
  });

  it("chooseTargets skips a body that costs more than 2", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("blast"),
      cardNumber: 516,
      energyCost: 2,
    });
    const model = makeModel({
      opponentBodies: [
        // Biggest threat, but too expensive to dissolve — must be ignored.
        makeBody({
          battleCardId: parseBattleCardId("colossus"),
          rank: "front",
          slot: "F0",
          effectiveSpark: 9,
          energyCost: 6,
        }),
        makeBody({
          battleCardId: parseBattleCardId("cheap"),
          rank: "front",
          slot: "F1",
          effectiveSpark: 2,
          energyCost: 2,
        }),
      ],
    });
    expect(
      flashpointDetonation.chooseTargets(model, self)?.targetBattleCardId,
    ).toBe("cheap");
  });

  it("chooseTargets returns null when no body is cheap enough", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("blast"),
      cardNumber: 516,
      energyCost: 2,
    });
    const model = makeModel({
      opponentBodies: [
        makeBody({
          battleCardId: parseBattleCardId("colossus"),
          rank: "front",
          slot: "F0",
          effectiveSpark: 6,
          energyCost: 6,
        }),
      ],
    });
    expect(flashpointDetonation.chooseTargets(model, self)).toBeNull();
  });

  it("play removes exactly the targeted body and bumps opponentVoidCount", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("blast"),
      cardNumber: 516,
      energyCost: 2,
    });
    const target = makeBody({
      battleCardId: parseBattleCardId("front"),
      rank: "front",
      slot: "F0",
      effectiveSpark: 2,
    });
    const other = makeBody({
      battleCardId: parseBattleCardId("keep"),
      rank: "back",
      slot: "B0",
      effectiveSpark: 5,
    });
    const model = makeModel({
      aiEnergy: 5,
      aiHand: [self],
      opponentBodies: [target, other],
      opponentVoidCount: 0,
    });

    flashpointDetonation.play(model, self, {
      targetBattleCardId: parseBattleCardId("front"),
    });

    expect(model.aiEnergy).toBe(3);
    expect(model.opponentBodies.map((b) => b.battleCardId)).toEqual(["keep"]);
    expect(model.opponentVoidCount).toBe(1);
    expect(model.aiHand).toHaveLength(0);
    expect(model.aiVoid.map((c) => c.battleCardId)).toEqual(["blast"]);
  });
});

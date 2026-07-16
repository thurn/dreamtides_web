import { describe, expect, it } from "vitest";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../../test-support";
import type { AiCard, ForwardModel } from "../forward-model";
import { ringwatcher } from "./ringwatcher";

function makeCard(): AiCard {
  return {
    battleCardId: "seer",
    cardNumber: 511,
    name: "card",
    energyCost: 3,
    basePrintedSpark: 1,
    sparkDelta: 0,
    figmentCount: 1,
    canChallengeThisTurn: true,
  };
}

function makeModel(self: AiCard): ForwardModel {
  return {
    aiEnergy: 5,
    aiMaxEnergy: 5,
    aiScore: 0,
    playerScore: 0,
    aiHand: [self],
    aiDeck: [],
    aiVoid: [],
    aiFrontRank: emptyFrontRankSlots(),
    aiBackRank: emptyBackRankSlots(),
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
  };
}

describe("starter character #511", () => {
  it("plays the character into the back rank without resolving its rules text", () => {
    const self = makeCard();
    const model = makeModel(self);
    ringwatcher.play(model, self, null);
    expect(model.aiEnergy).toBe(2);
    expect(model.aiBackRank.B0?.battleCardId).toBe("seer");
    expect(model.aiBackRank.B0?.canChallengeThisTurn).toBe(false);
  });
});

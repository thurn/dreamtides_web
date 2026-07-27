import { describe, expect, it } from "vitest";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../../test-support";
import type { AiCard, ForwardModel } from "../forward-model";
import { runeboundChampion } from "./runebound-champion";

describe("starter character #513", () => {
  it("plays the character into the back rank without resolving its rules text", () => {
    const self: AiCard = {
      battleCardId: "champ",
      cardNumber: 513,
      name: "card",
      energyCost: 5,
      basePrintedSpark: 3,
      sparkDelta: 0,
      figmentCount: 1,
      canChallengeThisTurn: true,
    };
    const model: ForwardModel = {
      aiEnergy: 6,
      aiMaxEnergy: 6,
      aiScore: 4,
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
    runeboundChampion.play(model, self, null);
    expect(model.aiEnergy).toBe(1);
    expect(model.aiScore).toBe(4);
    expect(model.aiBackRank.B4?.battleCardId).toBe("champ");
  });
});

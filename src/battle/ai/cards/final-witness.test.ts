import { describe, expect, it } from "vitest";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../../test-support";
import type { AiCard, ForwardModel } from "../forward-model";
import { finalWitness } from "./final-witness";

describe("starter character #514", () => {
  it("plays the character into the back rank without resolving its rules text", () => {
    const self: AiCard = {
      battleCardId: "witness",
      cardNumber: 514,
      name: "card",
      energyCost: 3,
      basePrintedSpark: 2,
      sparkDelta: 0,
      figmentCount: 1,
      canChallengeThisTurn: true,
    };
    const deckCard = { ...self, battleCardId: "deck-card" };
    const model: ForwardModel = {
      aiEnergy: 5,
      aiMaxEnergy: 5,
      aiScore: 0,
      playerScore: 0,
      aiHand: [self],
      aiDeck: [deckCard],
      aiVoid: [],
      aiFrontRank: emptyFrontRankSlots(),
      aiBackRank: emptyBackRankSlots(),
      opponentBodies: [],
      opponentHandCount: 0,
      opponentVoidCount: 0,
    };
    finalWitness.play(model, self, null);
    expect(model.aiEnergy).toBe(2);
    expect(model.aiDeck).toEqual([deckCard]);
    expect(model.aiBackRank.B0?.battleCardId).toBe("witness");
  });
});

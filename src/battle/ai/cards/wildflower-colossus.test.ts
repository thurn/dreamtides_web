import { describe, expect, it } from "vitest";
import { testCardName } from "../../../types/test-identities";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../../test-support";
import type { AiCard, ForwardModel } from "../forward-model";
import { wildflowerColossus } from "./wildflower-colossus";
import { parseBattleCardId } from "../../../types/identifiers";

describe("starter character #515", () => {
  it("plays the character into the back rank without resolving its rules text", () => {
    const self: AiCard = {
      battleCardId: parseBattleCardId("colossus"),
      cardNumber: 515,
      name: testCardName("card"),
      energyCost: 6,
      basePrintedSpark: 6,
      sparkDelta: 0,
      figmentCount: 1,
      canChallengeThisTurn: true,
    };
    const model: ForwardModel = {
      aiEnergy: 6,
      aiMaxEnergy: 6,
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
    wildflowerColossus.play(model, self, null);
    expect(model.aiEnergy).toBe(0);
    expect(model.aiBackRank.B4?.battleCardId).toBe("colossus");
  });
});

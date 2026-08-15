import { describe, expect, it } from "vitest";
import { testCardName } from "../../../types/test-identities";
import { markedDirewolf } from "./marked-direwolf";
import type { AiCard, ForwardModel } from "../forward-model";
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

describe("Marked Direwolf (#512)", () => {
  it("does not provide Support", () => {
    expect("supportSpark" in markedDirewolf).toBe(false);
  });

  it("play pays energy and occupies a reserve slot, exhausted", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("wolf"),
      cardNumber: 512,
      energyCost: 4,
    });
    const model = makeModel({ aiEnergy: 6, aiHand: [self] });
    markedDirewolf.play(model, self, null);
    expect(model.aiEnergy).toBe(2);
    expect(model.aiHand).toHaveLength(0);
    expect(model.aiBackRank.B4?.battleCardId).toBe("wolf");
    expect(model.aiBackRank.B4?.canChallengeThisTurn).toBe(false);
  });

  it("canPlay is false without enough energy", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("wolf"),
      cardNumber: 512,
      energyCost: 4,
    });
    expect(markedDirewolf.canPlay(makeModel({ aiEnergy: 3 }), self)).toBe(
      false,
    );
    expect(markedDirewolf.canPlay(makeModel({ aiEnergy: 4 }), self)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { testCardName } from "../../../types/test-identities";
import { glimpseOfWhatWas } from "./glimpse-of-what-was";
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

describe("Glimpse of What Was (#517)", () => {
  it("canPlay requires 1 energy", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("glimpse"),
      cardNumber: 517,
      energyCost: 1,
    });
    expect(glimpseOfWhatWas.canPlay(makeModel({ aiEnergy: 0 }), self)).toBe(
      false,
    );
    expect(glimpseOfWhatWas.canPlay(makeModel({ aiEnergy: 1 }), self)).toBe(
      true,
    );
  });

  it("play draws one card and leaves the deck a permutation of the rest", () => {
    const self = makeCard({
      battleCardId: parseBattleCardId("glimpse"),
      cardNumber: 517,
      energyCost: 1,
    });
    const a = makeCard({
      battleCardId: parseBattleCardId("a"),
      cardNumber: 512,
      energyCost: 4,
    });
    const b = makeCard({
      battleCardId: parseBattleCardId("b"),
      cardNumber: 513,
      energyCost: 5,
    });
    const c = makeCard({
      battleCardId: parseBattleCardId("c"),
      cardNumber: 514,
      energyCost: 3,
    });
    const model = makeModel({ aiEnergy: 2, aiHand: [self], aiDeck: [a, b, c] });

    glimpseOfWhatWas.play(model, self, null);

    // Drew the top card (a); deck holds a permutation of b, c.
    expect(model.aiHand.map((x) => x.battleCardId)).toEqual(["a"]);
    expect(model.aiDeck.map((x) => x.battleCardId).sort()).toEqual(["b", "c"]);
    expect(model.aiEnergy).toBe(1);
    expect(model.aiVoid.map((x) => x.battleCardId)).toEqual(["glimpse"]);
  });
});

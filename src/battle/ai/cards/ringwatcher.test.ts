import { describe, expect, it } from "vitest";
import { ringwatcher } from "./ringwatcher";
import type { AiCard, ForwardModel } from "../forward-model";
import { emptyFrontRankSlots, emptyBackRankSlots } from "../../test-support";

function makeCard(overrides: Partial<AiCard> & Pick<AiCard, "battleCardId" | "cardNumber">): AiCard {
  return {
    name: "card",
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

describe("Ringwatcher (#511)", () => {
  it("onMaterialized keeps an affordable top card on top", () => {
    const self = makeCard({ battleCardId: "seer", cardNumber: 511 });
    const top = makeCard({ battleCardId: "a", cardNumber: 512, energyCost: 4 });
    const next = makeCard({ battleCardId: "b", cardNumber: 513, energyCost: 5 });
    const model = makeModel({ aiMaxEnergy: 5, aiDeck: [top, next] });

    ringwatcher.onMaterialized?.(model, self);

    expect(model.aiDeck.map((c) => c.battleCardId)).toEqual(["a", "b"]);
  });

  it("onMaterialized bins an unaffordable top card to the bottom", () => {
    const self = makeCard({ battleCardId: "seer", cardNumber: 511 });
    // top costs 9, maxEnergy 5 -> 9 > 5 + 1 -> binned.
    const top = makeCard({ battleCardId: "a", cardNumber: 515, energyCost: 9 });
    const next = makeCard({ battleCardId: "b", cardNumber: 512, energyCost: 4 });
    const model = makeModel({ aiMaxEnergy: 5, aiDeck: [top, next] });

    ringwatcher.onMaterialized?.(model, self);

    // Deck is a permutation; the unaffordable card moved to the bottom.
    expect(model.aiDeck.map((c) => c.battleCardId).sort()).toEqual(["a", "b"]);
    expect(model.aiDeck.map((c) => c.battleCardId)).toEqual(["b", "a"]);
  });

  it("play materializes the character into reserve, exhausted", () => {
    const self = makeCard({ battleCardId: "seer", cardNumber: 511, energyCost: 3 });
    const model = makeModel({ aiEnergy: 5, aiHand: [self] });
    ringwatcher.play(model, self, null);
    expect(model.aiEnergy).toBe(2);
    expect(model.aiBackRank.B0?.battleCardId).toBe("seer");
    expect(model.aiBackRank.B0?.canChallengeThisTurn).toBe(false);
  });
});

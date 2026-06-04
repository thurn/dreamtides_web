import { describe, expect, it } from "vitest";
import { circlewatchSeer } from "./circlewatch-seer";
import type { AiCard, ForwardModel } from "../forward-model";

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
    aiDeployed: { D0: null, D1: null, D2: null, D3: null },
    aiReserve: { R0: null, R1: null, R2: null, R3: null, R4: null },
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

describe("Circlewatch Seer (#511)", () => {
  it("onMaterialized keeps an affordable top card on top", () => {
    const self = makeCard({ battleCardId: "seer", cardNumber: 511 });
    const top = makeCard({ battleCardId: "a", cardNumber: 512, energyCost: 4 });
    const next = makeCard({ battleCardId: "b", cardNumber: 513, energyCost: 5 });
    const model = makeModel({ aiMaxEnergy: 5, aiDeck: [top, next] });

    circlewatchSeer.onMaterialized?.(model, self);

    expect(model.aiDeck.map((c) => c.battleCardId)).toEqual(["a", "b"]);
  });

  it("onMaterialized bins an unaffordable top card to the bottom", () => {
    const self = makeCard({ battleCardId: "seer", cardNumber: 511 });
    // top costs 9, maxEnergy 5 -> 9 > 5 + 1 -> binned.
    const top = makeCard({ battleCardId: "a", cardNumber: 515, energyCost: 9 });
    const next = makeCard({ battleCardId: "b", cardNumber: 512, energyCost: 4 });
    const model = makeModel({ aiMaxEnergy: 5, aiDeck: [top, next] });

    circlewatchSeer.onMaterialized?.(model, self);

    // Deck is a permutation; the unaffordable card moved to the bottom.
    expect(model.aiDeck.map((c) => c.battleCardId).sort()).toEqual(["a", "b"]);
    expect(model.aiDeck.map((c) => c.battleCardId)).toEqual(["b", "a"]);
  });

  it("play materializes the character into reserve, exhausted", () => {
    const self = makeCard({ battleCardId: "seer", cardNumber: 511, energyCost: 3 });
    const model = makeModel({ aiEnergy: 5, aiHand: [self] });
    circlewatchSeer.play(model, self, null);
    expect(model.aiEnergy).toBe(2);
    expect(model.aiReserve.R0?.battleCardId).toBe("seer");
    expect(model.aiReserve.R0?.canChallengeThisTurn).toBe(false);
  });
});

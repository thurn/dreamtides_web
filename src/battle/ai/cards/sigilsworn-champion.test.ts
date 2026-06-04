import { describe, expect, it } from "vitest";
import { sigilswornChampion } from "./sigilsworn-champion";
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

describe("Sigilsworn Champion (#513)", () => {
  it("onDawn increases aiScore by 1", () => {
    const self = makeCard({ battleCardId: "champ", cardNumber: 513 });
    const model = makeModel({ aiScore: 4 });
    sigilswornChampion.onDawn?.(model, self);
    expect(model.aiScore).toBe(5);
  });

  it("play materializes the character into reserve, exhausted", () => {
    const self = makeCard({ battleCardId: "champ", cardNumber: 513, energyCost: 5 });
    const model = makeModel({ aiEnergy: 6, aiHand: [self] });
    sigilswornChampion.play(model, self, null);
    expect(model.aiEnergy).toBe(1);
    expect(model.aiReserve.R0?.battleCardId).toBe("champ");
    expect(model.aiReserve.R0?.canChallengeThisTurn).toBe(false);
  });
});

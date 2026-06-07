import { describe, expect, it } from "vitest";
import { signOfArrival } from "./sign-of-arrival";
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
    aiDeployed: { F0: null, F1: null, F2: null, F3: null },
    aiReserve: { B0: null, B1: null, B2: null, B3: null, B4: null },
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

describe("Sign of Arrival (#518)", () => {
  it("canPlay requires 2 energy", () => {
    const self = makeCard({ battleCardId: "herald", cardNumber: 518, energyCost: 2 });
    expect(signOfArrival.canPlay(makeModel({ aiEnergy: 1 }), self)).toBe(false);
    expect(signOfArrival.canPlay(makeModel({ aiEnergy: 2 }), self)).toBe(true);
  });

  it("play adds one character AiCard to hand and voids the event", () => {
    const self = makeCard({ battleCardId: "herald", cardNumber: 518, energyCost: 2 });
    const model = makeModel({ aiEnergy: 3, aiHand: [self] });

    signOfArrival.play(model, self, null);

    expect(model.aiHand).toHaveLength(1);
    const discovered = model.aiHand[0];
    // A real Starter character cardNumber (510-515) with a synthetic id.
    expect(discovered.cardNumber).toBeGreaterThanOrEqual(510);
    expect(discovered.cardNumber).toBeLessThanOrEqual(515);
    expect(discovered.battleCardId).toMatch(/^discovered:/);
    expect(model.aiEnergy).toBe(1);
    expect(model.aiVoid.map((c) => c.battleCardId)).toEqual(["herald"]);
  });

  it("valueHint is a small positive card-advantage bonus", () => {
    const self = makeCard({ battleCardId: "herald", cardNumber: 518 });
    const hint = signOfArrival.valueHint?.(makeModel(), self) ?? 0;
    expect(hint).toBeGreaterThan(0);
  });
});

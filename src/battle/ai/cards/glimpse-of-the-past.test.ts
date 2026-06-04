import { describe, expect, it } from "vitest";
import { glimpseOfThePast } from "./glimpse-of-the-past";
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

describe("Glimpse of the Past (#517)", () => {
  it("canPlay requires 1 energy", () => {
    const self = makeCard({ battleCardId: "glimpse", cardNumber: 517, energyCost: 1 });
    expect(glimpseOfThePast.canPlay(makeModel({ aiEnergy: 0 }), self)).toBe(false);
    expect(glimpseOfThePast.canPlay(makeModel({ aiEnergy: 1 }), self)).toBe(true);
  });

  it("play draws one card and leaves the deck a permutation of the rest", () => {
    const self = makeCard({ battleCardId: "glimpse", cardNumber: 517, energyCost: 1 });
    const a = makeCard({ battleCardId: "a", cardNumber: 512, energyCost: 4 });
    const b = makeCard({ battleCardId: "b", cardNumber: 513, energyCost: 5 });
    const c = makeCard({ battleCardId: "c", cardNumber: 514, energyCost: 3 });
    const model = makeModel({ aiEnergy: 2, aiHand: [self], aiDeck: [a, b, c] });

    glimpseOfThePast.play(model, self, null);

    // Drew the top card (a); deck holds a permutation of b, c.
    expect(model.aiHand.map((x) => x.battleCardId)).toEqual(["a"]);
    expect(model.aiDeck.map((x) => x.battleCardId).sort()).toEqual(["b", "c"]);
    expect(model.aiEnergy).toBe(1);
    expect(model.aiVoid.map((x) => x.battleCardId)).toEqual(["glimpse"]);
  });
});

import { describe, expect, it } from "vitest";
import { finalWitness } from "./final-witness";
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

describe("Final Witness (#514)", () => {
  it("onDissolved moves the top deck card into hand (hand +1, deck -1)", () => {
    const self = makeCard({ battleCardId: "witness", cardNumber: 514 });
    const top = makeCard({ battleCardId: "top", cardNumber: 512 });
    const rest = makeCard({ battleCardId: "rest", cardNumber: 513 });
    const model = makeModel({ aiDeck: [top, rest], aiHand: [] });

    finalWitness.onDissolved?.(model, self);

    expect(model.aiHand.map((c) => c.battleCardId)).toEqual(["top"]);
    expect(model.aiDeck.map((c) => c.battleCardId)).toEqual(["rest"]);
  });

  it("play materializes the character into reserve, exhausted", () => {
    const self = makeCard({ battleCardId: "witness", cardNumber: 514, energyCost: 3 });
    const model = makeModel({ aiEnergy: 5, aiHand: [self] });
    finalWitness.play(model, self, null);
    expect(model.aiEnergy).toBe(2);
    expect(model.aiReserve.R0?.battleCardId).toBe("witness");
    expect(model.aiReserve.R0?.canChallengeThisTurn).toBe(false);
  });
});

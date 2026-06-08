import { describe, expect, it } from "vitest";
import { wildflowerColossus } from "./wildflower-colossus";
import { buildSupportContribution } from "./support-contribution";
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
    aiEnergy: 6,
    aiMaxEnergy: 6,
    aiScore: 0,
    playerScore: 0,
    aiHand: [],
    aiDeck: [],
    aiVoid: [],
    aiFrontRank: { F0: null, F1: null, F2: null, F3: null },
    aiBackRank: { B0: null, B1: null, B2: null, B3: null, B4: null },
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

describe("Wildflower Colossus (#515)", () => {
  it("selfStaticSpark returns 0 when not deployed", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515 });
    // Sitting in reserve, not deployed.
    const model = makeModel({
      aiBackRank: { B0: self, B1: null, B2: null, B3: null, B4: null },
    });
    expect(wildflowerColossus.selfStaticSpark?.(model, self)).toBe(0);
  });

  it("selfStaticSpark returns 0 when deployed with no supporters", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515 });
    const model = makeModel({
      aiFrontRank: { F1: self, F0: null, F2: null, F3: null },
    });
    expect(wildflowerColossus.selfStaticSpark?.(model, self)).toBe(0);
  });

  it("selfStaticSpark returns 2 per occupied supporting reserve slot", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515 });
    const supA = makeCard({ battleCardId: "a", cardNumber: 512 });
    const supB = makeCard({ battleCardId: "b", cardNumber: 512 });
    // F1 is supported by B1 and B2; fill both.
    const model = makeModel({
      aiFrontRank: { F0: null, F1: self, F2: null, F3: null },
      aiBackRank: { B0: null, B1: supA, B2: supB, B3: null, B4: null },
    });
    expect(wildflowerColossus.selfStaticSpark?.(model, self)).toBe(4);
  });

  it("buildSupportContribution credits the Colossus its self-static", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515 });
    const supA = makeCard({ battleCardId: "a", cardNumber: 512 });
    const model = makeModel({
      aiFrontRank: { F0: self, F1: null, F2: null, F3: null },
      aiBackRank: { B0: supA, B1: null, B2: null, B3: null, B4: null },
    });
    // F0 supported by B0 and B1; only B0 occupied -> +2 to the Colossus.
    expect(buildSupportContribution(model).get("colossus")).toBe(2);
  });

  it("play materializes the character into reserve, exhausted", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515, energyCost: 6 });
    const model = makeModel({ aiEnergy: 6, aiHand: [self] });
    wildflowerColossus.play(model, self, null);
    expect(model.aiEnergy).toBe(0);
    expect(model.aiBackRank.B0?.battleCardId).toBe("colossus");
    expect(model.aiBackRank.B0?.canChallengeThisTurn).toBe(false);
  });
});

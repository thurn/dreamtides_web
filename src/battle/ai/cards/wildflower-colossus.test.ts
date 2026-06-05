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
    aiDeployed: { D0: null, D1: null, D2: null, D3: null },
    aiReserve: { R0: null, R1: null, R2: null, R3: null, R4: null },
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
      aiReserve: { R0: self, R1: null, R2: null, R3: null, R4: null },
    });
    expect(wildflowerColossus.selfStaticSpark?.(model, self)).toBe(0);
  });

  it("selfStaticSpark returns 0 when deployed with no supporters", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515 });
    const model = makeModel({
      aiDeployed: { D1: self, D0: null, D2: null, D3: null },
    });
    expect(wildflowerColossus.selfStaticSpark?.(model, self)).toBe(0);
  });

  it("selfStaticSpark returns 2 per occupied supporting reserve slot", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515 });
    const supA = makeCard({ battleCardId: "a", cardNumber: 512 });
    const supB = makeCard({ battleCardId: "b", cardNumber: 512 });
    // D1 is supported by R1 and R2; fill both.
    const model = makeModel({
      aiDeployed: { D0: null, D1: self, D2: null, D3: null },
      aiReserve: { R0: null, R1: supA, R2: supB, R3: null, R4: null },
    });
    expect(wildflowerColossus.selfStaticSpark?.(model, self)).toBe(4);
  });

  it("buildSupportContribution credits the Colossus its self-static", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515 });
    const supA = makeCard({ battleCardId: "a", cardNumber: 512 });
    const model = makeModel({
      aiDeployed: { D0: self, D1: null, D2: null, D3: null },
      aiReserve: { R0: supA, R1: null, R2: null, R3: null, R4: null },
    });
    // D0 supported by R0 and R1; only R0 occupied -> +2 to the Colossus.
    expect(buildSupportContribution(model).get("colossus")).toBe(2);
  });

  it("play materializes the character into reserve, exhausted", () => {
    const self = makeCard({ battleCardId: "colossus", cardNumber: 515, energyCost: 6 });
    const model = makeModel({ aiEnergy: 6, aiHand: [self] });
    wildflowerColossus.play(model, self, null);
    expect(model.aiEnergy).toBe(0);
    expect(model.aiReserve.R0?.battleCardId).toBe("colossus");
    expect(model.aiReserve.R0?.canChallengeThisTurn).toBe(false);
  });
});

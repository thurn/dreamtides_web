import { describe, expect, it } from "vitest";
import { twilightMinstrel } from "./twilight-minstrel";
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

describe("Twilight Minstrel (#510)", () => {
  it("supportSpark returns 2", () => {
    const self = makeCard({ battleCardId: "minstrel", cardNumber: 510 });
    expect(twilightMinstrel.supportSpark?.(makeModel(), self)).toBe(2);
  });

  it("via buildSupportContribution, a deployed ally in a supported slot gets +2", () => {
    const minstrel = makeCard({ battleCardId: "minstrel", cardNumber: 510 });
    // The receiving ally needs no model of its own; it only collects the bonus.
    const ally = makeCard({ battleCardId: "ally", cardNumber: 512, basePrintedSpark: 4 });
    // R1 supports D0 and D1.
    const model = makeModel({
      aiDeployed: { D0: ally, D1: null, D2: null, D3: null },
      aiReserve: { R0: null, R1: minstrel, R2: null, R3: null, R4: null },
    });
    const contribution = buildSupportContribution(model);
    expect(contribution.get("ally")).toBe(2);
  });

  it("does not buff a deployed ally outside the supported slots", () => {
    const minstrel = makeCard({ battleCardId: "minstrel", cardNumber: 510 });
    const ally = makeCard({ battleCardId: "ally", cardNumber: 512, basePrintedSpark: 4 });
    // R0 supports only D0; an ally in D3 is not covered.
    const model = makeModel({
      aiDeployed: { D0: null, D1: null, D2: null, D3: ally },
      aiReserve: { R0: minstrel, R1: null, R2: null, R3: null, R4: null },
    });
    expect(buildSupportContribution(model).get("ally")).toBeUndefined();
  });

  it("play pays energy and occupies a reserve slot, exhausted", () => {
    const self = makeCard({ battleCardId: "minstrel", cardNumber: 510, energyCost: 2 });
    const model = makeModel({ aiEnergy: 5, aiHand: [self] });
    twilightMinstrel.play(model, self, null);
    expect(model.aiEnergy).toBe(3);
    expect(model.aiHand).toHaveLength(0);
    expect(model.aiReserve.R0?.battleCardId).toBe("minstrel");
    expect(model.aiReserve.R0?.canChallengeThisTurn).toBe(false);
  });
});

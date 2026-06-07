import { describe, expect, it } from "vitest";
import { nocturneStrummer } from "./nocturne-strummer";
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
    aiDeployed: { F0: null, F1: null, F2: null, F3: null },
    aiReserve: { B0: null, B1: null, B2: null, B3: null, B4: null },
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

describe("Nocturne Strummer (#510)", () => {
  it("supportSpark returns 2", () => {
    const self = makeCard({ battleCardId: "minstrel", cardNumber: 510 });
    expect(nocturneStrummer.supportSpark?.(makeModel(), self)).toBe(2);
  });

  it("via buildSupportContribution, a deployed ally in a supported slot gets +2", () => {
    const minstrel = makeCard({ battleCardId: "minstrel", cardNumber: 510 });
    // The receiving ally needs no model of its own; it only collects the bonus.
    const ally = makeCard({ battleCardId: "ally", cardNumber: 512, basePrintedSpark: 4 });
    // B1 supports F0 and F1.
    const model = makeModel({
      aiDeployed: { F0: ally, F1: null, F2: null, F3: null },
      aiReserve: { B0: null, B1: minstrel, B2: null, B3: null, B4: null },
    });
    const contribution = buildSupportContribution(model);
    expect(contribution.get("ally")).toBe(2);
  });

  it("does not buff a deployed ally outside the supported slots", () => {
    const minstrel = makeCard({ battleCardId: "minstrel", cardNumber: 510 });
    const ally = makeCard({ battleCardId: "ally", cardNumber: 512, basePrintedSpark: 4 });
    // B0 supports only F0; an ally in F3 is not covered.
    const model = makeModel({
      aiDeployed: { F0: null, F1: null, F2: null, F3: ally },
      aiReserve: { B0: minstrel, B1: null, B2: null, B3: null, B4: null },
    });
    expect(buildSupportContribution(model).get("ally")).toBeUndefined();
  });

  it("play pays energy and occupies a reserve slot, exhausted", () => {
    const self = makeCard({ battleCardId: "minstrel", cardNumber: 510, energyCost: 2 });
    const model = makeModel({ aiEnergy: 5, aiHand: [self] });
    nocturneStrummer.play(model, self, null);
    expect(model.aiEnergy).toBe(3);
    expect(model.aiHand).toHaveLength(0);
    expect(model.aiReserve.B0?.battleCardId).toBe("minstrel");
    expect(model.aiReserve.B0?.canChallengeThisTurn).toBe(false);
  });
});

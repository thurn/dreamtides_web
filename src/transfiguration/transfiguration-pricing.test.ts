import { describe, expect, it } from "vitest";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import { economyFixture } from "../testing/economy-fixture";
import {
  transfigurationCostBand,
  transfigurationEssenceCost,
} from "./transfiguration-pricing";

const CONFIG = {
  ...economyFixture().transfiguration,
  maximumCost: 140,
  formBands: {
    ...economyFixture().transfiguration.formBands,
    Inspired: { base: 60, jitter: 20, floor: 40 },
  },
};

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Synthetic"), id: asCardId("synthetic-card"), cardNumber: 71,
    cardType: "Character", subtype: "", isStarter: false, energyCost: 4,
    spark: 2, isFast: false, renderedText: "", imageNumber: 71, artOwned: false,
    ...overrides,
  };
}

describe("transfiguration pricing", () => {
  it("uses authored form and stat-delta bands", () => {
    expect(transfigurationCostBand(CONFIG, card(), "Inspired").base).toBe(60);
    expect(transfigurationCostBand(CONFIG, card({ energyCost: 8 }), "Empowered").base).toBe(70);
  });

  it("preserves free special cases", () => {
    expect(transfigurationCostBand(CONFIG, card(), "Hastened")).toEqual(CONFIG.freeBand);
    expect(transfigurationCostBand(CONFIG, card({ spark: 0 }), "Kindled")).toEqual(CONFIG.freeBand);
  });

  it("is deterministic and remains within authored bounds", () => {
    const args = [CONFIG, "seed", "site", "entry", card(), "Inspired"] as const;
    const first = transfigurationEssenceCost(...args);
    expect(transfigurationEssenceCost(...args)).toBe(first);
    expect(first).toBeGreaterThanOrEqual(CONFIG.minimumCost);
    expect(first).toBeLessThanOrEqual(CONFIG.maximumCost);
    expect(first % CONFIG.step).toBe(0);
  });
});

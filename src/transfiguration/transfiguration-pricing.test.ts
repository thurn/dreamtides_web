import { describe, expect, it } from "vitest";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import { transfigurationFixture } from "../testing/transfiguration-fixture";
import {
  transfigurationCostBand,
  transfigurationEssenceCost,
} from "./transfiguration-pricing";

const BASE = transfigurationFixture();
const CONFIG = {
  ...BASE,
  site: {
    ...BASE.site,
    pricing: { ...BASE.site.pricing, maximumCost: 140 },
  },
  forms: BASE.forms.map((form) =>
    form.id === "Inspired"
      ? { ...form, pricing: { kind: "band" as const, base: 60, jitter: 20, floor: 40 } }
      : form,
  ),
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
    expect(transfigurationCostBand(CONFIG, card({ energyCost: 8 }), "Empowered").base).toBe(30);
  });

  it("preserves free special cases", () => {
    expect(transfigurationCostBand(CONFIG, card(), "Hastened").base).toBe(0);
    expect(transfigurationCostBand(CONFIG, card({ spark: 0 }), "Kindled").base).toBe(0);
  });

  it("is deterministic and remains within authored bounds", () => {
    const args = [CONFIG, "seed", "site", "entry", card(), "Inspired"] as const;
    const first = transfigurationEssenceCost(...args);
    expect(transfigurationEssenceCost(...args)).toBe(first);
    expect(first).toBeGreaterThanOrEqual(CONFIG.site.pricing.minimumCost);
    expect(first).toBeLessThanOrEqual(CONFIG.site.pricing.maximumCost);
    expect(first % CONFIG.site.pricing.step).toBe(0);
  });
});

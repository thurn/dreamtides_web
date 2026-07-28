import { describe, expect, it } from "vitest";

import type { CardData } from "../types/cards";
import type { TransfigurationType } from "../types/journey";
import { asCardId, asCardName } from "../types/card-identity";
import {
  MAX_TRANSFIGURATION_COST,
  MIN_TRANSFIGURATION_COST,
  transfigurationCostBand,
  transfigurationEssenceCost,
} from "./transfiguration-pricing";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Card"),
    id: asCardId("test-card"),
    cardNumber: 101,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 4,
    spark: 2,
    isFast: false,
    renderedText: "▸Dawn: Draw a card. 2● gain 1 essence.",
    imageNumber: 101,
    artOwned: false,
    ...overrides,
  };
}

/** Every cost a form can be quoted across many seeds, for range assertions. */
function quotesAcross(
  card: CardData,
  type: TransfigurationType,
  seeds: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < seeds; i += 1) {
    out.push(
      transfigurationEssenceCost(`seed-${String(i)}`, "site-1", "deck-1", card, type),
    );
  }
  return out;
}

describe("transfiguration pricing", () => {
  it("quotes are always a multiple of 10 within [0, 100]", () => {
    const card = makeCard();
    const types: TransfigurationType[] = [
      "Empowered",
      "Amplified",
      "Kindled",
      "Inspired",
      "Enduring",
      "Hastened",
      "Resonant",
      "Attuned",
    ];
    for (const type of types) {
      for (const cost of quotesAcross(card, type, 40)) {
        expect(cost % 10).toBe(0);
        expect(cost).toBeGreaterThanOrEqual(MIN_TRANSFIGURATION_COST);
        expect(cost).toBeLessThanOrEqual(MAX_TRANSFIGURATION_COST);
      }
    }
  });

  it("grants Fast for free", () => {
    const card = makeCard({ cardType: "Event", isFast: false });
    for (const cost of quotesAcross(card, "Hastened", 20)) {
      expect(cost).toBe(0);
    }
  });

  it("kindling a 0-spark character to 1 is free", () => {
    const card = makeCard({ spark: 0 });
    for (const cost of quotesAcross(card, "Kindled", 20)) {
      expect(cost).toBe(0);
    }
  });

  it("scales the energy reduction: a larger cut never costs less on average", () => {
    const small = makeCard({ energyCost: 2 }); // 2 -> 1, delta 1
    const large = makeCard({ energyCost: 8 }); // 8 -> 4, delta 4
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(quotesAcross(large, "Empowered", 60))).toBeGreaterThan(
      avg(quotesAcross(small, "Empowered", 60)),
    );
  });

  it("scales the spark gain: doubling more spark costs more on average", () => {
    const small = makeCard({ spark: 2 }); // +2
    const large = makeCard({ spark: 5 }); // +5
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(quotesAcross(large, "Kindled", 60))).toBeGreaterThan(
      avg(quotesAcross(small, "Kindled", 60)),
    );
  });

  it("quotes Reclaim and a widened trigger from the 20-80 band", () => {
    const card = makeCard({ cardType: "Event" });
    for (const type of ["Enduring", "Resonant"] as const) {
      for (const cost of quotesAcross(card, type, 60)) {
        expect(cost).toBeGreaterThanOrEqual(20);
        expect(cost).toBeLessThanOrEqual(80);
      }
    }
  });

  it("keeps single-step numeric tweaks at a floor of at least 10", () => {
    const card = makeCard();
    for (const type of ["Amplified", "Attuned"] as const) {
      for (const cost of quotesAcross(card, type, 40)) {
        expect(cost).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("is deterministic for the same inputs", () => {
    const card = makeCard();
    const a = transfigurationEssenceCost("seed", "site-1", "deck-1", card, "Empowered");
    const b = transfigurationEssenceCost("seed", "site-1", "deck-1", card, "Empowered");
    expect(a).toBe(b);
  });

  it("bands a delta-1 energy cut below a delta-4 cut", () => {
    expect(transfigurationCostBand(makeCard({ energyCost: 2 }), "Empowered").base)
      .toBeLessThan(
        transfigurationCostBand(makeCard({ energyCost: 8 }), "Empowered").base,
      );
  });
});

import { describe, expect, it, vi } from "vitest";

const FIXTURES = vi.hoisted(() => ({
  fast: { term: "Fast", definition: "Fast definition." },
  interrupt: { term: "Interrupt", definition: "Interrupt definition." },
  exhaustCost: {
    term: "Exhaust Cost",
    definition: "Exhaust cost definition.",
  },
}));

vi.mock("./glossary", () => ({
  lookupGlossaryTerm: (form: string) => {
    switch (form.toLocaleLowerCase()) {
      case "↯":
      case "fast":
        return FIXTURES.fast;
      case "❖❖":
      case "interrupt":
        return FIXTURES.interrupt;
      case "☪":
        return FIXTURES.exhaustCost;
      default:
        return undefined;
    }
  },
}));

import { extractGlossaryTerms } from "./glossary-terms";

describe("extractGlossaryTerms symbol forms", () => {
  it("extracts fast, interrupt, and exhaust-cost glyphs in reading order", () => {
    expect(
      extractGlossaryTerms("↯fast, then ❖❖ – 2●, ☪: Draw a card."),
    ).toEqual([FIXTURES.fast, FIXTURES.interrupt, FIXTURES.exhaustCost]);
  });

  it("does not treat a single activated-ability bolt as an interrupt", () => {
    expect(extractGlossaryTerms("❖ – ☪: Draw a card.")).toEqual([
      FIXTURES.exhaustCost,
    ]);
  });

  it("deduplicates glyph and word forms of the same entry", () => {
    expect(extractGlossaryTerms("↯fast. Fast abilities stay fast.")).toEqual([
      FIXTURES.fast,
    ]);
  });
});

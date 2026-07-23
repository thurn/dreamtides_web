import { describe, expect, it, vi } from "vitest";

const FIXTURES = vi.hoisted(() => ({
  fast: { id: "fast", term: "Fast", definition: "Fast definition." },
  interrupt: {
    id: "interrupt",
    term: "Interrupt",
    definition: "Interrupt definition.",
  },
  exhaustCost: {
    id: "exhaust-cost",
    term: "Exhaust Cost",
    definition: "Exhaust cost definition.",
  },
  night: {
    id: "night-trigger",
    term: "Night",
    definition: "Night definition.",
  },
}));

vi.mock("./glossary", () => ({
  GLOSSARY_IDS: {
    fast: "fast",
    interrupt: "interrupt",
    exhaustCost: "exhaust-cost",
    nightTrigger: "night-trigger",
  },
  glossaryEntry: (id: string) =>
    [
      FIXTURES.fast,
      FIXTURES.interrupt,
      FIXTURES.exhaustCost,
      FIXTURES.night,
    ].find((entry) => entry.id === id),
  lookupGlossaryTerm: () => undefined,
}));

import { extractGlossaryTerms } from "./glossary-terms";

describe("extractGlossaryTerms symbol forms", () => {
  it("extracts one-bolt fast, two-bolt interrupt, and exhaust cost in reading order", () => {
    expect(extractGlossaryTerms("❖ – Draw. ❖❖ – 2●, ☪: Draw again.")).toEqual([
      FIXTURES.fast,
      FIXTURES.interrupt,
      FIXTURES.exhaustCost,
    ]);
  });

  it("treats a single bolt as fast rather than interrupt", () => {
    expect(extractGlossaryTerms("❖ – ☪: Draw a card.")).toEqual([
      FIXTURES.fast,
      FIXTURES.exhaustCost,
    ]);
  });

  it("does not treat the prose word fast as a glossary form", () => {
    expect(extractGlossaryTerms("Fast abilities stay fast.")).toEqual([]);
  });

  it("maps the Night trigger without matching prose uses of night", () => {
    expect(extractGlossaryTerms("At night, wait. ▸Night: Draw.")).toEqual([
      FIXTURES.night,
    ]);
  });
});

import { describe, expect, it, vi } from "vitest";

const FIXTURES = vi.hoisted(() => ({
  fast: { id: "fast", term: "Fast", definition: "Fast definition.", priority: 80 },
  interrupt: {
    id: "interrupt",
    term: "Interrupt",
    definition: "Interrupt definition.",
    priority: 100,
  },
  exhaustCost: {
    id: "exhaust-cost",
    term: "Exhaust Cost",
    definition: "Exhaust cost definition.",
    priority: 90,
  },
  points: {
    id: "points",
    term: "Points",
    definition: "Points definition.",
    priority: 60,
  },
  night: {
    id: "night-trigger",
    term: "Night",
    definition: "Night definition.",
    priority: 10,
  },
}));

vi.mock("./glossary", () => ({
  GLOSSARY: [
    { ...FIXTURES.fast, rulesTextForms: ["❖"] },
    { ...FIXTURES.interrupt, rulesTextForms: ["❖❖"] },
    { ...FIXTURES.exhaustCost, rulesTextForms: ["☪"] },
    { ...FIXTURES.points, rulesTextForms: ["⍟"] },
    { ...FIXTURES.night, rulesTextForms: ["▸Night"] },
  ],
  glossaryRulesTextForms: (entry: { rulesTextForms: string[] }) =>
    entry.rulesTextForms,
  lookupGlossaryTerm: (form: string) =>
    [
      ["❖", FIXTURES.fast],
      ["❖❖", FIXTURES.interrupt],
      ["☪", FIXTURES.exhaustCost],
      ["⍟", FIXTURES.points],
      ["▸night", FIXTURES.night],
    ].find(([key]) => key === form.toLocaleLowerCase())?.[1],
}));

import { extractGlossaryTerms } from "./glossary-terms";

describe("extractGlossaryTerms symbol forms", () => {
  it("extracts one-bolt fast, two-bolt interrupt, and exhaust cost in occurrence order", () => {
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

  it("extracts the points symbol", () => {
    expect(extractGlossaryTerms("Gain 2⍟.")).toEqual([FIXTURES.points]);
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

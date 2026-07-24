import { describe, expect, it } from "vitest";
import type { GlossaryCatalogEntry } from "../../../data/glossary";
import { glossaryDefinitionsCardModel } from "./rules-text-reveal";

function entry(
  id: string,
  term: string,
  presentation: Pick<
    GlossaryCatalogEntry,
    "definitionSymbol" | "termPresentation"
  > = {},
): GlossaryCatalogEntry {
  return {
    id,
    category: "Test",
    term,
    definition: `${term} definition.`,
    priority: 0,
    matchesRulesText: false,
    variants: [],
    ...presentation,
  };
}

describe("glossaryDefinitionsCardModel", () => {
  it("attaches production rule symbols to their definition rows", () => {
    const card = glossaryDefinitionsCardModel([
      entry("fast", "Fast", { definitionSymbol: "fast" }),
      entry("interrupt", "Interrupt", { definitionSymbol: "interrupt" }),
      entry("exhaust-cost", "Exhaust Cost", {
        definitionSymbol: "exhaust",
        termPresentation: "symbolOnly",
      }),
      entry("night-trigger", "▸Night"),
      entry("points", "Points", { termPresentation: "definitionOnly" }),
      entry("void", "Void"),
    ]);

    expect(card?.body).toEqual({
      kind: "definitions",
      entries: [
        {
          term: "Fast",
          definition: "Fast definition.",
          symbol: "fast",
          termPresentation: undefined,
        },
        {
          term: "Interrupt",
          definition: "Interrupt definition.",
          symbol: "interrupt",
          termPresentation: undefined,
        },
        {
          term: "Exhaust Cost",
          definition: "Exhaust Cost definition.",
          symbol: "exhaust",
          termPresentation: "symbolOnly",
        },
        {
          term: "▸Night",
          definition: "▸Night definition.",
          symbol: undefined,
          termPresentation: undefined,
        },
        {
          term: "Points",
          definition: "Points definition.",
          symbol: undefined,
          termPresentation: "definitionOnly",
        },
        {
          term: "Void",
          definition: "Void definition.",
          symbol: undefined,
          termPresentation: undefined,
        },
      ],
    });
  });

  it("omits excluded entries while preserving the remaining glossary card", () => {
    const card = glossaryDefinitionsCardModel(
      [
        entry("fast", "Fast", { definitionSymbol: "fast" }),
        entry("bane", "Bane"),
      ],
      ["fast", "interrupt"],
    );

    expect(card?.body).toEqual({
      kind: "definitions",
      entries: [
        {
          term: "Bane",
          definition: "Bane definition.",
          symbol: undefined,
          termPresentation: undefined,
        },
      ],
    });
  });
});

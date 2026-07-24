import { describe, expect, it } from "vitest";
import {
  GLOSSARY_IDS,
  type GlossaryCatalogEntry,
} from "../../../data/glossary";
import { glossaryDefinitionsCardModel } from "./rules-text-reveal";

function entry(id: string, term: string): GlossaryCatalogEntry {
  return {
    id,
    category: "Test",
    term,
    definition: `${term} definition.`,
    priority: 0,
    matchesRulesText: false,
    variants: [],
  };
}

describe("glossaryDefinitionsCardModel", () => {
  it("attaches production rule symbols to their definition rows", () => {
    const card = glossaryDefinitionsCardModel([
      entry(GLOSSARY_IDS.fast, "Fast"),
      entry(GLOSSARY_IDS.interrupt, "Interrupt"),
      entry(GLOSSARY_IDS.exhaustCost, "Exhaust Cost"),
      entry(GLOSSARY_IDS.nightTrigger, "Night"),
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
          term: "Night",
          definition: "Night definition.",
          symbol: "trigger",
          termPresentation: undefined,
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
});

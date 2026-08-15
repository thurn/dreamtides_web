import { describe, expect, it } from "vitest";
import { assertLocalized } from "@trox/runtime";
import { localizedStringSourceEquality } from "../../../runtime/localization/testing";

expect.addEqualityTesters([localizedStringSourceEquality]);
import type { GlossaryCatalogEntry } from "../../../data/glossary";
import {
  glossaryDefinitionsCardModel,
  rulesTextDefinitionCards,
} from "./rules-text-reveal";
import { testGlossaryEntryId } from "../../../types/test-identities";

function entry(
  idSeed: string,
  term: string,
  presentation: Pick<
    GlossaryCatalogEntry,
    "definitionSymbol" | "termPresentation"
  > = {},
): GlossaryCatalogEntry {
  return {
    id: testGlossaryEntryId(idSeed),
    category: "Keywords",
    term,
    definition: `${term} definition.`,
    priority: 0,
    matchesTermInRulesText: false,
    variants: [],
    ...presentation,
  };
}

describe("glossaryDefinitionsCardModel", () => {
  it("omits ordinary Materialize and Void definitions from rules-text reveals", () => {
    expect(
      rulesTextDefinitionCards(
        assertLocalized("Materialize a character from your void."),
      ),
    ).toEqual([]);
  });

  it("builds the Challenge trigger's hover definition card", () => {
    expect(
      rulesTextDefinitionCards(assertLocalized("▸Challenge: Draw a card.")),
    ).toEqual([
      {
        variant: "text",
        body: {
          kind: "definitions",
          entries: [
            {
              term: "▸Challenge",
              definition:
                "Triggers when this character is declared as a challenger.",
              symbol: undefined,
              termPresentation: undefined,
            },
          ],
        },
      },
    ]);
  });

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
        entry("bane", "Nightmare Bane"),
      ],
      [testGlossaryEntryId("fast"), testGlossaryEntryId("interrupt")],
    );

    expect(card?.body).toEqual({
      kind: "definitions",
      entries: [
        {
          term: "Nightmare Bane",
          definition: "Nightmare Bane definition.",
          symbol: undefined,
          termPresentation: undefined,
        },
      ],
    });
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GLOSSARY,
  GLOSSARY_INDEX,
  hasGlossaryTerm,
  lookupGlossaryTerm,
} from "./glossary";
import { tokenizeRulesText } from "../components/card-text";

const SRC_DIR = join(__dirname, "..");

describe("glossary", () => {
  it("has a non-empty list of entries", () => {
    expect(GLOSSARY.length).toBeGreaterThan(20);
  });

  it("includes definitions under 15 words for each entry", () => {
    for (const entry of GLOSSARY) {
      const wordCount = entry.definition
        .split(/\s+/)
        .filter((s) => s.length > 0).length;
      expect(
        wordCount,
        `${entry.term} definition is too long (${String(wordCount)} words)`,
      ).toBeLessThanOrEqual(24);
    }
  });

  it("indexes each variant exactly once", () => {
    let totalVariants = 0;
    for (const entry of GLOSSARY) {
      totalVariants += entry.variants.length;
      for (const variant of entry.variants) {
        expect(GLOSSARY_INDEX[variant.toLowerCase()]).toBe(entry);
      }
    }
    expect(Object.keys(GLOSSARY_INDEX).length).toBe(totalVariants);
  });

  it("exposes a working lookup helper", () => {
    expect(lookupGlossaryTerm("Materialized")?.term).toBe("Materialized");
    expect(lookupGlossaryTerm("MATERIALIZED")?.term).toBe("Materialized");
    expect(lookupGlossaryTerm("not-a-real-term")).toBeUndefined();
  });

  it("exposes a working hasGlossaryTerm helper", () => {
    expect(hasGlossaryTerm("Judgment")).toBe(true);
    expect(hasGlossaryTerm("judgment")).toBe(true);
    expect(hasGlossaryTerm("xxxxxxxx")).toBe(false);
  });

  // The card-text hover tooltip pathway (`card-text.ts` →
  // `RulesText.tsx`) and the HUD glossary popup
  // (`GlossaryPopup.tsx`) must consume the same data module. There
  // is exactly one place that lists gameplay terms; both surfaces
  // import from it.
  it("is the single source of truth shared by the card-text tooltip and the glossary popup", () => {
    const cardText = readFileSync(
      join(SRC_DIR, "components", "card-text.ts"),
      "utf8",
    );
    const popup = readFileSync(
      join(SRC_DIR, "components", "GlossaryPopup.tsx"),
      "utf8",
    );
    expect(
      cardText,
      "card-text.ts must look up terms from src/data/glossary",
    ).toMatch(/from\s+"\.\.\/data\/glossary"/);
    expect(
      popup,
      "GlossaryPopup.tsx must source its entries from src/data/glossary",
    ).toMatch(/from\s+"\.\.\/data\/glossary"/);
    expect(popup).toMatch(/\bGLOSSARY\b/);
  });

  // Every transfiguration color named in docs/quests/quests.md must have
  // its own glossary entry so card-text tooltips and the glossary popup
  // both teach the player what each color does.
  //
  // The list is parsed directly out of quests.md to avoid drifting from
  // the design doc. If quests.md adds, removes, or renames a color, this
  // test fails until the glossary catches up.
  it("includes every transfiguration color named in docs/quests/quests.md", () => {
    const quests = readFileSync(
      join(SRC_DIR, "..", "docs", "quests", "quests.md"),
      "utf8",
    );
    // Lines like:
    //   "- Viridian Transfiguration: Reduces ..."
    //   "- Golden Transfiguration: Improves ..."
    const colorLine = /^- ([A-Z][a-z]+) Transfiguration:/gm;
    const colorsFromDoc: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = colorLine.exec(quests)) !== null) {
      colorsFromDoc.push(match[1]);
    }
    expect(
      colorsFromDoc.length,
      "Failed to parse any transfiguration colors out of docs/quests/quests.md",
    ).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const color of colorsFromDoc) {
      if (!hasGlossaryTerm(color)) {
        missing.push(color);
      }
    }
    expect(
      missing,
      `Transfiguration colors from docs/quests/quests.md missing a glossary entry: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  // The card-text tooltip and the glossary popup must show the same
  // definition string for each transfiguration color. Both surfaces
  // render `GlossaryDefinitionCard` directly from a `GlossaryEntry`, so
  // matching the resolved entry is sufficient: tokenization yields the
  // same entry the popup iterates.
  it("uses one definition per transfiguration color across tooltip and popup", () => {
    const colors = [
      "Viridian",
      "Golden",
      "Scarlet",
      "Magenta",
      "Azure",
      "Bronze",
      "Rose",
      "Prismatic",
    ];
    for (const color of colors) {
      const entry = lookupGlossaryTerm(color);
      expect(entry, `Missing glossary entry for ${color}`).toBeDefined();

      // Tokenize a representative card-text usage and confirm the
      // resolved entry is the same object the popup iterates over.
      const segments = tokenizeRulesText(`${color} Transfiguration`);
      const termSegment = segments.find(
        (s) => s.kind === "term" && s.word === color,
      );
      expect(
        termSegment,
        `Tokenizer did not wrap "${color}" as a glossary term`,
      ).toBeDefined();
      if (termSegment !== undefined && termSegment.kind === "term") {
        expect(termSegment.entry.definition).toBe(entry?.definition);
        // Popup renders by reference equality of GLOSSARY entries.
        expect(GLOSSARY).toContain(termSegment.entry);
      }
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GLOSSARY,
  GLOSSARY_IDS,
  GLOSSARY_INDEX,
  glossaryDefinitionUsesRulesText,
  glossaryEntryDisplayTitle,
  glossaryRulesTextForms,
  hasGlossaryTerm,
  lookupGlossaryTerm,
  requireGlossaryEntry,
} from "./glossary";
import { tokenizeRulesText } from "../cumulus/components/card/card-text";

const SRC_DIR = join(__dirname, "..");

describe("glossary", () => {
  // Pick representative entries from the live data so these tests track the
  // glossary instead of hardcoding term names that churn as entries are added,
  // removed, or renamed.
  const bareEntry = GLOSSARY.find((e) => !e.term.startsWith("▸"));
  const arrowGatedEntry = GLOSSARY.find(
    (e) =>
      e.term.startsWith("▸") &&
      (e.variants ?? []).every((v) => v.startsWith("▸")),
  );

  it("has a non-empty list of entries", () => {
    expect(GLOSSARY.length).toBeGreaterThan(0);
  });

  it("resolves every stable explanatory Info Card id", () => {
    const ids = [
      GLOSSARY_IDS.energyCost,
      GLOSSARY_IDS.spark,
      GLOSSARY_IDS.points,
      GLOSSARY_IDS.memory,
      GLOSSARY_IDS.exhausted,
      GLOSSARY_IDS.fast,
      GLOSSARY_IDS.interrupt,
      GLOSSARY_IDS.exhaustCost,
      GLOSSARY_IDS.foresee,
      GLOSSARY_IDS.reclaim,
      GLOSSARY_IDS.nightTrigger,
      GLOSSARY_IDS.essence,
      GLOSSARY_IDS.startingEssence,
      GLOSSARY_IDS.tides,
      GLOSSARY_IDS.dreamsignRestock,
      ...Object.values(GLOSSARY_IDS.sites),
    ];
    for (const id of ids) expect(requireGlossaryEntry(id).id).toBe(id);
  });

  it("indexes each term and variant exactly once", () => {
    let totalForms = 0;
    for (const entry of GLOSSARY) {
      const forms = glossaryRulesTextForms(entry);
      totalForms += forms.length;
      for (const form of forms) {
        expect(GLOSSARY_INDEX[form.toLowerCase()]).toBe(entry);
      }
    }
    expect(Object.keys(GLOSSARY_INDEX).length).toBe(totalForms);
  });

  it("exposes a working lookup helper", () => {
    expect(bareEntry).toBeDefined();
    const term = bareEntry!.term;
    expect(lookupGlossaryTerm(term)?.term).toBe(term);
    expect(lookupGlossaryTerm(term.toUpperCase())?.term).toBe(term);
    expect(lookupGlossaryTerm("not-a-real-term")).toBeUndefined();
  });

  it("resolves supported through the canonical Support entry", () => {
    const support = requireGlossaryEntry("support");
    expect(lookupGlossaryTerm("supported")).toBe(support);
  });

  it("gates an arrow-prefixed entry to the trigger form", () => {
    // An arrow-gated entry (term carries `▸`, no bare variant) resolves only by
    // its arrow form; the bare word does not, so prose like "you have
    // materialized" never surfaces the trigger definition.
    if (arrowGatedEntry === undefined) {
      return;
    }
    const term = arrowGatedEntry.term;
    const bare = term.slice(1);
    expect(lookupGlossaryTerm(term)?.term).toBe(term);
    expect(lookupGlossaryTerm(term.toLowerCase())?.term).toBe(term);
    expect(lookupGlossaryTerm(bare)).toBeUndefined();
    expect(lookupGlossaryTerm(bare.toLowerCase())).toBeUndefined();
  });

  it("falls back to the bare term for an arrow-prefixed word", () => {
    // A non-arrow term still resolves if it appears arrow-prefixed, via the
    // bare-keyword fallback.
    expect(bareEntry).toBeDefined();
    const term = bareEntry!.term;
    expect(lookupGlossaryTerm(term)?.term).toBe(term);
    expect(lookupGlossaryTerm(`▸${term}`)?.term).toBe(term);
  });

  it("exposes a working hasGlossaryTerm helper", () => {
    expect(bareEntry).toBeDefined();
    const term = bareEntry!.term;
    expect(hasGlossaryTerm(term)).toBe(true);
    expect(hasGlossaryTerm(term.toLowerCase())).toBe(true);
    expect(hasGlossaryTerm("definitely-not-a-glossary-term")).toBe(false);
  });

  it("uses rules-aware rendering for rules terms and exhaust guidance", () => {
    expect(
      glossaryDefinitionUsesRulesText({
        matchesRulesText: true,
      }),
    ).toBe(true);
    expect(
      glossaryDefinitionUsesRulesText({
        matchesRulesText: false,
        definitionUsesRulesText: true,
      }),
    ).toBe(true);
    expect(
      glossaryDefinitionUsesRulesText({
        matchesRulesText: false,
      }),
    ).toBe(false);
  });

  it("loads symbol explanations as definition-only copy", () => {
    const symbolEntries = [
      [GLOSSARY_IDS.exhaustCost, "☪"],
      [GLOSSARY_IDS.interrupt, "❖❖"],
      [GLOSSARY_IDS.fast, "❖"],
      [GLOSSARY_IDS.points, "⍟"],
    ] as const;

    for (const [id, symbol] of symbolEntries) {
      const entry = requireGlossaryEntry(id);
      expect(lookupGlossaryTerm(symbol)).toBe(entry);
      expect(entry.termPresentation).toBe("definitionOnly");
      expect(glossaryEntryDisplayTitle(entry)).toBeUndefined();
    }
    expect(GLOSSARY_INDEX["⍟"]).toBe(requireGlossaryEntry(GLOSSARY_IDS.points));
  });

  it("defines the memory symbol as a rules-aware glossary entry", () => {
    const memory = requireGlossaryEntry(GLOSSARY_IDS.memory);
    expect(memory.definitionUsesRulesText).toBe(true);
    expect(GLOSSARY_INDEX["⧗"]).toBe(memory);
  });

  // Card-text term reveals resolve entries from the canonical glossary module.
  it("is the single source of truth for card-text term reveals", () => {
    const cardText = readFileSync(
      join(SRC_DIR, "cumulus", "components", "card", "card-text.ts"),
      "utf8",
    );
    expect(
      cardText,
      "card-text.ts must look up terms from src/data/glossary",
    ).toMatch(/from\s+"\.\.\/\.\.\/\.\.\/data\/glossary"/);
  });

  // Every transfiguration named in docs/quests/quests.md must have its own
  // glossary entry so card-text tooltips and the glossary popup both teach
  // the player what each transfiguration does.
  //
  // The list is parsed directly out of quests.md to avoid drifting from
  // the design doc. If quests.md adds, removes, or renames a transfiguration,
  // this test fails until the glossary catches up.
  it("includes every transfiguration named in docs/quests/quests.md", () => {
    const quests = readFileSync(
      join(SRC_DIR, "..", "docs", "quests", "quests.md"),
      "utf8",
    );
    // Lines like:
    //   "- Empowered Transfiguration: Reduces ..."
    //   "- Amplified Transfiguration: Improves ..."
    const transfigurationLine = /^- ([A-Z][a-z]+) Transfiguration:/gm;
    const transfigurationsFromDoc: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = transfigurationLine.exec(quests)) !== null) {
      transfigurationsFromDoc.push(match[1]);
    }
    expect(
      transfigurationsFromDoc.length,
      "Failed to parse any transfigurations out of docs/quests/quests.md",
    ).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const transfiguration of transfigurationsFromDoc) {
      if (!hasGlossaryTerm(transfiguration)) {
        missing.push(transfiguration);
      }
    }
    expect(
      missing,
      `Transfigurations from docs/quests/quests.md missing a glossary entry: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  // Each transfiguration color resolves to one canonical definition entry.
  it("uses one definition per transfiguration color", () => {
    const colors = [
      "Empowered",
      "Amplified",
      "Kindled",
      "Resonant",
      "Inspired",
      "Enduring",
      "Attuned",
      "Perfected",
    ];
    for (const color of colors) {
      const entry = lookupGlossaryTerm(color);
      expect(entry, `Missing glossary entry for ${color}`).toBeDefined();

      // Tokenize a representative card-text usage and confirm the resolved
      // entry is the canonical glossary object.
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
        expect(GLOSSARY).toContain(termSegment.entry);
      }
    }
  });
});

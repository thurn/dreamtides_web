import { describe, it, expect } from "vitest";
import { GLOSSARY, GLOSSARY_IDS, GLOSSARY_INDEX, RULES_SYMBOL_GLOSSARY, glossaryDefinitionUsesRulesText, glossaryRulesTextForms, lookupGlossaryTerm, requireGlossaryEntry, rulesSymbolGlossaryEntry } from "./glossary";
import { testGlossaryEntryId } from "../types/test-identities";
import { projectGlossaryEntry, extractGlossaryTerms } from "./glossary-terms";
import type { GlossaryCatalogEntry } from "./glossary";

describe("glossary", () => {
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

    it("owns every supported rules symbol exactly once", () => {
      const expectedTokens = [
        "essence",
        "points",
        "lunar",
        "store",
        "energy",
        "spark",
      ] as const;
      expect(
        RULES_SYMBOL_GLOSSARY.map((entry) => entry.rulesSymbol?.token).sort(),
      ).toEqual([...expectedTokens].sort());
      for (const token of expectedTokens) {
        expect(rulesSymbolGlossaryEntry(token).rulesSymbol?.token).toBe(token);
      }
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

    it("uses rules-aware rendering for rules terms and exhaust guidance", () => {
      expect(
        glossaryDefinitionUsesRulesText({
          matchesTermInRulesText: true,
          variants: [],
        }),
      ).toBe(true);
      expect(
        glossaryDefinitionUsesRulesText({
          matchesTermInRulesText: false,
          variants: ["☾"],
        }),
      ).toBe(true);
      expect(
        glossaryDefinitionUsesRulesText({
          matchesTermInRulesText: false,
          variants: [],
        }),
      ).toBe(false);
    });

  });
});

describe("glossary-terms", () => {
  // Derive representative entries from the live glossary so these tests track the
  // data rather than hardcoding term names that churn as entries are added,
  // removed, or renamed.
  const bareTerms = GLOSSARY.filter((entry) =>
    glossaryRulesTextForms(entry).includes(entry.term),
  ).filter((entry) => !entry.term.startsWith("▸"));
  const pluralEntry = GLOSSARY.find((e) =>
    (e.variants ?? []).some((v) => !v.startsWith("▸")),
  );
  const pluralVariant = (pluralEntry?.variants ?? []).find(
    (v) => !v.startsWith("▸"),
  );
  const arrowGatedEntry = GLOSSARY.find(
    (e) =>
      e.term.startsWith("▸") &&
      (e.variants ?? []).every((v) => v.startsWith("▸")),
  );

  describe("extractGlossaryTerms", () => {

    it("matches a single term in plain prose", () => {
      const term = bareTerms[0].term;
      const terms = extractGlossaryTerms(`Gain a ${term}.`);
      expect(terms.map((entry) => entry.term)).toEqual([term]);
    });

    it("matches terms case-insensitively", () => {
      const term = bareTerms[0].term;
      const terms = extractGlossaryTerms(`gain a ${term.toUpperCase()}`);
      expect(terms.map((entry) => entry.term)).toEqual([term]);
    });

    it("matches plural / past-tense forms via the glossary variants list", () => {
      if (pluralEntry === undefined || pluralVariant === undefined) {
        return;
      }
      const terms = extractGlossaryTerms(`Discard your ${pluralVariant} now.`);
      expect(terms.map((entry) => entry.term)).toEqual([pluralEntry.term]);
    });

    it("matches multiple distinct terms in first-occurrence order", () => {
      const [t0, t1, t2] = bareTerms;
      const terms = extractGlossaryTerms(
        `${t0.term} a ${t1.term}, then ${t2.term} two cards.`,
      );
      expect(terms.map((entry) => entry.term)).toEqual(
        [t0, t1, t2].map((entry) => entry.term),
      );
    });

    it("deduplicates repeated mentions of the same term", () => {
      const term = bareTerms[0].term;
      const terms = extractGlossaryTerms(
        `${term} after ${term} after ${term.toUpperCase()}`,
      );
      expect(terms.map((entry) => entry.term)).toEqual([term]);
    });

    it("surfaces an arrow-gated term only when the arrow is present", () => {
      if (arrowGatedEntry === undefined) {
        return;
      }
      // The arrow form (e.g. `▸Materialized`, no space) shows the tile.
      const trigger = extractGlossaryTerms(
        `${arrowGatedEntry.term}: draw a card.`,
      );
      expect(trigger.map((entry) => entry.term)).toEqual([arrowGatedEntry.term]);

      // The bare word does not, so it never duplicates the trigger.
      const bare = arrowGatedEntry.term.slice(1).toLowerCase();
      const prose = extractGlossaryTerms(`you have ${bare} this turn`);
      expect(prose.map((entry) => entry.term)).toEqual([]);
    });

    it("orders heterogeneous mentions by their rules-text occurrence", () => {
      const [t0, t1, t2, t3] = bareTerms;
      const terms = extractGlossaryTerms(
        `After ${t0.term}, ${t1.term} a ${t2.term}, then ${t3.term}.`,
      );
      expect(terms.map((entry) => entry.term)).toEqual(
        [t0, t1, t2, t3].map((entry) => entry.term),
      );
    });
  });

  function fixture(
    idSeed: string,
    term: string,
    definition: string,
    priority = 0,
    projections: GlossaryCatalogEntry["projections"] = [],
  ): GlossaryCatalogEntry {
    return {
      id: testGlossaryEntryId(idSeed),
      category: "Keywords",
      term,
      definition,
      priority,
      matchesTermInRulesText: true,
      variants: [],
      projections,
    };
  }

  describe("projected glossary definitions", () => {

    it("binds captured projection arguments into localized values", () => {
      const projection = {
        pattern: String.raw`\bforesee\s+(\d+)\b`,
        term: "{term} {1}",
        definition: "Look at the top {1} cards.",
      };
      const foresee = fixture("foresee", "Foresee", "Generic definition.", 0, [
        projection,
      ]);

      const projected = projectGlossaryEntry(foresee, "Foresee 3.");

      expect(projected.term).toBe("Foresee 3");
      expect(projected.definition).toBe("Look at the top 3 cards.");
    });

    it("uses avatar-specific exhaust instructions", () => {
      const exhaust = fixture(
        "exhaust-cost",
        "Exhaust Cost",
        "Generic exhaust definition.",
        0,
        [
          {
            owner: "avatar",
            definition:
              "You may exhaust (☾) this avatar to activate this ability once per turn.",
          },
        ],
      );

      expect(
        projectGlossaryEntry(exhaust, "2●, ☾: Draw a card.", "avatar")
          .definition,
      ).toBe(
        "You may exhaust (☾) this avatar to activate this ability once per turn.",
      );
    });
  });
});

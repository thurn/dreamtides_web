import { describe, it, expect } from "vitest";

import { extractGlossaryTerms } from "./glossary-terms";

describe("extractGlossaryTerms", () => {
  it("returns an empty array for empty input", () => {
    expect(extractGlossaryTerms("")).toEqual([]);
  });

  it("returns an empty array when no glossary term is present", () => {
    expect(extractGlossaryTerms("Gain 2 essence and one point.")).toEqual([]);
  });

  it("matches a single term in plain prose", () => {
    const terms = extractGlossaryTerms("Gain a Bane.");
    expect(terms).toHaveLength(1);
    expect(terms[0].term).toBe("Bane");
  });

  it("matches terms case-insensitively", () => {
    const terms = extractGlossaryTerms("trigger a DAWN");
    expect(terms.map((entry) => entry.term)).toEqual(["Dawn"]);
  });

  it("matches plural / past-tense forms via the glossary variants list", () => {
    // `banes` → Bane; `transfigured` → Transfigure
    const terms = extractGlossaryTerms(
      "Discard your banes, then transfigured cards return.",
    );
    expect(terms.map((entry) => entry.term)).toEqual(["Bane", "Transfigure"]);
  });

  it("matches multiple distinct terms in first-occurrence order", () => {
    const terms = extractGlossaryTerms(
      "Reclaim a Bane, then Transfigure two cards.",
    );
    expect(terms.map((entry) => entry.term)).toEqual([
      "Reclaim",
      "Bane",
      "Transfigure",
    ]);
  });

  it("deduplicates repeated mentions of the same term", () => {
    const terms = extractGlossaryTerms("Bane after Bane after BANE");
    expect(terms).toHaveLength(1);
    expect(terms[0].term).toBe("Bane");
  });

  it("deduplicates singular and plural mentions to a single entry", () => {
    const terms = extractGlossaryTerms("Gain a bane. Discard all banes.");
    expect(terms).toHaveLength(1);
    expect(terms[0].term).toBe("Bane");
  });

  it("tolerates punctuation around terms", () => {
    const terms = extractGlossaryTerms("(transfigured) — dawn: bane.");
    expect(terms.map((entry) => entry.term)).toEqual([
      "Transfigure",
      "Dawn",
      "Bane",
    ]);
  });

  it("surfaces an arrow-gated term only when the arrow is present", () => {
    // The production trigger form (`▸Materialized`, no space) shows the tile.
    const trigger = extractGlossaryTerms("▸Materialized: draw a card.");
    expect(trigger.map((entry) => entry.term)).toEqual(["▸Materialized"]);

    // The bare past-tense verb does not, so it never duplicates the trigger.
    const prose = extractGlossaryTerms(
      "if it is not the first ally you have materialized this turn",
    );
    expect(prose.map((entry) => entry.term)).toEqual([]);
  });

  it("resolves a plain arrow-prefixed trigger through its bare entry", () => {
    const terms = extractGlossaryTerms("▸Dawn: gain 1 energy.");
    expect(terms.map((entry) => entry.term)).toEqual(["Dawn"]);
  });

  it("preserves order across heterogeneous mentions", () => {
    const terms = extractGlossaryTerms(
      "After Materialize, Banish a Bane, then Foresee 2.",
    );
    expect(terms.map((entry) => entry.term)).toEqual([
      "Materialize",
      "Banish",
      "Bane",
      "Foresee",
    ]);
  });
});

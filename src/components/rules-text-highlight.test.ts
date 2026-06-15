import { describe, it, expect } from "vitest";

import { isHighlightedRulesTextTerm } from "./RulesText";
import { tokenizeRulesText, type TextSegment } from "./card-text";

/**
 * Returns every glossary term the tokenizer recognizes in `text`, paired with
 * the word as written and whether it is emphasized. Descends into nobreak
 * groups so trigger keywords (which live inside a nobreak with their arrow) are
 * included.
 */
function termHighlights(text: string): { word: string; highlighted: boolean }[] {
  const out: { word: string; highlighted: boolean }[] = [];
  const walk = (segments: TextSegment[]): void => {
    for (const segment of segments) {
      if (segment.kind === "term") {
        out.push({
          word: segment.word,
          highlighted: isHighlightedRulesTextTerm(segment.word),
        });
      } else if (segment.kind === "nobreak") {
        walk(segment.segments);
      }
    }
  };
  walk(tokenizeRulesText(text));
  return out;
}

describe("rules-text highlight emphasis", () => {
  it("emphasizes the curated action verbs and keyword abilities", () => {
    for (const word of [
      "dissolve",
      "dissolves",
      "banish",
      "discover",
      "erode",
      "prevent",
      "rematerialize",
      "ephemeral",
      "foresee",
      "awakened",
      "phasing",
      "support",
      "veil",
      "reclaim",
      "offering",
      "unstoppable",
      "vengeful",
      "preeminence",
    ]) {
      expect(isHighlightedRulesTextTerm(word)).toBe(true);
    }
  });

  it("leaves the de-emphasized words plain", () => {
    for (const word of [
      // Named triggers carry no emphasis.
      "materialized",
      "dissolved",
      "dawn",
      // Explicitly de-emphasized terms.
      "abandon",
      "materialize",
      "supported",
      "supporting",
      "figment",
      "figments",
      "scores",
      "score",
    ]) {
      expect(isHighlightedRulesTextTerm(word)).toBe(false);
    }
  });

  it("matches word forms case-insensitively", () => {
    expect(isHighlightedRulesTextTerm("Dissolve")).toBe(true);
    expect(isHighlightedRulesTextTerm("VEIL")).toBe(true);
    expect(isHighlightedRulesTextTerm("Dissolved")).toBe(false);
  });

  // The verb `dissolve` is emphasized, but neither the `▸Dissolved` trigger nor
  // the past-tense verb `dissolved` is — all keyed on the word as written.
  it("splits dissolve from dissolved and the trigger", () => {
    const segments = termHighlights(
      "▸Dissolved: Dissolve an ally. When an ally is dissolved, draw.",
    );
    expect(segments).toContainEqual({ word: "Dissolved", highlighted: false });
    expect(segments).toContainEqual({ word: "Dissolve", highlighted: true });
    expect(segments).toContainEqual({ word: "dissolved", highlighted: false });
  });

  // The `support` keyword is emphasized; the `supported` relationship word is
  // not, even though both resolve to the same glossary entry.
  it("splits support from supported", () => {
    const segments = termHighlights(
      "Support – Supported allies gain unstoppable.",
    );
    expect(segments).toContainEqual({ word: "Support", highlighted: true });
    expect(segments).toContainEqual({ word: "Supported", highlighted: false });
    expect(segments).toContainEqual({ word: "unstoppable", highlighted: true });
  });

  it("does not emphasize the named triggers in their arrow form", () => {
    expect(termHighlights("▸Materialized: Draw a card.")).toContainEqual({
      word: "Materialized",
      highlighted: false,
    });
    expect(termHighlights("▸Dawn: Gain 1 energy.")).toContainEqual({
      word: "Dawn",
      highlighted: false,
    });
  });
});

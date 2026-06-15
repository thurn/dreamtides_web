import { describe, it, expect } from "vitest";

import {
  ACTION_TERMS,
  KEYWORD_TERMS,
  TRIGGER_TERMS,
  classifyRulesTextTerm,
} from "./RulesText";
import { tokenizeRulesText, type TextSegment } from "./card-text";
import { lookupGlossaryTerm } from "../data/glossary";

/**
 * Returns the highlight family of every glossary term the tokenizer recognizes
 * in `text`, paired with the word as written. Descends into nobreak groups so
 * trigger keywords (which live inside a nobreak with their arrow) are included.
 */
function termGroups(
  text: string,
): { word: string; group: ReturnType<typeof classifyRulesTextTerm> }[] {
  const out: { word: string; group: ReturnType<typeof classifyRulesTextTerm> }[] =
    [];
  const walk = (segments: TextSegment[]): void => {
    for (const segment of segments) {
      if (segment.kind === "term") {
        out.push({
          word: segment.word,
          group: classifyRulesTextTerm(segment.entry.term),
        });
      } else if (segment.kind === "nobreak") {
        walk(segment.segments);
      }
    }
  };
  walk(tokenizeRulesText(text));
  return out;
}

describe("rules-text highlight classification", () => {
  it("assigns each curated term to exactly one family", () => {
    const sets = [TRIGGER_TERMS, ACTION_TERMS, KEYWORD_TERMS];
    for (let i = 0; i < sets.length; i += 1) {
      for (const term of sets[i]) {
        for (let j = 0; j < sets.length; j += 1) {
          expect(sets[j].has(term)).toBe(i === j);
        }
      }
    }
  });

  it("classifies every curated term as its own family", () => {
    for (const term of TRIGGER_TERMS) {
      expect(classifyRulesTextTerm(term)).toBe("trigger");
    }
    for (const term of ACTION_TERMS) {
      expect(classifyRulesTextTerm(term)).toBe("action");
    }
    for (const term of KEYWORD_TERMS) {
      expect(classifyRulesTextTerm(term)).toBe("keyword");
    }
  });

  it("leaves uncurated words unclassified", () => {
    expect(classifyRulesTextTerm("definitely-not-a-term")).toBeUndefined();
  });

  it("every curated term resolves to a real glossary entry", () => {
    for (const set of [TRIGGER_TERMS, ACTION_TERMS, KEYWORD_TERMS]) {
      for (const term of set) {
        expect(lookupGlossaryTerm(term)?.term).toBe(term);
      }
    }
  });

  // The crux of the feature: the same root word lands in a different family
  // depending on whether it is the arrow trigger or the bare verb.
  it("colors an arrow trigger and its bare verb in different families", () => {
    const trigger = termGroups("▸Dissolved: Draw a card.");
    expect(trigger).toContainEqual({ word: "Dissolved", group: "trigger" });

    const verb = termGroups("When an ally is dissolved, draw a card.");
    expect(verb).toContainEqual({ word: "dissolved", group: "action" });
  });

  it("colors ▸Materialized as a trigger and bare materialize as an action", () => {
    expect(termGroups("▸Materialized: Gain 1 energy.")).toContainEqual({
      word: "Materialized",
      group: "trigger",
    });
    expect(termGroups("Materialize a character from your void.")).toContainEqual(
      { word: "Materialize", group: "action" },
    );
  });

  it("colors a static keyword ability in the keyword family", () => {
    expect(termGroups("Allied characters gain unstoppable.")).toContainEqual({
      word: "unstoppable",
      group: "keyword",
    });
  });
});

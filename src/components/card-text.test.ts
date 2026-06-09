import { describe, it, expect } from "vitest";
import {
  tokenizeRulesText,
  formatTypeLine,
  type TextSegment,
} from "./card-text";
import { lookupGlossaryTerm } from "../data/glossary";
import type { CardData } from "../types/cards";

/** Rebuilds the visible text from segments (recursing into nobreak groups). */
function reconstructText(segments: TextSegment[]): string {
  return segments
    .map((segment): string => {
      switch (segment.kind) {
        case "text":
          return segment.value;
        case "term":
          return segment.word;
        case "symbol":
          return segment.char;
        case "sparkPip":
          return `⍏${segment.value}`;
        case "bolt":
          return "❖".repeat(segment.count);
        case "nobreak":
          return reconstructText(segment.segments);
      }
    })
    .join("");
}

/** Returns all leaf segments, descending into nobreak groups. */
function flatten(segments: TextSegment[]): TextSegment[] {
  return segments.flatMap((segment) =>
    segment.kind === "nobreak" ? flatten(segment.segments) : [segment],
  );
}

/** Collects every symbol segment, descending into nobreak groups. */
function collectSymbols(
  segments: TextSegment[],
): Extract<TextSegment, { kind: "symbol" }>[] {
  const out: Extract<TextSegment, { kind: "symbol" }>[] = [];
  for (const segment of segments) {
    if (segment.kind === "symbol") {
      out.push(segment);
    } else if (segment.kind === "nobreak") {
      out.push(...collectSymbols(segment.segments));
    }
  }
  return out;
}

/** True when a glossary term with this word appears anywhere in the tree. */
function hasTerm(segments: TextSegment[], word: string): boolean {
  return segments.some(
    (segment) =>
      (segment.kind === "term" && segment.word === word) ||
      (segment.kind === "nobreak" && hasTerm(segment.segments, word)),
  );
}

/**
 * Returns the reconstructed text of the top-level nobreak group whose contents
 * include `contains`, or `undefined` if no such group exists. Used to assert
 * which run of text a symbol is kept on one line with.
 */
function nobreakContaining(
  segments: TextSegment[],
  contains: string,
): string | undefined {
  const group = segments.find(
    (segment) =>
      segment.kind === "nobreak" &&
      reconstructText(segment.segments).includes(contains),
  );
  return group !== undefined && group.kind === "nobreak"
    ? reconstructText(group.segments)
    : undefined;
}

describe("tokenizeRulesText", () => {
  it("returns a single text segment for plain text", () => {
    const result = tokenizeRulesText("Deal 3 damage.");
    expect(result).toEqual([{ kind: "text", value: "Deal 3 damage." }]);
  });

  it("returns an empty array for empty string", () => {
    expect(tokenizeRulesText("")).toEqual([]);
  });

  // Tokenizing then reconstructing must round-trip exactly: the icon-binding
  // pass only regroups segments, it never adds or drops characters.
  it("round-trips the visible text through tokenize + reconstruct", () => {
    for (const text of [
      "Deal 3 damage.",
      "Pay ●2 to gain 1✦.",
      "When you abandon an ally, trigger its ▸Materialized and ▸Dawn abilities.",
      "▸ Judgment: gain 2⍟.",
      "Your cards have ↯fast and cost ≤2● less.",
      "❖❖ — Abandon an ally: gain ⍏2.",
    ]) {
      expect(reconstructText(tokenizeRulesText(text))).toBe(text);
    }
  });

  // The tokenizer recognizes U+25CF as the energy symbol; the renderer swaps the
  // segment for the Boxicons flame. These assertions lock that contract.
  it("identifies the energy symbol ●", () => {
    const result = tokenizeRulesText("Pay ●2.");
    expect(collectSymbols(result)).toContainEqual({
      kind: "symbol",
      symbol: "energy",
      char: "●",
    });
    expect(reconstructText(result)).toBe("Pay ●2.");
  });

  it("emits a bare ● as a lone energy symbol segment", () => {
    const result = tokenizeRulesText("●");
    expect(result).toEqual([{ kind: "symbol", symbol: "energy", char: "●" }]);
  });

  // The spark glyph followed immediately by digits collapses into a sparkPip
  // segment so the renderer can draw a circled-number badge.
  it("collapses ⍏ followed by digits into a sparkPip segment", () => {
    const result = tokenizeRulesText("Gain ⍏1.");
    expect(flatten(result)).toContainEqual({ kind: "sparkPip", value: "1" });
    expect(reconstructText(result)).toBe("Gain ⍏1.");
  });

  it("collapses multi-digit spark values ⍏10 into a sparkPip segment", () => {
    const result = tokenizeRulesText("Gain ⍏10.");
    expect(flatten(result)).toContainEqual({ kind: "sparkPip", value: "10" });
  });

  it("treats a bare ⍏ (no trailing digits) as a spark symbol segment", () => {
    const result = tokenizeRulesText("Gain ⍏.");
    expect(collectSymbols(result)).toContainEqual({
      kind: "symbol",
      symbol: "spark",
      char: "⍏",
    });
  });

  // The activated-ability marker collapses into a bolt segment carrying the
  // count (one bolt for an activated ability, two for an interrupt).
  it("collapses a single ❖ into a bolt segment with count 1", () => {
    const result = tokenizeRulesText("❖ — 1●: Move this character.");
    expect(flatten(result).filter((s) => s.kind === "bolt")).toEqual([
      { kind: "bolt", count: 1 },
    ]);
  });

  it("collapses a double ❖❖ into a single bolt segment with count 2", () => {
    const result = tokenizeRulesText("❖❖ — Abandon an ally: Effect.");
    expect(result[0]).toEqual({ kind: "bolt", count: 2 });
  });

  // Points, lunar, and store each tokenize to their own symbol type.
  it("identifies the points symbol ⍟", () => {
    const result = tokenizeRulesText("Gain 2⍟.");
    expect(collectSymbols(result)).toContainEqual({
      kind: "symbol",
      symbol: "points",
      char: "⍟",
    });
    expect(reconstructText(result)).toBe("Gain 2⍟.");
  });

  it("identifies the lunar symbol ☪", () => {
    const result = tokenizeRulesText("☪: Draw a card.");
    expect(collectSymbols(result)).toContainEqual({
      kind: "symbol",
      symbol: "lunar",
      char: "☪",
    });
  });

  it("identifies the store symbol ⧗", () => {
    const result = tokenizeRulesText("Store 1⧗.");
    expect(collectSymbols(result)).toContainEqual({
      kind: "symbol",
      symbol: "store",
      char: "⧗",
    });
    expect(reconstructText(result)).toBe("Store 1⧗.");
  });

  it("identifies a bare trigger prefix ▸ that has no keyword space", () => {
    const result = tokenizeRulesText("▸When played:");
    expect(collectSymbols(result)).toContainEqual({
      kind: "symbol",
      symbol: "trigger",
      char: "▸",
    });
    expect(reconstructText(result)).toBe("▸When played:");
  });

  it("identifies the fast/lightning symbol ↯ when surrounded by spaces", () => {
    const result = tokenizeRulesText("Cast at ↯ speed.");
    expect(collectSymbols(result)).toContainEqual({
      kind: "symbol",
      symbol: "fast",
      char: "↯",
    });
    expect(reconstructText(result)).toBe("Cast at ↯ speed.");
  });

  // Icon line-break protection. Every inline icon stays on one line with the
  // text it reads with — this is general, not per-icon.

  // No space between the caret and its keyword (the common authored form): the
  // arrow must not be left alone at the end of a line. The keyword still
  // tokenizes as a glossary term so its popover attaches.
  it("keeps a no-space trigger arrow glued to its following keyword", () => {
    const result = tokenizeRulesText("trigger its ▸Materialized ability.");
    expect(nobreakContaining(result, "▸")).toBe("▸Materialized");
    expect(hasTerm(result, "Materialized")).toBe(true);
  });

  it("keeps a butted number glued to its symbol (●2)", () => {
    const result = tokenizeRulesText("Pay ●2.");
    expect(nobreakContaining(result, "●")).toBe("●2.");
  });

  // The word in front of a value is glued to the value+symbol so the quantity
  // never breaks after the verb.
  it("binds the leading word to a value butted against its spark symbol", () => {
    const result = tokenizeRulesText("it gains +2✦ each turn.");
    expect(nobreakContaining(result, "✦")).toBe("gains +2✦");
  });

  it("binds the leading word to a butted number and its points symbol", () => {
    const result = tokenizeRulesText("Gain 2⍟.");
    // The trailing period also has no space before it, so it stays glued too.
    expect(nobreakContaining(result, "⍟")).toBe("Gain 2⍟.");
  });

  it("binds a space-separated value and symbol, plus the leading word", () => {
    const result = tokenizeRulesText("the next card costs 2 ● less.");
    expect(nobreakContaining(result, "●")).toBe("costs 2 ●");
  });

  it("binds a comparison value (≤2●) to its leading word", () => {
    const result = tokenizeRulesText("play a ≤2● card.");
    expect(nobreakContaining(result, "●")).toBe("a ≤2●");
  });

  // The leading word binds even when it is a glossary term tokenizing into its
  // own segment — the term still renders for its popover.
  it("binds the variable X to a leading glossary term (Reclaim X●)", () => {
    const result = tokenizeRulesText("Reclaim X● to draw.");
    expect(nobreakContaining(result, "●")).toBe("Reclaim X●");
    expect(hasTerm(result, "Reclaim")).toBe(true);
  });

  // The trigger arrow `▸` keeps its glossary keyword on the same line. The
  // keyword inside the nobreak is wrapped as a `term` segment for its popover.
  it("groups ▸ with a trailing colon-suffixed keyword as nobreak (with term)", () => {
    const result = tokenizeRulesText("▸ Judgment: Draw a card.");
    const judgmentEntry = lookupGlossaryTerm("Judgment");
    expect(judgmentEntry).toBeDefined();
    expect(result).toEqual([
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "▸" },
          { kind: "text", value: " " },
          { kind: "term", word: "Judgment", entry: judgmentEntry },
          { kind: "text", value: ":" },
        ],
      },
      { kind: "text", value: " Draw a card." },
    ]);
  });

  it("groups ▸ with a trailing comma-suffixed keyword as nobreak (with term)", () => {
    const result = tokenizeRulesText("▸ Materialized, draw a card.");
    const materializedEntry = lookupGlossaryTerm("Materialized");
    expect(materializedEntry).toBeDefined();
    expect(result).toEqual([
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "▸" },
          { kind: "text", value: " " },
          { kind: "term", word: "Materialized", entry: materializedEntry },
          { kind: "text", value: "," },
        ],
      },
      { kind: "text", value: " draw a card." },
    ]);
  });

  it("groups all known trigger keywords with the arrow and wraps them as terms", () => {
    for (const keyword of ["Judgment", "Materialized", "Dissolved", "Banished"]) {
      const result = tokenizeRulesText(`▸ ${keyword}: Effect.`);
      const entry = lookupGlossaryTerm(keyword);
      expect(entry, `${keyword} should be in the glossary`).toBeDefined();
      expect(result[0]).toEqual({
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "▸" },
          { kind: "text", value: " " },
          { kind: "term", word: keyword, entry },
          { kind: "text", value: ":" },
        ],
      });
    }
  });

  it("groups ↯ with a directly attached lowercase keyword (↯fast) and wraps as term", () => {
    const result = tokenizeRulesText("Your cards have ↯fast.");
    const fastEntry = lookupGlossaryTerm("fast");
    expect(fastEntry).toBeDefined();
    expect(result).toEqual([
      { kind: "text", value: "Your cards have " },
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "fast", char: "↯" },
          { kind: "term", word: "fast", entry: fastEntry },
        ],
      },
      { kind: "text", value: "." },
    ]);
  });

  // Glossary tokenization. The tokenizer wraps recognized keywords in `term`
  // segments so the renderer can attach a hover popover.
  it("wraps a recognized lowercase glossary term", () => {
    const result = tokenizeRulesText("reclaim this card.");
    const reclaimEntry = lookupGlossaryTerm("reclaim");
    expect(reclaimEntry).toBeDefined();
    expect(result).toEqual([
      { kind: "term", word: "reclaim", entry: reclaimEntry },
      { kind: "text", value: " this card." },
    ]);
  });

  it("wraps multiple glossary terms in the same string", () => {
    const result = tokenizeRulesText("Discover with reclaim.");
    const discoverEntry = lookupGlossaryTerm("Discover");
    const reclaimEntry = lookupGlossaryTerm("reclaim");
    expect(discoverEntry).toBeDefined();
    expect(reclaimEntry).toBeDefined();
    expect(result).toEqual([
      { kind: "term", word: "Discover", entry: discoverEntry },
      { kind: "text", value: " with " },
      { kind: "term", word: "reclaim", entry: reclaimEntry },
      { kind: "text", value: "." },
    ]);
  });

  it("matches plural and past-tense variants", () => {
    const result = tokenizeRulesText("This dissolved character.");
    const dissolvedEntry = lookupGlossaryTerm("Dissolved");
    expect(dissolvedEntry).toBeDefined();
    expect(hasTerm(result, "dissolved")).toBe(true);
  });

  it("does not wrap unknown words", () => {
    const result = tokenizeRulesText("Deal 3 damage.");
    expect(result).toEqual([{ kind: "text", value: "Deal 3 damage." }]);
  });

  it("preserves the original spark symbol character, not a replacement", () => {
    const result = tokenizeRulesText("⍏");
    expect(result).toEqual([{ kind: "symbol", symbol: "spark", char: "⍏" }]);
    expect((result[0] as { char: string }).char).not.toBe("☆");
  });
});

function makeCard(overrides: Partial<CardData>): CardData {
  return {
    name: "Test Card",
    id: "test-card",
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 3,
    spark: 2,
    isFast: false,
    renderedText: "Test text.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

describe("formatTypeLine", () => {
  it("shows card type alone when subtype is empty", () => {
    const card = makeCard({ cardType: "Event", subtype: "" });
    expect(formatTypeLine(card)).toBe("Event");
  });

  it("shows card type alone when subtype is *", () => {
    const card = makeCard({ cardType: "Character", subtype: "*" });
    expect(formatTypeLine(card)).toBe("");
  });

  it("shows subtype alone for Character cards", () => {
    const card = makeCard({ cardType: "Character", subtype: "Ancient" });
    expect(formatTypeLine(card)).toBe("Ancient");
  });

  it("handles Event type with subtype", () => {
    const card = makeCard({ cardType: "Event", subtype: "Spell" });
    expect(formatTypeLine(card)).toBe("Event — Spell");
  });
});

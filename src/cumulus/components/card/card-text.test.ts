import { describe, it, expect } from "vitest";
import {
  tokenizeRulesText,
  formatTypeLine,
  type TextSegment,
} from "./card-text";
import {
  GLOSSARY,
  glossaryRulesTextForms,
} from "../../../data/glossary";
import type { CardData } from "../../../types/cards";
import { asCardId, asCardName } from "../../../types/card-identity";

// Representative live glossary entries, so the term-dependent tokenizer tests
// track the data instead of hardcoding names that change as the glossary
// evolves. `entry` objects come straight from GLOSSARY, which is what the
// tokenizer resolves to, so they compare equal in the expected output.
const ARROW_TRIGGERS = GLOSSARY.filter((e) => e.term.startsWith("▸"));
const BARE_ENTRIES = GLOSSARY.filter(
  (entry) =>
    /^[A-Za-z]+$/.test(entry.term) &&
    glossaryRulesTextForms(entry).includes(entry.term),
);
const PLURAL_ENTRY = GLOSSARY.find((e) =>
  (e.variants ?? []).some((v) => /^[a-z]+$/.test(v)),
);

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
        case "essence":
          return segment.amount ?? "";
        case "siteName":
          return segment.value;
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
      "❖ — Draw a card.",
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

  // The timing marker collapses into a bolt segment carrying the count (one
  // bolt for fast, two for an interrupt).
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
    const points = collectSymbols(result).find(
      (segment) => segment.symbol === "points",
    );
    expect(points).toMatchObject({
      kind: "symbol",
      symbol: "points",
      char: "⍟",
    });
    expect(points?.entry?.id).toBe("points");
    expect(reconstructText(result)).toBe("Gain 2⍟.");
  });

  it("identifies the lunar symbol ☪", () => {
    const result = tokenizeRulesText("☪: Draw a card.");
    const lunar = collectSymbols(result).find(
      (segment) => segment.symbol === "lunar",
    );
    expect(lunar).toMatchObject({
      kind: "symbol",
      symbol: "lunar",
      char: "☪",
    });
    expect(lunar?.entry?.id).toBe("exhaust-cost");
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

  // Icon line-break protection. Every inline icon stays on one line with the
  // text it reads with — this is general, not per-icon.

  // No space between the caret and its keyword (the common authored form): the
  // arrow must not be left alone at the end of a line. The keyword still
  // tokenizes as a glossary term so its popover attaches.
  it("keeps a no-space trigger arrow glued to its following keyword", () => {
    const entry = ARROW_TRIGGERS[0];
    const keyword = entry.term.slice(1);
    const result = tokenizeRulesText(`trigger its ${entry.term} ability.`);
    expect(nobreakContaining(result, "▸")).toBe(entry.term);
    expect(hasTerm(result, keyword)).toBe(true);
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
  it("binds the variable X to a leading glossary term", () => {
    const entry = BARE_ENTRIES[0];
    const result = tokenizeRulesText(`${entry.term} X● to draw.`);
    expect(nobreakContaining(result, "●")).toBe(`${entry.term} X●`);
    expect(hasTerm(result, entry.term)).toBe(true);
  });

  // The trigger arrow `▸` keeps its glossary keyword on the same line. The
  // keyword inside the nobreak is wrapped as a `term` segment for its popover.
  it("groups ▸ with a trailing colon-suffixed keyword as nobreak (with term)", () => {
    const entry = ARROW_TRIGGERS[0];
    const keyword = entry.term.slice(1);
    const result = tokenizeRulesText(`▸ ${keyword}: Draw a card.`);
    expect(result).toEqual([
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "▸" },
          { kind: "text", value: " " },
          { kind: "term", word: keyword, entry },
          { kind: "text", value: ":" },
        ],
      },
      { kind: "text", value: " Draw a card." },
    ]);
  });

  it("groups ▸ with a trailing comma-suffixed keyword as nobreak (with term)", () => {
    const entry = ARROW_TRIGGERS[0];
    const keyword = entry.term.slice(1);
    const result = tokenizeRulesText(`▸ ${keyword}, draw a card.`);
    expect(result).toEqual([
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "▸" },
          { kind: "text", value: " " },
          { kind: "term", word: keyword, entry },
          { kind: "text", value: "," },
        ],
      },
      { kind: "text", value: " draw a card." },
    ]);
  });

  it("groups every arrow trigger keyword with the arrow and wraps them as terms", () => {
    for (const entry of ARROW_TRIGGERS) {
      const keyword = entry.term.slice(1);
      const result = tokenizeRulesText(`▸ ${keyword}: Effect.`);
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

  // Glossary tokenization. The tokenizer wraps recognized keywords in `term`
  // segments so the renderer can attach a hover popover.
  it("wraps a recognized lowercase glossary term", () => {
    const entry = BARE_ENTRIES[0];
    const keyword = entry.term.toLowerCase();
    const result = tokenizeRulesText(`${keyword} this card.`);
    expect(result).toEqual([
      { kind: "term", word: keyword, entry },
      { kind: "text", value: " this card." },
    ]);
  });

  it("wraps multiple glossary terms in the same string", () => {
    const [first, second] = BARE_ENTRIES;
    const result = tokenizeRulesText(`${first.term} with ${second.term}.`);
    expect(result).toEqual([
      { kind: "term", word: first.term, entry: first },
      { kind: "text", value: " with " },
      { kind: "term", word: second.term, entry: second },
      { kind: "text", value: "." },
    ]);
  });

  it("matches plural and past-tense variants", () => {
    expect(PLURAL_ENTRY).toBeDefined();
    const variant = (PLURAL_ENTRY!.variants ?? []).find((v) =>
      /^[a-z]+$/.test(v),
    );
    expect(variant).toBeDefined();
    const result = tokenizeRulesText(`This ${variant!} character.`);
    expect(hasTerm(result, variant!)).toBe(true);
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
    id: asCardId(overrides.id ?? "test-card"),
    name: asCardName(overrides.name ?? "Test Card"),
  };
}

describe("formatTypeLine", () => {
  it("shows card type alone when subtype is empty", () => {
    const card = makeCard({ cardType: "Event", subtype: "" });
    expect(formatTypeLine(card)).toBe("Event");
  });

  it("shows subtype when subtype is *", () => {
    const card = makeCard({ cardType: "Character", subtype: "*" });
    expect(formatTypeLine(card)).toBe("*");
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

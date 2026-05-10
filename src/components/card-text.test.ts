import { describe, it, expect } from "vitest";
import { tokenizeRulesText, formatTypeLine } from "./card-text";
import type { CardData } from "../types/cards";

describe("tokenizeRulesText", () => {
  it("returns a single text segment for plain text", () => {
    const result = tokenizeRulesText("Deal 3 damage.");
    expect(result).toEqual([{ kind: "text", value: "Deal 3 damage." }]);
  });

  it("returns an empty array for empty string", () => {
    expect(tokenizeRulesText("")).toEqual([]);
  });

  // The tokenizer continues to recognize U+25CF as the "energy" symbol; the
  // rendering layer (CardDisplay) is what swaps the segment for the Boxicons
  // `bxs-flame` icon. See backlog task 004 \u2014 these assertions lock that the
  // tokenizer keeps emitting `symbol: "energy"` for `\u25CF`, which is the
  // contract CardDisplay relies on to render the flame.
  it("identifies the energy symbol \u25CF", () => {
    const result = tokenizeRulesText("Pay \u25CF2.");
    expect(result).toEqual([
      { kind: "text", value: "Pay " },
      { kind: "symbol", symbol: "energy", char: "\u25CF" },
      { kind: "text", value: "2." },
    ]);
  });

  it("emits an energy symbol segment for a bare \u25CF (locks the flame-icon contract)", () => {
    const result = tokenizeRulesText("\u25CF");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "symbol",
      symbol: "energy",
      char: "\u25CF",
    });
  });

  it("identifies the spark symbol \u234F", () => {
    const result = tokenizeRulesText("Gain \u234F1.");
    expect(result).toEqual([
      { kind: "text", value: "Gain " },
      { kind: "symbol", symbol: "spark", char: "\u234F" },
      { kind: "text", value: "1." },
    ]);
  });

  it("identifies the trigger prefix \u25B8 when not followed by a keyword", () => {
    const result = tokenizeRulesText("\u25B8When played:");
    expect(result).toEqual([
      { kind: "symbol", symbol: "trigger", char: "\u25B8" },
      { kind: "text", value: "When played:" },
    ]);
  });

  it("identifies the fast/lightning symbol \u21AF when surrounded by spaces", () => {
    const result = tokenizeRulesText("Cast at \u21AF speed.");
    expect(result).toEqual([
      { kind: "text", value: "Cast at " },
      { kind: "symbol", symbol: "fast", char: "\u21AF" },
      { kind: "text", value: " speed." },
    ]);
  });

  // The trigger arrow `\u25B8` must never visually orphan from its
  // following keyword (Judgment, Materialized, Dissolved, Banished, ...). The
  // tokenizer groups them into a single `nobreak` segment so the renderer can
  // wrap them in `white-space: nowrap`. See backlog task 005.
  it("groups \u25B8 with a trailing colon-suffixed keyword as nobreak", () => {
    const result = tokenizeRulesText("\u25B8 Judgment: Draw a card.");
    expect(result).toEqual([
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "\u25B8" },
          { kind: "text", value: " Judgment:" },
        ],
      },
      { kind: "text", value: " Draw a card." },
    ]);
  });

  it("groups \u25B8 with a trailing comma-suffixed keyword as nobreak", () => {
    const result = tokenizeRulesText("\u25B8 Materialized, draw a card.");
    expect(result).toEqual([
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "\u25B8" },
          { kind: "text", value: " Materialized," },
        ],
      },
      { kind: "text", value: " draw a card." },
    ]);
  });

  it("groups \u25B8 + bare keyword (no punctuation) as nobreak", () => {
    const result = tokenizeRulesText("trigger the \u25B8 Judgment ability");
    expect(result).toEqual([
      { kind: "text", value: "trigger the " },
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "\u25B8" },
          { kind: "text", value: " Judgment" },
        ],
      },
      { kind: "text", value: " ability" },
    ]);
  });

  it("groups all known trigger keywords with the arrow", () => {
    for (const keyword of ["Judgment", "Materialized", "Dissolved", "Banished"]) {
      const result = tokenizeRulesText(`\u25B8 ${keyword}: Effect.`);
      expect(result[0]).toEqual({
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "\u25B8" },
          { kind: "text", value: ` ${keyword}:` },
        ],
      });
    }
  });

  it("groups \u21AF with a directly attached lowercase keyword (e.g. \u21AFfast)", () => {
    const result = tokenizeRulesText("Your cards have \u21AFfast.");
    expect(result).toEqual([
      { kind: "text", value: "Your cards have " },
      {
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "fast", char: "\u21AF" },
          { kind: "text", value: "fast" },
        ],
      },
      { kind: "text", value: "." },
    ]);
  });

  it("handles multiple different symbols in one string", () => {
    const result = tokenizeRulesText("\u25B8Pay \u25CF3: gain \u234F2");
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({
      kind: "symbol",
      symbol: "trigger",
      char: "\u25B8",
    });
    expect(result[1]).toEqual({ kind: "text", value: "Pay " });
    expect(result[2]).toEqual({
      kind: "symbol",
      symbol: "energy",
      char: "\u25CF",
    });
    expect(result[3]).toEqual({ kind: "text", value: "3: gain " });
    expect(result[4]).toEqual({
      kind: "symbol",
      symbol: "spark",
      char: "\u234F",
    });
    expect(result[5]).toEqual({ kind: "text", value: "2" });
  });

  it("handles consecutive symbols without text between them", () => {
    const result = tokenizeRulesText("\u25CF\u234F");
    expect(result).toEqual([
      { kind: "symbol", symbol: "energy", char: "\u25CF" },
      { kind: "symbol", symbol: "spark", char: "\u234F" },
    ]);
  });

  it("preserves the original spark symbol character, not a replacement", () => {
    const result = tokenizeRulesText("\u234F");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "symbol",
      symbol: "spark",
      char: "\u234F",
    });
    // Verify the char is the APL symbol, not a star replacement
    expect((result[0] as { char: string }).char).toBe("\u234F");
    expect((result[0] as { char: string }).char).not.toBe("\u2606");
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
    tides: ["tide_alpha"],
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
    expect(formatTypeLine(card)).toBe("Event \u2014 Spell");
  });
});

import { describe, expect, it } from "vitest";
import { applySymbolReplacements } from "./symbol-replacements";

describe("applySymbolReplacements", () => {
  it("replaces a trigger sequence with its glyph", () => {
    const result = applySymbolReplacements("\\e", 2);
    expect(result.value).toBe("●");
    expect(result.caret).toBe(1);
  });

  it("replaces every supported sequence", () => {
    const result = applySymbolReplacements("\\e\\c\\p\\x\\s\\f\\d\\t", 16);
    expect(result.value).toBe("●⧗⍟☾✦❖–▸");
  });

  it("replaces sequences embedded in surrounding text", () => {
    const result = applySymbolReplacements("Pay \\e to draw.", 6);
    expect(result.value).toBe("Pay ● to draw.");
    // Caret was just after "\e"; it follows the glyph.
    expect(result.caret).toBe(5);
  });

  it("leaves the caret ahead of a later replacement untouched", () => {
    const result = applySymbolReplacements("a \\e b", 1);
    expect(result.value).toBe("a ● b");
    expect(result.caret).toBe(1);
  });

  it("parks the caret after the glyph when it sat inside the sequence", () => {
    const result = applySymbolReplacements("\\e", 1);
    expect(result.value).toBe("●");
    expect(result.caret).toBe(1);
  });

  it("returns the input unchanged when no sequence is present", () => {
    const result = applySymbolReplacements("plain text", 3);
    expect(result.value).toBe("plain text");
    expect(result.caret).toBe(3);
  });

  it("replaces repeated occurrences of the same sequence", () => {
    const result = applySymbolReplacements("\\e\\e", 4);
    expect(result.value).toBe("●●");
    expect(result.caret).toBe(2);
  });

  it("replaces the multi-character comparison sequences", () => {
    const lte = applySymbolReplacements("\\lte", 4);
    expect(lte.value).toBe("≤");
    expect(lte.caret).toBe(1);

    const gte = applySymbolReplacements("\\gte", 4);
    expect(gte.value).toBe("≥");
    expect(gte.caret).toBe(1);
  });

  it("replaces comparison sequences embedded in surrounding text", () => {
    const result = applySymbolReplacements("spark \\gte 3", 10);
    expect(result.value).toBe("spark ≥ 3");
    // Caret was just after "\gte"; it follows the glyph.
    expect(result.caret).toBe(7);
  });
});

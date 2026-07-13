// Unit tests for the pure TSX tokenizer behind the /cumulus usage-snippet
// highlighter. The tokenizer is the only real logic in syntax-highlight.tsx
// (highlightTsx is a thin map to colored spans), so classification is verified
// here directly without rendering.

import { describe, expect, it } from "vitest";
import { tokenizeTsx } from "./syntax-highlight";

/** Collect the values classified under a given token type. */
function valuesOfType(code: string, type: string): string[] {
  return tokenizeTsx(code)
    .filter((token) => token.type === type)
    .map((token) => token.value);
}

/** Concatenating every token's value must reproduce the input exactly — the
 * tokenizer partitions the source, never drops or duplicates a character. */
function roundTrips(code: string): boolean {
  return tokenizeTsx(code)
    .map((token) => token.value)
    .join("") === code;
}

describe("tokenizeTsx", () => {
  it("preserves the source exactly (lossless partition)", () => {
    const code = `import { Button } from "x";\n<Button size="md" cost={100} />`;
    expect(roundTrips(code)).toBe(true);
  });

  it("classifies keywords", () => {
    const kws = valuesOfType(`import { Button } from "x";`, "keyword");
    expect(kws).toContain("import");
    expect(kws).toContain("from");
  });

  it("classifies string literals", () => {
    expect(valuesOfType(`<Button size="md" />`, "string")).toContain('"md"');
  });

  it("classifies a JSX element name and a capitalized reference as a tag", () => {
    const tags = valuesOfType(`<Button />`, "tag");
    expect(tags).toContain("Button");
  });

  it("classifies a bare attribute inside a tag, but not an identifier in an expression", () => {
    const code = `<Button size="md" onClick={beginBattle} />`;
    const attrs = valuesOfType(code, "attr");
    expect(attrs).toContain("size");
    expect(attrs).toContain("onClick");
    // `beginBattle` sits inside a {…} expression, so it is NOT an attribute.
    expect(attrs).not.toContain("beginBattle");
  });

  it("classifies numbers", () => {
    expect(valuesOfType(`cost={100}`, "number")).toContain("100");
  });

  it("classifies line comments", () => {
    const comments = valuesOfType(`// a note\n<Button />`, "comment");
    expect(comments.some((c) => c.startsWith("//"))).toBe(true);
  });
});

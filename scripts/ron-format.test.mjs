// @vitest-environment node

import { describe, expect, it } from "vitest";
import { formatRon } from "./ron-format.mjs";

const options = { indentWidth: 2, printWidth: 60 };

describe("RON formatter", () => {
  it("keeps short nested values dense and wraps long records", () => {
    const source = `Catalog( title: "A deliberately long catalog title", entries: [ Entry( id: "one", point: ( x: 1, y: 2, ), ), ], )`;

    expect(formatRon(source, options)).toBe(`Catalog(
  title: "A deliberately long catalog title",

  entries: [Entry(id: "one", point: (x: 1, y: 2))],
)
`);
  });

  it("preserves comments and literal contents while changing whitespace", () => {
    const source = `(\n    // Field guidance.\n    text: r#"first line\nsecond: [line]"#,\n    nested: /* exact comment */ ( value: "// not a comment", ),\n)`;
    const formatted = formatRon(source, options);

    expect(formatted).toBe(`(
  // Field guidance.
  text: r#"first line
second: [line]"#,

  nested: /* exact comment */ (value: "// not a comment"),
)
`);
    expect(formatted).toContain("// Field guidance.");
    expect(formatted).toContain('r#"first line\nsecond: [line]"#');
    expect(formatted).toContain("/* exact comment */");
  });

  it("wraps line comments without changing string literals", () => {
    const source = `Catalog(
      // This guidance is deliberately long enough to wrap cleanly at word boundaries.
      text: "A deliberately long string literal that remains exactly as authored even beyond the configured width",
    )`;

    expect(formatRon(source, options)).toBe(`Catalog(
  // This guidance is deliberately long enough to wrap
  // cleanly at word boundaries.
  text: "A deliberately long string literal that remains exactly as authored even beyond the configured width",
)
`);
  });

  it("separates a leading file comment from the top-level value", () => {
    const source = `// Catalog guidance.\n// More guidance.\n#![enable(implicit_some)]\nCatalog(value: 1)`;

    expect(formatRon(source, options)).toBe(`// Catalog guidance.
// More guidance.

#![enable(implicit_some)]
Catalog(value: 1)
`);
  });

  it("separates top-level record fields with blank lines", () => {
    const source = `Catalog(
      first: 1,
      // Why the second field exists.
      second: 2,
      entries: [Entry(id: "one")],
    )`;

    expect(formatRon(source, options)).toBe(`Catalog(
  first: 1,

  // Why the second field exists.
  second: 2,

  entries: [Entry(id: "one")],
)
`);
  });

  it("does not separate single-line named records in top-level lists", () => {
    const source = `[
      CardDefinition(id: "one"),
      CardDefinition(id: "two"),
    ]`;

    expect(formatRon(source, options)).toBe(
      `[CardDefinition(id: "one"), CardDefinition(id: "two")]\n`,
    );
  });

  it("separates named records in nested lists without separating atom entries", () => {
    const source = `Catalog(
      entries: [
        AffiliationDefinition(id: "one", signature_card_ids: ["alpha", "beta"]),
        AffiliationDefinition(id: "two", signature_card_ids: ["gamma", "delta"]),
      ],
    )`;

    expect(formatRon(source, options)).toBe(`Catalog(
  entries: [
    AffiliationDefinition(
      id: "one",
      signature_card_ids: ["alpha", "beta"],
    ),

    AffiliationDefinition(
      id: "two",
      signature_card_ids: ["gamma", "delta"],
    ),
  ],
)
`);
  });

  it("does not separate single-line named records in a wrapped nested list", () => {
    const source = `Catalog(cards: [CardCopies(id: "first", copies: 2), CardCopies(id: "second", copies: 1)])`;

    expect(formatRon(source, options)).toBe(`Catalog(
  cards: [
    CardCopies(id: "first", copies: 2),
    CardCopies(id: "second", copies: 1),
  ],
)
`);
  });

  it("is idempotent", () => {
    const source = `#![enable(implicit_some)]\n[\n  Thing( a: 1, b: [2, 3], ),\n]`;
    const once = formatRon(source, options);

    expect(formatRon(once, options)).toBe(once);
  });

  it("keeps the comma that distinguishes a single-element tuple", () => {
    expect(formatRon("[(1,), (field: 1,)]", options)).toBe(
      "[(1,), (field: 1)]\n",
    );
  });

  it("normalizes safe trailing commas according to group layout", () => {
    expect(
      formatRon("Record(first: 1, second: 2)", {
        indentWidth: 2,
        printWidth: 20,
      }),
    ).toBe(`Record(
  first: 1,

  second: 2,
)
`);
  });

  it("rejects unbalanced delimiters", () => {
    expect(() => formatRon("[(])", options)).toThrow(
      "Expected closing delimiter )",
    );
  });
});

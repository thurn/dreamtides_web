// @vitest-environment node

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  patchRenderedCardsToml,
  readEditorCards,
  refreshCardDataJson,
  validateCardEdit,
} from "./card-editor-data.mjs";
import { transformCard } from "./setup-assets.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const SPECIAL_ID = "33333333-3333-4333-8333-333333333333";
const BANE_ID = "44444444-4444-4444-8444-444444444444";

function fixtureToml() {
  return `[[cards]]
name = "First Card"
id = "${FIRST_ID}"
tides = ["event_chain"]
rendered-text = "Draw a card."
energy-cost = 1
card-type = "Event"
subtype = ""
is-fast = false
spark = ""
image-number = 1001
art-owned = true
card-number = 7

[[cards]]
name = "Second Card"
id = "${SECOND_ID}"
tides = ["void_recursion"]
rendered-text = """
Line one.

spark = 99
subtype = "Wrong Target"
energy-cost = 99

Line three.
"""
energy-cost = 2
card-type = "Character"
subtype = "Guide"
is-fast = false
spark = 1
image-number = 1002
art-owned = false
card-number = 7

[[cards]]
name = "Void Indicator"
id = "${SPECIAL_ID}"
tides = ["special"]
rendered-text = "Filtered from runtime JSON."
energy-cost = "*"
card-type = "Event"
subtype = ""
rarity = "Special"
is-fast = false
spark = "*"
image-number = 1003
art-owned = false
card-number = 999

[[cards]]
name = "Nightmare"
id = "${BANE_ID}"
tides = ["bane"]
rendered-text = "Bane text."
energy-cost = 0
card-type = "Event"
subtype = ""
rarity = "Special"
is-fast = false
spark = ""
image-number = 1004
art-owned = false
card-number = 1000
`;
}

function writeFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "quest-card-editor-data-"));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(join(rootDir, "data", "tabula", "rendered-cards.toml"), fixtureToml());
  writeFileSync(join(rootDir, "public", "untouched.json"), '{"keep":true}\n');
  return rootDir;
}

function blockFor(source, id) {
  const blocks = source.split(/(?=^\[\[cards\]\]$)/m).filter(Boolean);
  const block = blocks.find((candidate) => candidate.includes(`id = "${id}"`));
  if (block === undefined) {
    throw new Error(`Missing block for ${id}`);
  }
  return block;
}

describe("readEditorCards", () => {
  it("loads every source card in TOML order, including Special records filtered from runtime JSON", () => {
    const rootDir = writeFixtureRoot();

    const cards = readEditorCards({ rootDir });

    expect(cards.map((card) => card.id)).toEqual([FIRST_ID, SECOND_ID, SPECIAL_ID, BANE_ID]);
    expect(cards.at(-2)).toMatchObject({
      id: SPECIAL_ID,
      cardNumber: 999,
      rarity: "Special",
      preview: {
        id: SPECIAL_ID,
        cardNumber: 999,
        energyCost: null,
        spark: null,
      },
    });
  });

  it("exposes UUID identity separately from cardNumber content metadata", () => {
    const rootDir = writeFixtureRoot();

    const cards = readEditorCards({ rootDir });

    expect(cards[0]).toMatchObject({
      id: FIRST_ID,
      cardNumber: 7,
      "energy-cost": 1,
      name: "First Card",
      spark: "",
      "rendered-text": "Draw a card.",
      preview: transformCard(cards[0].source),
    });
    expect(cards[1]).toMatchObject({
      id: SECOND_ID,
      cardNumber: 7,
    });
  });
});

describe("validateCardEdit", () => {
  it("accepts non-negative integer and variable energy costs", () => {
    expect(validateCardEdit("energy-cost", "0")).toMatchObject({ ok: true, value: 0 });
    expect(validateCardEdit("energy-cost", 7)).toMatchObject({ ok: true, value: 7 });
    expect(validateCardEdit("energy-cost", "X")).toMatchObject({ ok: true, value: "*" });
    expect(validateCardEdit("energy-cost", "*")).toMatchObject({ ok: true, value: "*" });
  });

  it("rejects negative, fractional, and non-numeric energy costs", () => {
    expect(validateCardEdit("energy-cost", "-1").ok).toBe(false);
    expect(validateCardEdit("energy-cost", "1.5").ok).toBe(false);
    expect(validateCardEdit("energy-cost", "abc").ok).toBe(false);
    expect(validateCardEdit("energy-cost", "x").ok).toBe(false);
    expect(validateCardEdit("energy-cost", [1]).ok).toBe(false);
    expect(validateCardEdit("energy-cost", null).ok).toBe(false);
  });

  it("accepts non-negative integer, variable, and blank spark values", () => {
    expect(validateCardEdit("spark", "0")).toMatchObject({ ok: true, value: 0 });
    expect(validateCardEdit("spark", 3)).toMatchObject({ ok: true, value: 3 });
    expect(validateCardEdit("spark", "X")).toMatchObject({ ok: true, value: "*" });
    expect(validateCardEdit("spark", "*")).toMatchObject({ ok: true, value: "*" });
    expect(validateCardEdit("spark", "   ")).toMatchObject({ ok: true, value: "" });
  });

  it("rejects negative, fractional, and non-numeric spark values", () => {
    expect(validateCardEdit("spark", "-1").ok).toBe(false);
    expect(validateCardEdit("spark", "1.5").ok).toBe(false);
    expect(validateCardEdit("spark", "abc").ok).toBe(false);
    expect(validateCardEdit("spark", "x").ok).toBe(false);
    expect(validateCardEdit("spark", []).ok).toBe(false);
    expect(validateCardEdit("spark", {}).ok).toBe(false);
  });

  it("rejects empty card names after trimming surrounding input whitespace", () => {
    expect(validateCardEdit("name", "  Better Name  ")).toMatchObject({
      ok: true,
      value: "Better Name",
    });
    expect(validateCardEdit("name", "   ").ok).toBe(false);
  });

  it("rejects non-string values for text fields", () => {
    for (const field of ["name", "subtype", "rendered-text"]) {
      expect(validateCardEdit(field, null)).toMatchObject({ ok: false, field });
      expect(validateCardEdit(field, ["text"]).ok).toBe(false);
      expect(validateCardEdit(field, { text: "value" }).ok).toBe(false);
    }
  });

  it("accepts rendered text containing TOML string delimiter markers", () => {
    expect(validateCardEdit("rendered-text", 'Before\n""" after')).toMatchObject({
      ok: true,
      value: 'Before\n""" after',
    });
    expect(validateCardEdit("rendered-text", "Before\n''' after")).toMatchObject({
      ok: true,
      value: "Before\n''' after",
    });
  });
});

describe("patchRenderedCardsToml", () => {
  it("locates the target card by UUID rather than card-number", () => {
    const source = fixtureToml();

    const patched = patchRenderedCardsToml(source, {
      cardId: SECOND_ID,
      field: "name",
      value: "Renamed By UUID",
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0].name).toBe("First Card");
    expect(parsed.cards[1].name).toBe("Renamed By UUID");
  });

  it("locates the target card by top-level UUID rather than id-looking rendered text", () => {
    const source = `[[cards]]
name = "Decoy"
id = "decoy-id"
rendered-text = """
id = "${SECOND_ID}"
"""
energy-cost = 1
card-type = "Event"
subtype = ""
spark = ""
card-number = 1

[[cards]]
name = "Actual Target"
id = "${SECOND_ID}"
rendered-text = "Target text."
energy-cost = 2
card-type = "Event"
subtype = ""
spark = ""
card-number = 2
`;

    const patched = patchRenderedCardsToml(source, {
      cardId: SECOND_ID,
      field: "name",
      value: "Patched Target",
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0].name).toBe("Decoy");
    expect(parsed.cards[0]["rendered-text"]).toContain(`id = "${SECOND_ID}"`);
    expect(parsed.cards[1].name).toBe("Patched Target");
  });

  it("locates cards with inline comments on the table header and id line", () => {
    const source = `[[cards]] # primary card
name = "Commented Card"
id = "${FIRST_ID}" # stable UUID
rendered-text = "Commented source."
energy-cost = 1
card-type = "Event"
subtype = ""
spark = ""
card-number = 1

[[cards]]
name = "Later Card"
id = "${SECOND_ID}"
rendered-text = "Later source."
energy-cost = 2
card-type = "Event"
subtype = ""
spark = ""
card-number = 2
`;

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "name",
      value: "Patched Commented Card",
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0].name).toBe("Patched Commented Card");
    expect(parsed.cards[1].name).toBe("Later Card");
  });

  it("changes only the target UUID block and leaves unrelated blocks byte-for-byte identical", () => {
    const source = fixtureToml();

    const patched = patchRenderedCardsToml(source, {
      cardId: SECOND_ID,
      field: "subtype",
      value: "Oracle",
    });

    expect(blockFor(patched.source, FIRST_ID)).toBe(blockFor(source, FIRST_ID));
    expect(blockFor(patched.source, SPECIAL_ID)).toBe(blockFor(source, SPECIAL_ID));
    expect(blockFor(patched.source, SECOND_ID)).not.toBe(blockFor(source, SECOND_ID));
    expect(parse(patched.source).cards[1].subtype).toBe("Oracle");
  });

  it("patches a later card after an earlier ordinary string contains triple single quotes", () => {
    const source = fixtureToml();

    const firstPatched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "subtype",
      value: "Subtype ''' marker",
    }).source;
    const secondPatched = patchRenderedCardsToml(firstPatched, {
      cardId: SECOND_ID,
      field: "name",
      value: "Later Card",
    });
    const parsed = parse(secondPatched.source);

    expect(parsed.cards[0].subtype).toBe("Subtype ''' marker");
    expect(parsed.cards[0].name).toBe("First Card");
    expect(parsed.cards[1].name).toBe("Later Card");
  });

  it("patches a later card after an earlier ordinary string contains triple double quotes", () => {
    const source = fixtureToml();

    const firstPatched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "subtype",
      value: 'Subtype """ marker',
    }).source;
    const secondPatched = patchRenderedCardsToml(firstPatched, {
      cardId: SECOND_ID,
      field: "name",
      value: "Later Card",
    });
    const parsed = parse(secondPatched.source);

    expect(parsed.cards[0].subtype).toBe('Subtype """ marker');
    expect(parsed.cards[0].name).toBe("First Card");
    expect(parsed.cards[1].name).toBe("Later Card");
  });

  it("patches spark, subtype, and energy-cost fields outside assignment-looking rendered text", () => {
    const source = fixtureToml();

    const sparkPatched = patchRenderedCardsToml(source, {
      cardId: SECOND_ID,
      field: "spark",
      value: 4,
    }).source;
    const subtypePatched = patchRenderedCardsToml(sparkPatched, {
      cardId: SECOND_ID,
      field: "subtype",
      value: "Oracle",
    }).source;
    const costPatched = patchRenderedCardsToml(subtypePatched, {
      cardId: SECOND_ID,
      field: "energy-cost",
      value: 3,
    }).source;
    const parsed = parse(costPatched);

    expect(parsed.cards[1]["rendered-text"]).toContain("spark = 99");
    expect(parsed.cards[1]["rendered-text"]).toContain('subtype = "Wrong Target"');
    expect(parsed.cards[1]["rendered-text"]).toContain("energy-cost = 99");
    expect(parsed.cards[1].spark).toBe(4);
    expect(parsed.cards[1].subtype).toBe("Oracle");
    expect(parsed.cards[1]["energy-cost"]).toBe(3);
  });

  it("patches following top-level fields after an escaped delimiter in multiline basic rendered text", () => {
    const source = String.raw`[[cards]]
name = "Escaped Delimiter"
id = "${FIRST_ID}"
rendered-text = """
Text with an escaped delimiter: \""" marker.
"""
energy-cost = 1
card-type = "Event"
subtype = ""
spark = ""
card-number = 1

[[cards]]
name = "Later Card"
id = "${SECOND_ID}"
rendered-text = "Later source."
energy-cost = 2
card-type = "Event"
subtype = ""
spark = ""
card-number = 2
`;

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "energy-cost",
      value: 4,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe('Text with an escaped delimiter: """ marker.\n');
    expect(parsed.cards[0]["energy-cost"]).toBe(4);
    expect(parsed.cards[1].name).toBe("Later Card");
  });

  it("replaces multiline basic rendered text with escaped delimiters without leaving stale content", () => {
    const source = String.raw`[[cards]]
name = "Escaped Delimiter"
id = "${FIRST_ID}"
rendered-text = """
Text with an escaped delimiter: \""" marker.
stale content.
"""
energy-cost = 1
card-type = "Event"
subtype = ""
spark = ""
card-number = 1
`;
    const renderedText = "Fresh text.";

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
    expect(patched.source).not.toContain("stale content.");
  });

  it("patches multiline rendered text with parseable TOML and preserved newline content", () => {
    const source = fixtureToml();
    const renderedText = "First line.\n\nSecond line with \"quotes\".";

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
    expect(patched.source).toContain("rendered-text = '''\nFirst line.\n\nSecond line with \"quotes\".'''");
  });

  it("patches multiline rendered text with a trailing backslash before a newline without folding it", () => {
    const source = fixtureToml();
    const renderedText = "keep slash\\\nkeep newline";

    expect(validateCardEdit("rendered-text", renderedText)).toMatchObject({
      ok: true,
      value: renderedText,
    });

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
  });

  it('patches one-line rendered text containing triple double quotes', () => {
    const source = fixtureToml();
    const renderedText = 'One-line """ marker.';

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
  });

  it("patches one-line rendered text containing triple single quotes", () => {
    const source = fixtureToml();
    const renderedText = "One-line ''' marker.";

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
  });

  it("patches multiline rendered text containing quote markers and a trailing backslash before newline", () => {
    const source = fixtureToml();
    const renderedText = "First \"\"\" marker.\nSecond ''' marker.\nkeep slash\\\nkeep newline";

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
  });

  it("patches multiline rendered text containing NUL without raw-control parse failure", () => {
    const source = fixtureToml();
    const renderedText = "a\n\u0000";

    expect(validateCardEdit("rendered-text", renderedText)).toMatchObject({
      ok: true,
      value: renderedText,
    });

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
    expect(patched.source).toContain("\\u0000");
  });

  it("patches one-line rendered text containing DEL without raw-control parse failure", () => {
    const source = fixtureToml();
    const renderedText = "a\u007f";

    expect(validateCardEdit("rendered-text", renderedText)).toMatchObject({
      ok: true,
      value: renderedText,
    });

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
    expect(patched.source).toContain("\\u007F");
  });

  it("patches top-level fields after literal multiline rendered text contains assignment-looking lines", () => {
    const source = fixtureToml();
    const renderedText = "Intro.\n\nspark = 99\nenergy-cost = 99\n\nOutro.";

    const textPatched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    }).source;
    const sparkPatched = patchRenderedCardsToml(textPatched, {
      cardId: FIRST_ID,
      field: "spark",
      value: 5,
    }).source;
    const parsed = parse(sparkPatched);

    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
    expect(parsed.cards[0].spark).toBe(5);
  });

  it("patches top-level fields after multiline rendered text contains a cards block-looking line", () => {
    const source = fixtureToml();
    const renderedText = "Intro.\n[[cards]]\nenergy-cost = 99\nOutro.";

    const textPatched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: renderedText,
    }).source;
    const costPatched = patchRenderedCardsToml(textPatched, {
      cardId: FIRST_ID,
      field: "energy-cost",
      value: 4,
    }).source;
    const parsed = parse(costPatched);

    expect(parsed.cards).toHaveLength(4);
    expect(parsed.cards[0]["rendered-text"]).toBe(renderedText);
    expect(parsed.cards[0]["energy-cost"]).toBe(4);
  });

  it("does not patch metadata fields after a final card missing the target field", () => {
    const source = `[[cards]]
id = "${FIRST_ID}"
rendered-text = "Missing a card name."
energy-cost = 1
card-type = "Event"
subtype = ""
spark = ""
card-number = 1

[metadata]
source = "test fixture"

[[metadata.derived_columns]]
name = "Metadata Name"
expression = "cards.name"
`;
    let patchedSource = source;

    expect(() => {
      patchedSource = patchRenderedCardsToml(source, {
        cardId: FIRST_ID,
        field: "name",
        value: "Patched Card Name",
      }).source;
    }).toThrow("Field name was not found in target card block");

    expect(patchedSource).toBe(source);
    expect(parse(source).metadata.derived_columns[0].name).toBe("Metadata Name");
  });

  it("replaces the full literal multiline rendered text on a second multiline patch", () => {
    const source = fixtureToml();
    const firstRenderedText = "First line.\n\nspark = 99\nstale content.";
    const secondRenderedText = "Second line.\n\nenergy-cost = 99\nfresh content.";

    const firstPatched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: firstRenderedText,
    }).source;
    const secondPatched = patchRenderedCardsToml(firstPatched, {
      cardId: FIRST_ID,
      field: "rendered-text",
      value: secondRenderedText,
    }).source;
    const parsed = parse(secondPatched);

    expect(parsed.cards[0]["rendered-text"]).toBe(secondRenderedText);
    expect(secondPatched).not.toContain("stale content.");
    expect(secondPatched).toContain("fresh content.");
  });

  it("canonicalizes variable energy-cost values before writing TOML", () => {
    const source = fixtureToml();

    const patched = patchRenderedCardsToml(source, {
      cardId: FIRST_ID,
      field: "energy-cost",
      value: "X",
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[0]["energy-cost"]).toBe("*");
    expect(transformCard(parsed.cards[0]).energyCost).toBeNull();
    expect(patched.source).toContain('energy-cost = "*"');
    expect(patched.source).not.toContain('energy-cost = "X"');
  });

  it("canonicalizes blank spark values before writing TOML", () => {
    const source = fixtureToml();

    const patched = patchRenderedCardsToml(source, {
      cardId: SECOND_ID,
      field: "spark",
      value: "   ",
    });
    const parsed = parse(patched.source);

    expect(parsed.cards[1].spark).toBe("");
    expect(patched.source).toContain('spark = ""');
  });
});

describe("refreshCardDataJson", () => {
  it("writes focused runtime card JSON with setup-assets filtering and transform normalization", () => {
    const rootDir = writeFixtureRoot();

    const result = refreshCardDataJson({ rootDir });
    const cards = JSON.parse(readFileSync(join(rootDir, "public", "card-data.json"), "utf8"));

    expect(result).toMatchObject({ count: 3 });
    expect(cards).toEqual([
      transformCard(parse(fixtureToml()).cards[0]),
      transformCard(parse(fixtureToml()).cards[1]),
      transformCard(parse(fixtureToml()).cards[3]),
    ]);
    expect(cards.map((card) => card.name)).toContain("Nightmare");
    expect(readFileSync(join(rootDir, "public", "untouched.json"), "utf8")).toBe('{"keep":true}\n');
  });
});

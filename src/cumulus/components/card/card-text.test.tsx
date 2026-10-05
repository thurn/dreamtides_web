import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GLOSSARY,
  GLOSSARY_IDS,
  glossaryRulesTextForms,
  type GlossaryCatalogEntry,
} from "../../../data/glossary";
import { getLogEntries, resetLog } from "../../../logging";
import { testGlossaryEntryId } from "../../../types/test-identities";
import { annotatedFixture } from "../../testing/annotated-text";
import {
  tokenizeRulesSymbols,
  tokenizeRulesText,
  type TextSegment,
} from "./card-text";
import { glossaryInfoCard } from "./glossary-info-card";
import { renderRichText, richText } from "./rich-text";
import { isHighlightedRulesTextTerm } from "./RulesText";
import { glossaryDefinitionsCardModel } from "./rules-text-reveal";

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

function collectSymbols(
  segments: TextSegment[],
): Extract<TextSegment, { kind: "symbol" }>[] {
  return flatten(segments).filter(
    (segment): segment is Extract<TextSegment, { kind: "symbol" }> =>
      segment.kind === "symbol",
  );
}

function hasTerm(segments: TextSegment[], word: string): boolean {
  return flatten(segments).some(
    (segment) => segment.kind === "term" && segment.word === word,
  );
}

/** Reconstructed text of the top-level nobreak group containing `contains`. */
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

describe("tokenizeRulesSymbols", () => {
  it("isolates raw symbol tokens without decorating surrounding prose", () => {
    const source =
      "Essence at the draft site: Reclaim 0●, then gain 1✦ and 2⍟.";
    const result = tokenizeRulesSymbols(source);

    expect(reconstructText(result)).toBe(source);
    expect(
      flatten(result).filter(
        (segment) =>
          segment.kind === "term" ||
          segment.kind === "essence" ||
          segment.kind === "siteName",
      ),
    ).toEqual([]);
    expect(collectSymbols(result).map((segment) => segment.symbol)).toEqual([
      "energy",
      "spark",
      "points",
    ]);
  });
});

describe("tokenizeRulesText", () => {
  it("returns plain text unchanged and nothing for an empty string", () => {
    expect(tokenizeRulesText("Deal 3 damage.")).toEqual([
      { kind: "text", value: "Deal 3 damage." },
    ]);
    expect(tokenizeRulesText("")).toEqual([]);
  });

  // The icon-binding pass only regroups segments, it never adds or drops
  // characters.
  it("round-trips the visible text through tokenize + reconstruct", () => {
    for (const text of [
      "Pay ●2 to gain 1✦.",
      "When you abandon an ally, trigger its ▸Materialized and ▸Dawn abilities.",
      "▸Judgment: gain 2⍟.",
      "Gain ⍏10.",
      "❖ — Draw a card.",
      "❖❖ — Abandon an ally: gain ⍏2.",
    ]) {
      expect(reconstructText(tokenizeRulesText(text))).toBe(text);
    }
  });

  it("identifies each rules symbol and its glossary entry", () => {
    expect(tokenizeRulesText("●")).toEqual([
      { kind: "symbol", symbol: "energy", char: "●" },
    ]);
    expect(tokenizeRulesText("⍏")).toEqual([
      { kind: "symbol", symbol: "spark", char: "⍏" },
    ]);
    expect(collectSymbols(tokenizeRulesText("Gain ⍏1."))).toContainEqual({
      kind: "symbol",
      symbol: "spark",
      char: "⍏",
    });
    expect(collectSymbols(tokenizeRulesText("▸When played:"))).toContainEqual(
      { kind: "symbol", symbol: "trigger", char: "▸" },
    );
    for (const [text, symbol, char, glossaryId] of [
      ["Gain 2⍟.", "points", "⍟", GLOSSARY_IDS.points],
      ["☾: Draw a card.", "lunar", "☾", GLOSSARY_IDS.exhaustCost],
      ["Store 1⧗.", "store", "⧗", GLOSSARY_IDS.memory],
    ] as const) {
      const found = collectSymbols(tokenizeRulesText(text)).find(
        (segment) => segment.symbol === symbol,
      );
      expect(found).toMatchObject({ kind: "symbol", symbol, char });
      expect(found?.entry?.id).toBe(glossaryId);
    }
  });

  it("collapses ❖ and ❖❖ timing markers into one bolt segment with a count", () => {
    expect(
      flatten(tokenizeRulesText("❖ — 1●: Move this character.")).filter(
        (s) => s.kind === "bolt",
      ),
    ).toEqual([{ kind: "bolt", count: 1 }]);
    expect(tokenizeRulesText("❖❖ — Abandon an ally: Effect.")[0]).toEqual({
      kind: "bolt",
      count: 2,
    });
  });

  // Every inline icon stays on one line with the text it reads with.
  it("binds each icon to its value and leading word in a nobreak group", () => {
    for (const [text, symbol, group] of [
      ["Pay ●2.", "●", "●2."],
      ["it gains +2✦ each turn.", "✦", "gains +2✦"],
      ["Gain 2⍟.", "⍟", "Gain 2⍟."],
      ["the next card costs 2 ● less.", "●", "costs 2 ●"],
      ["play a ≤2● card.", "●", "a ≤2●"],
    ] as const) {
      expect(nobreakContaining(tokenizeRulesText(text), symbol)).toBe(group);
    }
  });

  it("binds a leading glossary term to a value while keeping it a term", () => {
    const entry = BARE_ENTRIES[0];
    const result = tokenizeRulesText(`${entry.term} X● to draw.`);
    expect(nobreakContaining(result, "●")).toBe(`${entry.term} X●`);
    expect(hasTerm(result, entry.term)).toBe(true);
  });

  it("keeps a no-space trigger arrow glued to its keyword term", () => {
    const entry = ARROW_TRIGGERS[0];
    const result = tokenizeRulesText(`trigger its ${entry.term} ability.`);
    expect(nobreakContaining(result, "▸")).toBe(entry.term);
    expect(hasTerm(result, entry.term.slice(1))).toBe(true);
  });

  it("groups every arrow trigger keyword with the arrow and wraps them as terms", () => {
    for (const entry of ARROW_TRIGGERS) {
      const keyword = entry.term.slice(1);
      const result = tokenizeRulesText(`▸ ${keyword}: Effect.`);
      expect(result[0]).toEqual({
        kind: "nobreak",
        segments: [
          { kind: "symbol", symbol: "trigger", char: "▸" },
          { kind: "term", word: keyword, entry },
          { kind: "text", value: ":" },
        ],
      });
    }
  });

  it("normalizes legacy whitespace after a trigger arrow", () => {
    expect(reconstructText(tokenizeRulesText("▸ Dawn: Gain 1●."))).toBe(
      "▸Dawn: Gain 1●.",
    );
    expect(reconstructText(tokenizeRulesText("▸ when played: Draw."))).toBe(
      "▸when played: Draw.",
    );
  });

  it("wraps recognized glossary terms, including lowercase forms", () => {
    const [first, second] = BARE_ENTRIES;
    const keyword = first.term.toLowerCase();
    expect(tokenizeRulesText(`${keyword} this card.`)).toEqual([
      { kind: "term", word: keyword, entry: first },
      { kind: "text", value: " this card." },
    ]);
    expect(tokenizeRulesText(`${first.term} with ${second.term}.`)).toEqual([
      { kind: "term", word: first.term, entry: first },
      { kind: "text", value: " with " },
      { kind: "term", word: second.term, entry: second },
      { kind: "text", value: "." },
    ]);
  });

  it("matches plural and past-tense variants", () => {
    const variant = (PLURAL_ENTRY?.variants ?? []).find((v) =>
      /^[a-z]+$/.test(v),
    );
    expect(variant).toBeDefined();
    expect(
      hasTerm(tokenizeRulesText(`This ${variant!} character.`), variant!),
    ).toBe(true);
  });
});

describe("isHighlightedRulesTextTerm", () => {
  // Emphasis is keyed on the word as written: the verb `dissolve` is
  // emphasized, while the `▸Dissolved` trigger and past tense are not.
  it("matches case-insensitively on the word form as written", () => {
    expect(isHighlightedRulesTextTerm("Dissolve")).toBe(true);
    expect(isHighlightedRulesTextTerm("DISSOLVE")).toBe(true);
    expect(isHighlightedRulesTextTerm("Dissolved")).toBe(false);
  });
});

describe("glossaryDefinitionsCardModel", () => {
  function entry(
    idSeed: string,
    term: string,
    presentation: Pick<
      GlossaryCatalogEntry,
      "definitionSymbol" | "termPresentation"
    > = {},
  ): GlossaryCatalogEntry {
    return {
      id: testGlossaryEntryId(idSeed),
      category: "Keywords",
      term,
      definition: `${term} definition.`,
      priority: 0,
      matchesTermInRulesText: false,
      variants: [],
      ...presentation,
    };
  }

  it("attaches rule symbols and presentation to definition rows in order", () => {
    const card = glossaryDefinitionsCardModel([
      entry("fast", "Fast", { definitionSymbol: "fast" }),
      entry("exhaust-cost", "Exhaust Cost", {
        definitionSymbol: "exhaust",
        termPresentation: "symbolOnly",
      }),
      entry("void", "Void"),
    ]);

    expect(card?.body).toEqual({
      kind: "definitions",
      entries: [
        {
          term: "Fast",
          definition: "Fast definition.",
          symbol: "fast",
          termPresentation: undefined,
        },
        {
          term: "Exhaust Cost",
          definition: "Exhaust Cost definition.",
          symbol: "exhaust",
          termPresentation: "symbolOnly",
        },
        {
          term: "Void",
          definition: "Void definition.",
          symbol: undefined,
          termPresentation: undefined,
        },
      ],
    });
  });

  it("omits excluded entries and returns null when none remain", () => {
    const fast = entry("fast", "Fast", { definitionSymbol: "fast" });
    const bane = entry("bane", "Nightmare Bane");
    const card = glossaryDefinitionsCardModel(
      [fast, bane],
      [testGlossaryEntryId("fast"), testGlossaryEntryId("interrupt")],
    );
    expect(
      card?.body?.kind === "definitions"
        ? card.body.entries.map((row) => row.term)
        : null,
    ).toEqual(["Nightmare Bane"]);
    expect(
      glossaryDefinitionsCardModel([fast], [testGlossaryEntryId("fast")]),
    ).toBeNull();
  });
});

describe("glossaryInfoCard", () => {
  const MISSING_GLOSSARY_ID = testGlossaryEntryId("missing-glossary-entry");

  beforeEach(() => {
    resetLog();
  });

  it("keeps rendering and logs a missing glossary entry exactly once", () => {
    const card = glossaryInfoCard(MISSING_GLOSSARY_ID);
    glossaryInfoCard(MISSING_GLOSSARY_ID);

    expect(card.variant).toBe("text");
    expect(
      getLogEntries().filter(
        (logged) =>
          logged.event === "glossary_entry_missing" &&
          logged.glossaryId === MISSING_GLOSSARY_ID,
      ),
    ).toHaveLength(1);
  });
});

describe("renderRichText", () => {
  it("renders markup attached to a localized placeholder", () => {
    const message = annotatedFixture(
      "Before {entity} after",
      { entity: "the entity" },
      { entity: { kind: "subject" } as const },
    );

    const markup = renderToStaticMarkup(
      renderRichText(richText.annotated(message), 0, {
        renderAnnotation: (annotation, value, key) => (
          <mark key={key} data-annotation={annotation.kind}>
            {value}
          </mark>
        ),
      }),
    );

    expect(markup).toContain(
      '<mark data-annotation="subject">the entity</mark>',
    );
  });

  it("renders definition symbols as glyphs and honors label presentation", () => {
    const markup = renderToStaticMarkup(
      <>
        {renderRichText(
          richText.definitions([
            {
              term: "Exhaust Cost",
              definition: "Exhaust (☾) this character.",
              symbol: "exhaust",
              termPresentation: "symbolOnly",
            },
            {
              term: "Points",
              definition: "Score points (⍟) when unblocked.",
              termPresentation: "definitionOnly",
            },
          ]),
        )}
      </>,
    );

    expect(markup).not.toContain("☾");
    expect(markup).not.toContain("⍟");
    expect(markup).toContain('data-definition-symbol="exhaust"');
    expect(markup).not.toContain(">Exhaust Cost</dt>");
    expect(markup).not.toContain("Points:");
  });
});

const COMPONENTS_ROOT = fileURLToPath(new URL("../", import.meta.url));

function listSourceTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceTsxFiles(path);
    }
    return entry.isFile() &&
      entry.name.endsWith(".tsx") &&
      !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

function jsxTagName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  if (ts.isJsxElement(node)) {
    return node.openingElement.tagName.getText(sourceFile);
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return node.tagName.getText(sourceFile);
  }
  return null;
}

function containsRulesText(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  return (
    jsxTagName(node, sourceFile) === "RulesText" ||
    node
      .getChildren(sourceFile)
      .some((child) => containsRulesText(child, sourceFile))
  );
}

// RulesText renders block paragraphs, so a <p> wrapper produces invalid DOM.
describe("RulesText nesting", () => {
  it("keeps block-rendered RulesText out of paragraph wrappers", () => {
    const offenders = listSourceTsxFiles(COMPONENTS_ROOT).flatMap((path) => {
      const displayPath = relative(COMPONENTS_ROOT, path).split("\\").join("/");
      const sourceFile = ts.createSourceFile(
        displayPath,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const matches: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          ts.isJsxElement(node) &&
          jsxTagName(node, sourceFile) === "p" &&
          containsRulesText(node, sourceFile)
        ) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            node.openingElement.getStart(sourceFile),
          );
          matches.push(`${displayPath}:${line + 1}:${character + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      return matches;
    });

    expect(offenders).toEqual([]);
  });
});

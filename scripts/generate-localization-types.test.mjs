import { readFileSync } from "node:fs";
import { FluentBundle, FluentResource } from "@fluent/bundle";
import { FluentParser, Term, Visitor } from "@fluent/syntax";
import { describe, expect, it } from "vitest";
import {
  OUTPUT_PATH,
  SOURCE_PATHS,
  buildLocalizationTypesSource,
  generateLocalizationTypes,
  parseMessageContracts,
} from "./generate-localization-types.mjs";
import {
  UI_STRING_WORKAROUND_WARNING,
  formatLocalizationDiagnostics,
  validateLocalizationSource,
} from "./validate-localization-source.mjs";
import {
  combineLocalizationResources,
  loadEnglishLocalizationResources,
} from "./localization-catalog.mjs";

const INVARIANT_TERM_IDS = [
  "dreamtides",
  "dreamwell",
  "dream-atlas",
  "essence",
  "energy",
  "spark",
];

const COUNTABLE_TERM_IDS = [
  "journey",
  "dream-avatar",
  "dream-guide",
  "dreamscape",
  "dreamsign",
  "tide",
  "site",
  "reward",
  "card",
  "character",
  "event-card",
  "deck",
  "hand",
  "void",
  "figment",
  "battle",
  "player",
  "opponent",
  "turn",
  "round",
  "point",
];

class TestVariableCollector extends Visitor {
  variables = new Set();

  visitVariableReference(node) {
    this.variables.add(node.id.name);
  }
}

describe("generate-localization-types", () => {
  it("extracts message IDs and required variables from Fluent syntax", () => {
    const contracts = parseMessageContracts(`
title = Journey Complete
score = { $count } { $unit }
`);

    expect(contracts).toEqual([
      { id: "title", variables: [] },
      { id: "score", variables: ["count", "unit"] },
    ]);
  });

  it("emits typed message contracts", () => {
    const generated = buildLocalizationTypesSource([
      { id: "title", variables: [] },
      { id: "score", variables: ["count"] },
    ]);

    expect(generated).toContain('readonly "title": never;');
    expect(generated).toContain('"score",');
    expect(generated).toContain(
      'readonly "score": { readonly "count": FluentVariable };',
    );
  });

  it("rejects invalid Fluent syntax", () => {
    expect(() => parseMessageContracts("broken message")).toThrow(
      "Unable to generate localization types",
    );
  });

  it("rejects duplicate message IDs", () => {
    expect(() => parseMessageContracts("title = One\ntitle = Two\n")).toThrow(
      "Duplicate Fluent message ID: title",
    );
  });

  it("keeps the standard Fluent vocabulary explicit and inflectable", () => {
    const source = productionSource();
    const resource = new FluentParser({ withSpans: false }).parse(source);
    const terms = resource.body.filter((entry) => entry instanceof Term);
    const variablesByTerm = new Map(
      terms.map((term) => {
        const collector = new TestVariableCollector();
        collector.visit(term);
        return [term.id.name, [...collector.variables].sort()];
      }),
    );

    expect([...variablesByTerm.keys()]).toEqual([
      "dreamtides",
      "dreamwell",
      "dream-atlas",
      ...COUNTABLE_TERM_IDS,
      "essence",
      "energy",
      "spark",
    ]);
    for (const id of INVARIANT_TERM_IDS) {
      expect(variablesByTerm.get(id)).toEqual([]);
    }
    for (const id of COUNTABLE_TERM_IDS) {
      expect(variablesByTerm.get(id)).toEqual(["number"]);
    }
  });

  it("formats every standard term and both English number facets", () => {
    const source = productionSource();
    const probes = [
      ...INVARIANT_TERM_IDS.map((id) => `probe-${id} = { -${id} }`),
      ...COUNTABLE_TERM_IDS.flatMap((id) => [
        `probe-${id}-one = { -${id}(number: "one") }`,
        `probe-${id}-other = { -${id}(number: "other") }`,
      ]),
    ].join("\n");
    const bundle = new FluentBundle("en-US", { useIsolating: false });
    expect(
      bundle.addResource(new FluentResource(`${source}\n${probes}\n`)),
    ).toEqual([]);

    for (const id of INVARIANT_TERM_IDS) {
      expect(formatProbe(bundle, `probe-${id}`)).not.toBe("");
    }
    for (const id of COUNTABLE_TERM_IDS) {
      expect(formatProbe(bundle, `probe-${id}-one`)).not.toBe(
        formatProbe(bundle, `probe-${id}-other`),
      );
    }
  });

  it("rejects an English indefinite article before an interpolated value", () => {
    expect(
      validateLocalizationSource(`
unsafe-a = Choose a { $categoryName } card.
unsafe-an = Choose an { $categoryName } card.
`),
    ).toMatchObject([
      {
        messageId: "unsafe-a",
        rule: "indefinite-article-before-variable",
      },
      {
        messageId: "unsafe-an",
        rule: "indefinite-article-before-variable",
      },
    ]);
  });

  it("rejects countable terms that bypass runtime plural selection", () => {
    expect(
      validateLocalizationSource(`
bare = { $count } { -card }
fixed = { $count } { -card(number: "other") }
wrong-branch =
    { $count ->
        [one] { -card(number: "other") }
       *[other] { -card(number: "other") }
    }
semantic-other =
    { $owner ->
        [viewer] Cards
       *[other] { -card(number: "other") }
    }
`),
    ).toMatchObject([
      { messageId: "bare", rule: "countable-term-without-number-facet" },
      {
        messageId: "fixed",
        rule: "number-facet-outside-matching-selector",
      },
      {
        messageId: "wrong-branch",
        rule: "number-facet-outside-matching-selector",
      },
      {
        messageId: "semantic-other",
        rule: "number-facet-outside-matching-selector",
      },
    ]);
  });

  it("requires a default other branch for English plural selectors", () => {
    expect(
      validateLocalizationSource(`
unsafe =
    { $count ->
       *[one] { $count } copy
        [other] { $count } copies
    }
`),
    ).toMatchObject([
      {
        messageId: "unsafe",
        rule: "plural-selector-needs-default-other",
      },
    ]);
  });

  it("explains that rewriting UI copy is not an acceptable grammar fix", () => {
    const diagnostics = validateLocalizationSource(`
unsafe-article = Choose a { $categoryName } card.
unsafe-plural = { $count } { -card }
`);
    const lintOutput = formatLocalizationDiagnostics(diagnostics);

    expect(diagnostics).toHaveLength(2);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.message).toContain(UI_STRING_WORKAROUND_WARNING);
    }
    expect(lintOutput).toContain(UI_STRING_WORKAROUND_WARNING);
    expect(lintOutput).toContain("Pass a semantic discriminator");
    expect(lintOutput).toContain("Use a Fluent plural selector");
  });

  it("keeps the production catalog free of unsafe article and plural patterns", () => {
    const diagnostics = SOURCE_PATHS.flatMap((sourcePath) =>
      validateLocalizationSource(readFileSync(sourcePath, "utf8")),
    );
    expect(diagnostics, formatLocalizationDiagnostics(diagnostics)).toEqual([]);
  });

  it("keeps the committed types synchronized with the English catalog", async () => {
    expect(readFileSync(OUTPUT_PATH, "utf8")).toBe(
      await generateLocalizationTypes(),
    );
  });
});

function productionSource() {
  return combineLocalizationResources(loadEnglishLocalizationResources());
}

function formatProbe(bundle, id) {
  const pattern = bundle.getMessage(id)?.value;
  if (pattern === null || pattern === undefined) {
    throw new Error(`Missing Fluent probe: ${id}`);
  }
  return bundle.formatPattern(pattern);
}

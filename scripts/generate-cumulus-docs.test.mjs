// @vitest-environment node
//
// Unit tests for the pure core of the Cumulus agent-docs generator. Every
// assertion runs against inline fixture source text rather than the real
// registry/demo files, so these tests pin the extraction + rendering contract
// independent of which components exist in the catalog at any given time.

import { describe, expect, it } from "vitest";
import {
  INDEX_BEGIN_MARKER,
  INDEX_END_MARKER,
  extractDemoDoc,
  extractRegistryOrder,
  extractTokenNotes,
  firstSentence,
  renderComponentMarkdown,
  renderIndexSection,
  renderTokensMarkdown,
  spliceGeneratedIndex,
} from "./generate-cumulus-docs.mjs";

const REGISTRY_FIXTURE = `
import type { ComponentType } from "react";
import { alphaDemo } from "./demos/alpha";
import { betaDemo, gammaDemo } from "./demos/beta";

export const CUMULUS_COMPONENTS = [betaDemo, alphaDemo, gammaDemo];
`;

const DEMO_FIXTURE = `
import { Widget } from "../../components/Widget";
import type { CumulusComponent } from "../registry";

const localStyle = { padding: \`\${token("--space-s")}\` };

export const widgetDemo: CumulusComponent = {
  id: "widget",
  title: "Widget",
  blurb:
    "A fixture widget. It exists only for tests.",
  callout: "Prefer a real component.",
  group: "Primitives",
  docName: "Widget",
  Component: Widget,
  usage: [
    {
      label: "Basic",
      note: "The default form.",
      code: \`<Widget kind="plain" />\`,
    },
    {
      code: "<Widget kind=\\"fancy\\" />",
    },
  ],
  demo: { defaultArgs: { kind: "plain" } },
};
`;

describe("extractRegistryOrder", () => {
  it("returns entries in CUMULUS_COMPONENTS order with their import paths", () => {
    const entries = extractRegistryOrder(REGISTRY_FIXTURE, "fixture.ts");
    expect(entries).toEqual([
      { exportName: "betaDemo", modulePath: "./demos/beta" },
      { exportName: "alphaDemo", modulePath: "./demos/alpha" },
      { exportName: "gammaDemo", modulePath: "./demos/beta" },
    ]);
  });

  it("throws when an entry has no matching import", () => {
    const source = `export const CUMULUS_COMPONENTS = [mysteryDemo];`;
    expect(() => extractRegistryOrder(source, "fixture.ts")).toThrow(
      /no matching import/,
    );
  });

  it("throws when the array is missing", () => {
    expect(() => extractRegistryOrder("export const x = 1;", "f.ts")).toThrow(
      /CUMULUS_COMPONENTS/,
    );
  });
});

describe("extractDemoDoc", () => {
  it("extracts id, title, blurb, callout, group, docName, and usage", () => {
    const doc = extractDemoDoc(DEMO_FIXTURE, "fixture.tsx", "widgetDemo");
    expect(doc).toEqual({
      id: "widget",
      title: "Widget",
      blurb: "A fixture widget. It exists only for tests.",
      callout: "Prefer a real component.",
      group: "Primitives",
      docName: "Widget",
      usage: [
        {
          label: "Basic",
          note: "The default form.",
          code: '<Widget kind="plain" />',
        },
        { code: '<Widget kind="fancy" />' },
      ],
    });
  });

  it("omits callout when the demo has none", () => {
    const source = DEMO_FIXTURE.replace(
      `callout: "Prefer a real component.",\n`,
      "",
    );
    const doc = extractDemoDoc(source, "fixture.tsx", "widgetDemo");
    expect(doc.callout).toBeUndefined();
  });

  it("rejects a doc field built from a template substitution", () => {
    const source = DEMO_FIXTURE.replace(
      `blurb:\n    "A fixture widget. It exists only for tests.",`,
      "blurb: `computed ${name}`,",
    );
    expect(() => extractDemoDoc(source, "fixture.tsx", "widgetDemo")).toThrow(
      /substitution/,
    );
  });

  it("throws when the named export is missing", () => {
    expect(() => extractDemoDoc(DEMO_FIXTURE, "fixture.tsx", "nope")).toThrow(
      /could not find/,
    );
  });
});

describe("renderComponentMarkdown", () => {
  const doc = extractDemoDoc(DEMO_FIXTURE, "fixture.tsx", "widgetDemo");

  it("renders blurb, callout, props table, and usage snippets", () => {
    const markdown = renderComponentMarkdown(
      doc,
      [
        {
          name: "kind",
          tsType: '"plain" | "fancy"',
          unionMembers: ["plain", "fancy"],
          required: true,
          defaultValue: null,
          description: "Which widget | treatment to draw.",
        },
        {
          name: "view",
          tsType: "WidgetView",
          unionMembers: [],
          required: false,
          defaultValue: "undefined",
          description: "",
          nested: {
            name: "WidgetView",
            fields: [
              { name: "left", tsType: "number", optional: false, description: "Stage x." },
            ],
          },
        },
      ],
      3,
    );
    expect(markdown).toContain("# Widget");
    expect(markdown).toContain("A fixture widget.");
    expect(markdown).toContain("Real consumers: **3**");
    expect(markdown).toContain("> **Guidance:** Prefer a real component.");
    // Pipes inside type/description cells are escaped so the table row holds.
    expect(markdown).toContain('`"plain" \\| "fancy"`');
    expect(markdown).toContain("Which widget \\| treatment to draw.");
    // Nested model gets its own field table.
    expect(markdown).toContain("`WidgetView` model");
    expect(markdown).toContain("| `left` | `number` | no | Stage x. |");
    // Usage snippets render as fenced tsx blocks.
    expect(markdown).toContain("### Basic");
    expect(markdown).toContain('```tsx\n<Widget kind="plain" />\n```');
    // The unlabeled second snippet gets a positional heading.
    expect(markdown).toContain("### Variant 2");
    expect(markdown).toContain("GENERATED by scripts/generate-cumulus-docs.mjs");
  });

  it("spells out union members hidden behind a named type alias", () => {
    const markdown = renderComponentMarkdown(
      doc,
      [
        {
          name: "size",
          tsType: "WidgetSize",
          unionMembers: ["sm", "md"],
          required: false,
          defaultValue: "md",
          description: "",
        },
      ],
      3,
    );
    expect(markdown).toContain('| `WidgetSize` = `"sm" \\| "md"` |');
  });

  it("does not repeat members when the type already spells the literals", () => {
    const markdown = renderComponentMarkdown(
      doc,
      [
        {
          name: "kind",
          tsType: '"plain" | "fancy"',
          unionMembers: ["plain", "fancy"],
          required: true,
          defaultValue: null,
          description: "",
        },
      ],
      3,
    );
    expect(markdown).toContain('| `"plain" \\| "fancy"` |');
    expect(markdown).not.toContain("= `");
  });

  it("says so when a component takes no props", () => {
    const markdown = renderComponentMarkdown(doc, [], 3);
    expect(markdown).toContain("This component takes no props.");
  });

  it("uses a wider code fence for values containing backticks", () => {
    const markdown = renderComponentMarkdown(
      doc,
      [
        {
          name: "color",
          tsType: "ColorRole | `#${string}`",
          unionMembers: [],
          required: true,
          defaultValue: null,
          description: "",
        },
      ],
      3,
    );
    expect(markdown).toContain("`` ColorRole \\| `#${string}` ``");
  });
});

describe("index rendering and splicing", () => {
  const docs = [
    {
      id: "widget",
      title: "Widget",
      group: "Primitives",
      blurb: "A fixture widget. It exists only for tests.",
      usage: [],
    },
  ];

  it("renders one index row per component with a first-sentence summary", () => {
    const index = renderIndexSection(docs, new Map(docs.map((d) => [d.title, 0])));
    expect(index).toContain("| Component | Group | Consumers |");
    expect(index).toContain(
      "| Widget | Primitives | 0 | [components/widget.md](components/widget.md) | A fixture widget. |",
    );
  });

  it("replaces only the text between the markers, repeatably", () => {
    const countByTitle = new Map(docs.map((d) => [d.title, 0]));
    const skill = `# Skill\n\n${INDEX_BEGIN_MARKER}\nold content\n${INDEX_END_MARKER}\n\nAfter.\n`;
    const once = spliceGeneratedIndex(skill, renderIndexSection(docs, countByTitle));
    const twice = spliceGeneratedIndex(once, renderIndexSection(docs, countByTitle));
    expect(once).toBe(twice);
    expect(once).not.toContain("old content");
    expect(once).toContain("[components/widget.md](components/widget.md)");
    expect(once).toContain("# Skill");
    expect(once).toContain("After.");
  });

  it("throws when a marker is missing", () => {
    expect(() => spliceGeneratedIndex("# Skill", "index")).toThrow(/markers/);
  });
});

describe("extractTokenNotes", () => {
  it("captures trailing same-line comments, skipping @kind markers", () => {
    const css = `
.cumulus {
  --gutter: 18px;   /* default horizontal page padding */
  --inset-top: inset 0 1px 0 rgba(255, 255, 255, 0.08);  /* @kind shadow */
  --space-l: 16px;

  /* ---- a section banner comment, not a note ---- */
  --accent: #9333ea;
}
`;
    const notes = extractTokenNotes(css);
    expect(notes.get("gutter")).toBe("default horizontal page padding");
    expect(notes.has("inset-top")).toBe(false);
    expect(notes.has("space-l")).toBe(false);
    expect(notes.has("accent")).toBe(false);
  });

  it("keeps the last note for a name declared more than once", () => {
    const css = `
  --text-faint: #777; /* placeholder */
  --text-faint: var(--x); /* the real alias */
`;
    expect(extractTokenNotes(css).get("text-faint")).toBe("the real alias");
  });
});

describe("renderTokensMarkdown", () => {
  const tokens = [
    { name: "surface-card", value: "#1a1525" },
    { name: "accent-strong", value: "#7c3aed" },
    { name: "space-l", value: "16px" },
    { name: "t-body", value: "400 15px/1.55 var(--font-ui)" },
    { name: "reward", value: "#d4a017" },
    { name: "zz-unclassified", value: "1px" },
  ];

  it("groups tokens by role family", () => {
    const markdown = renderTokensMarkdown(tokens, new Map());
    expect(markdown).toContain("## Backgrounds & surfaces");
    expect(markdown).toContain("| `--surface-card` |");
    // A bare family prefix covers hyphenated descendants (accent-strong).
    expect(markdown.indexOf("| `--accent-strong` |")).toBeGreaterThan(
      markdown.indexOf("## Color roles"),
    );
    expect(markdown.indexOf("| `--space-l` |")).toBeGreaterThan(
      markdown.indexOf("## Spacing & layout"),
    );
    expect(markdown.indexOf("| `--reward` |")).toBeGreaterThan(
      markdown.indexOf("## Color roles"),
    );
  });

  it("puts an unrecognized family in a visible Other group", () => {
    const markdown = renderTokensMarkdown(tokens, new Map());
    expect(markdown.indexOf("| `--zz-unclassified` |")).toBeGreaterThan(
      markdown.indexOf("## Other"),
    );
  });

  it("omits the Other group when every token is classified", () => {
    const markdown = renderTokensMarkdown(
      tokens.filter((t) => t.name !== "zz-unclassified"),
      new Map(),
    );
    expect(markdown).not.toContain("## Other");
  });

  it("carries notes into the token rows", () => {
    const markdown = renderTokensMarkdown(
      tokens,
      new Map([["space-l", "the default gap"]]),
    );
    expect(markdown).toContain("| `--space-l` | `16px` | the default gap |");
  });
});

describe("firstSentence", () => {
  it("cuts at the first sentence boundary and collapses whitespace", () => {
    expect(firstSentence("One two.\n  Three four.")).toBe("One two.");
    expect(firstSentence("No terminal punctuation")).toBe(
      "No terminal punctuation",
    );
    // An abbreviation-free sentence ending mid-string is honored even before
    // a newline.
    expect(firstSentence("Ends here! And more.")).toBe("Ends here!");
  });
});

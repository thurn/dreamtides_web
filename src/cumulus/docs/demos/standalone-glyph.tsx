import { assertLocalized } from "@trox/runtime";
import {
  BOLT_ICON_CLASS,
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
  SPARK_ICON_CLASS,
  SPARK_ICON_COLOR,
  StandaloneGlyph,
  type StandaloneGlyphDepth,
} from "../../components/controls/StandaloneGlyph";
import type { CumulusColor } from "../../primitives/color";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

const MARKS: readonly {
  label: string;
  glyph: Glyph;
  color: CumulusColor;
}[] = [
  { label: "Spark", glyph: SPARK_ICON_CLASS, color: SPARK_ICON_COLOR },
  { label: "Energy", glyph: ENERGY_ICON_CLASS, color: ENERGY_ICON_COLOR },
  { label: "Bolt", glyph: BOLT_ICON_CLASS, color: "text-primary" },
];

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function coerceDepth(value: unknown): StandaloneGlyphDepth {
  return value === "content-protection" ? value : "flat";
}

function StandaloneGlyphDemo(args: Record<string, unknown>) {
  const glyph = (args.glyph ?? SPARK_ICON_CLASS) as Glyph;
  const color = (args.color ?? "spark") as CumulusColor;
  const depth = coerceDepth(args.depth);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-2xl"),
      }}
    >
      <span style={{ display: "inline-flex", fontSize: 48 }}>
        <StandaloneGlyph
          glyph={glyph}
          color={color}
          depth={depth}
          label={assertLocalized(coerceString(args.label, "Spark"))}
        />
      </span>
      <div
        style={{
          display: "flex",
          gap: token("--space-2xl"),
          alignItems: "flex-end",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {MARKS.map((mark) => (
          <div
            key={mark.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: token("--space-s"),
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: token("--space-m"),
              }}
            >
              <span style={{ display: "inline-flex", fontSize: 24 }}>
                <StandaloneGlyph
                  glyph={mark.glyph}
                  color={mark.color}
                  label={assertLocalized(`${mark.label} mark, small`)}
                />
              </span>
              <span style={{ display: "inline-flex", fontSize: 48 }}>
                <StandaloneGlyph
                  glyph={mark.glyph}
                  color={mark.color}
                  depth="content-protection"
                  label={assertLocalized(`${mark.label} mark`)}
                />
              </span>
            </div>
            <span
              style={{
                font: token("--t-caption"),
                color: token("--text-muted"),
              }}
            >
              {mark.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const standaloneGlyphDemo: CumulusComponent = {
  id: "standalone-glyph",
  title: "Standalone Glyph",
  blurb:
    "The Boxicons renderer for controls, badges, overlays, and card marks: a centered one-em square whose surrounding layout owns its size and placement.",
  callout:
    "Use StandaloneGlyph when layout owns the mark's box; use InlineGlyph when a glyph participates in flowing text.",
  details: [
    "Content-protection depth is reserved for marks painted over card or scene media.",
  ],
  group: "Primitives",
  docName: "StandaloneGlyph",
  Component: StandaloneGlyphDemo,
  usage: [
    {
      label: "Card mark over media",
      note: "The wrapper owns the mark's box; content-protection depth keeps the glyph legible against card art.",
      code: `import { StandaloneGlyph, SPARK_ICON_CLASS, SPARK_ICON_COLOR } from "src/cumulus/components/controls/StandaloneGlyph";

<span style={{ display: "inline-flex", fontSize: 44 }}>
  <StandaloneGlyph
    glyph={SPARK_ICON_CLASS}
    color={SPARK_ICON_COLOR}
    depth="content-protection"
    label={assertLocalized("Spark")}
  />
</span>`,
    },
    {
      label: "Compact control mark",
      note: "A control establishes its font size and centers the one-em glyph in its own layout.",
      code: `import { StandaloneGlyph, ENERGY_ICON_CLASS, ENERGY_ICON_COLOR } from "src/cumulus/components/controls/StandaloneGlyph";

<StandaloneGlyph glyph={ENERGY_ICON_CLASS} color={ENERGY_ICON_COLOR} />`,
    },
  ],
  demo: {
    defaultArgs: {
      glyph: SPARK_ICON_CLASS,
      color: "spark",
      depth: "content-protection",
      label: "Spark",
    },
  },
};

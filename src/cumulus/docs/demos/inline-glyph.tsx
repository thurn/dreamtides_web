import { InlineGlyph } from "../../components/typography/InlineGlyph";
import type { CumulusColor } from "../../primitives/color";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

function InlineGlyphDemo(args: Record<string, unknown>) {
  const glyph = (args.glyph ?? GLYPHS.points) as Glyph;
  const color =
    typeof args.color === "string" ? (args.color as CumulusColor) : undefined;
  const label = typeof args.label === "string" ? args.label : "points";
  return (
    <p
      style={{
        margin: 0,
        font: token("--t-tutorial-instruction"),
        color: token("--text-primary"),
      }}
    >
      A capital X
      <InlineGlyph glyph={glyph} color={color} label={label} />
      and its inline glyph share one exact visual center.
    </p>
  );
}

export const inlineGlyphDemo: CumulusComponent = {
  id: "inline-glyph",
  title: "Inline Glyph",
  blurb:
    "The Boxicons renderer for flowing text: a one-em square whose midpoint follows the surrounding font's capital height at every type size.",
  callout:
    "InlineGlyph owns a protected inline formatting context: its outer shell absorbs flex or grid blockification while its inner metric box remains centered on the surrounding font's capital height. Callers may wrap it for white-space or layout, but cannot pass className or style overrides into the component.",
  group: "Primitives",
  docName: "InlineGlyph",
  Component: InlineGlyphDemo,
  usage: [
    {
      note: "The icon inherits the current type size, while the semantic color and accessible label remain explicit.",
      code: `import { InlineGlyph } from "src/cumulus/components/typography/InlineGlyph";
import { GLYPHS } from "src/cumulus/primitives/glyph";

<span>
  Score 10<InlineGlyph glyph={GLYPHS.points} color="text-primary" label="points" />.
</span>`,
    },
  ],
  demo: {
    defaultArgs: {
      glyph: GLYPHS.points,
      color: "text-primary",
      label: "points",
    },
  },
};

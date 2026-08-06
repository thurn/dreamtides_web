import { GlassPanel } from "../../components/overlay/GlassPanel";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

function GlassPanelDemo() {
  return (
    <div style={{ width: "min(620px, 100%)" }}>
      <GlassPanel
        eyebrow="Vision I"
        title="Transfigure Your Starters"
        structuredSubtitle={[
          { kind: "text", text: "Transfigure " },
          { kind: "entity", text: "A Thread Rewoven" },
        ]}
        rightAccessory={{
          kind: "iconButton",
          glyph: GLYPHS.close,
          label: "Close",
          onPress: () => undefined,
        }}
        footer={
          <div
            style={{
              padding: token("--space-l"),
              borderTop: `1px solid ${token("--border-strong")}`,
            }}
          >
            Footer content
          </div>
        }
      >
        <div style={{ padding: token("--space-2xl") }}>
          The panel body is a deliberate content slot for composed product UI.
        </div>
      </GlassPanel>
    </div>
  );
}

export const glassPanelDemo: CumulusComponent = {
  id: "glass-panel",
  title: "Glass Panel",
  blurb:
    "The content-hugging liquid-glass container: an optional structured header, a composed body, and an optional footer on the canonical floating material.",
  callout:
    "Use this for persistent titled content that floats over scene art. Floating panels always hug their header, body, and footer; unassigned interior whitespace is not allowed. Do not give the panel or its slots a decorative height, flex growth, or spacer that separates content. Cap an overflowing body with max-height and scrolling instead. Width and placement belong to the caller's wrapper. Edge-rail and full-bleed frames own their bounded height through those named frame contracts.",
  group: "Components",
  docName: "GlassPanel",
  Component: GlassPanelDemo,
  usage: [
    {
      note: "A content-sized scene panel with a canonical named-entity underline in its subtitle, close accessory, and composed body content. Its wrapper constrains width but supplies no decorative height.",
      code: `import { GlassPanel } from "src/cumulus/components/overlay/GlassPanel";

<GlassPanel
  eyebrow="Vision I"
  title="Transfigure Your Starters"
  structuredSubtitle={[
    { kind: "text", text: "Transfigure " },
    { kind: "entity", text: "A Thread Rewoven" },
  ]}
  rightAccessory={{
    kind: "iconButton",
    glyph: GLYPHS.close,
    label: "Close",
    onPress: close,
  }}
>
  <OfferDetails offer={offer} />
</GlassPanel>`,
    },
  ],
  demo: {
    defaultArgs: {},
    sampleContent: { children: null, footer: null },
  },
};

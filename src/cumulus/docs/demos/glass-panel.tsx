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
              padding: token("--space-6"),
              borderTop: `1px solid ${token("--border-strong")}`,
            }}
          >
            Footer content
          </div>
        }
      >
        <div style={{ padding: token("--space-8") }}>
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
    "Use this for persistent titled content that floats over scene art. Panels hug their header, body, and footer by default; never assign height merely to occupy available space. Use heightMode=\"fill\" only when the panel is itself a rail, scrolling gallery, or authored composition stage with a deliberate definite height. Width and placement belong to the caller's wrapper; glass material, text roles, header hierarchy, and accessory placement belong to the panel.",
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
    {
      note: "A definite-height panel is an explicit exception for a scrolling rail, gallery, or composition stage.",
      code: `<div style={{ height: "100dvh" }}>
  <GlassPanel heightMode="fill">
    <ScrollableRailContent />
  </GlassPanel>
</div>`,
    },
  ],
  demo: {
    defaultArgs: {},
    sampleContent: { children: null, footer: null },
  },
};

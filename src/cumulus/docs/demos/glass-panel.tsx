import { GlassPanel } from "../../components/overlay/GlassPanel";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

function GlassPanelDemo() {
  return (
    <div style={{ width: "min(620px, 100%)", height: 420 }}>
      <GlassPanel
        eyebrow="Vision I"
        structuredTitle={[
          { kind: "text", text: "Transfigure " },
          { kind: "entity", text: "A Thread Rewoven" },
        ]}
        subtitle="Choose how the vision resolves."
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
    "The shared liquid-glass content container: an optional structured header, a composed body, and an optional footer on the canonical floating material.",
  callout:
    "Use this for persistent titled content that floats over scene art. Width, placement, and screen composition belong to the caller's wrapper; glass material, text roles, header hierarchy, and accessory placement belong to the panel.",
  group: "Components",
  docName: "GlassPanel",
  Component: GlassPanelDemo,
  usage: [
    {
      note: "A titled scene panel with a canonical named-entity underline, close accessory, and composed body content.",
      code: `import { GlassPanel } from "src/cumulus/components/overlay/GlassPanel";

<GlassPanel
  eyebrow="Vision I"
  structuredTitle={[
    { kind: "text", text: "Transfigure " },
    { kind: "entity", text: "A Thread Rewoven" },
  ]}
  subtitle="Choose how the vision resolves."
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

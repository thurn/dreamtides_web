import { GlassPanel } from "../../components/overlay/GlassPanel";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

function GlassPanelDemo() {
  return (
    <div style={{ width: "min(620px, 100%)" }}>
      <GlassPanel
        eyebrow="Shop"
        title="Dream Market"
        subtitle="Spend Essence to add cards to your deck."
        rightAccessory={{
          kind: "glassButton",
          button: {
            label: "Leave",
            onPress: () => undefined,
          },
        }}
        footer={
          <div
            style={{
              padding: token("--space-l"),
              borderTop: `1px solid ${token("--border-strong")}`,
            }}
          >
            Three offers remain.
          </div>
        }
      >
        <div style={{ padding: token("--space-2xl") }}>
          Shop content belongs directly in the panel body.
        </div>
      </GlassPanel>
    </div>
  );
}

export const glassPanelDemo: CumulusComponent = {
  id: "glass-panel",
  title: "Glass Panel",
  blurb:
    "The persistent, non-modal, content-hugging liquid-glass container: an optional structured header, a composed body, and an optional footer on the canonical floating material.",
  callout:
    "Use this for persistent, non-modal titled content that floats over scene art; use GlassDialog when the user must dismiss or complete a modal interruption before returning to the screen.",
  details: [
    "An X icon is discouraged for a desktop panel. Prefer a labeled action whose copy states the specific intent, such as Leave on a shop screen.",
    "Floating panels always hug their header, body, and footer; unassigned interior whitespace is not allowed. Do not give the panel or its slots a decorative height, flex growth, or spacer that separates content. Cap an overflowing body with max-height and scrolling instead.",
    "Width and placement belong to the caller's wrapper. Edge-rail and full-bleed frames own their bounded height through those named frame contracts.",
  ],
  group: "Components",
  docName: "GlassPanel",
  Component: GlassPanelDemo,
  usage: [
    {
      note: "A content-sized shop panel with a specific, intent-labeled Leave action and composed body content. On desktop, prefer this labeled action to a generic X icon. Its wrapper constrains width but supplies no decorative height.",
      code: `import { GlassPanel } from "src/cumulus/components/overlay/GlassPanel";

<GlassPanel
  eyebrow="Shop"
  title="Dream Market"
  subtitle="Spend Essence to add cards to your deck."
  rightAccessory={{
    kind: "glassButton",
    button: {
      label: "Leave",
      onPress: leaveShop,
    },
  }}
>
  <OfferGrid offers={offers} />
</GlassPanel>`,
    },
  ],
  demo: {
    defaultArgs: {},
    sampleContent: { children: null, footer: null },
  },
};

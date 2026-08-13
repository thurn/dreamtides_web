import { assertLocalized } from "@trox/runtime";
// Registry demo entry for TideDisc — see site-node.tsx for the stageRef recipe.
// Each TideDisc is its own named reveal source, so the live demo exercises the
// same press-or-hover interaction production uses. The disc rows
// above show the five tides. tide-spec.ts is this page's documented palette
// home (see the callout).

import { TideDisc } from "../../components/hud/TideDisc";
import { token } from "../../primitives/tokens";
import { resonances } from "../../components/hud/tide-spec";
import type { CumulusComponent } from "../registry";

function TideDiscDemo() {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: token("--space-s"),
        padding: token("--space-s"),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {resonances().map((resonance) => (
          <TideDisc
            key={resonance.id}
            tide={resonance.id}
            id={`demo-sm-${resonance.id}`}
            label={assertLocalized(resonance.displayName)}
            description={assertLocalized(resonance.accessibilityName)}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TideDisc
          tide="valor"
          id="demo-reveal-valor"
          label={assertLocalized("Rising Valor")}
          description={assertLocalized(
            "A tide of steadfast courage that rewards holding the line.",
          )}
        />
      </div>
    </div>
  );
}

export const tideDiscDemo: CumulusComponent = {
  id: "tide-disc",
  title: "Tide Disc",
  blurb:
    "The single semantic tide mark: a colored disc carrying the tide's glyph and its own strict tide reveal.",
  callout:
    "The tide-identity palette lives in src/cumulus/components/hud/tide-spec.ts.",
  details: [
    "The canonical resonance catalog supplies each fixed accent, glyph, display name, and accessibility name to TideDisc and InfoCard.",
    "Selection-provenance controls use role colors instead. tide-spec has no renderable component of its own, so it is documented here on its canonical renderer.",
  ],
  group: "Components",
  docName: "TideDisc",
  Component: TideDiscDemo,
  usage: [
    {
      label: "Tide disc",
      note: "The color and glyph come from the named tide (never a raw value). The component owns its strict tide reveal on hover, focus, and touch.",
      code: `import { TideDisc } from "src/cumulus/components/hud/TideDisc";

<TideDisc tide="valor" id={tideDeckId} label={assertLocalized("Rising Valor")} description={tide.description} />`,
    },
    {
      label: "Self-revealing tide",
      note: "The named component derives its tide primary and general Tides secondary internally from semantic data.",
      code: `import { TideDisc } from "src/cumulus/components/hud/TideDisc";

<TideDisc tide="valor" id={tideDeckId} label={assertLocalized("Rising Valor")} description={tide.description} />`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};

// Registry demo entry for TideDisc — see site-node.tsx for the stageRef recipe.
// Each TideDisc is its own named reveal source, so the live demo exercises the
// same press-or-hover interaction production uses. The disc rows
// above show the five tides. tide-spec.ts is this page's documented palette
// home (see the callout).

import { TideDisc } from "../../components/hud/TideDisc";
import { token } from "../../primitives/tokens";
import { TIDES, type Tide } from "../../components/hud/tide-spec";
import type { CumulusComponent } from "../registry";

const ALL_TIDES = Object.keys(TIDES) as Tide[];

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
        {ALL_TIDES.map((tide) => (
          <TideDisc key={tide} tide={tide} id={`demo-sm-${tide}`} label={tide} description={`A ${tide} tide.`} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TideDisc tide="valor" id="demo-reveal-valor" label="Rising Valor" description="A tide of steadfast courage that rewards holding the line." />
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
    "The tide-identity palette lives in src/cumulus/components/hud/tide-spec.ts. Its five tides — Ember #fb923c, Valor #facc15, Vision #60a5fa, Wild #4ade80, Shadow #c084fc — each own a fixed accent and glyph, exposed as TIDES / tideVisual / tideAlignmentLabel. TideDisc and InfoCard's tide variant read that table. Selection-provenance controls use role colors instead. tide-spec has no renderable component of its own, so it is documented here on its canonical renderer.",
  group: "Components",
  docName: "TideDisc",
  Component: TideDiscDemo,
  usage: [
    {
      label: "Tide disc",
      note: "The color and glyph come from the named tide (never a raw value). The component owns its strict tide reveal on hover, focus, and touch.",
      code: `import { TideDisc } from "src/cumulus/components/hud/TideDisc";

<TideDisc tide="valor" id={tideDeckId} label="Rising Valor" description={tide.description} />`,
    },
    {
      label: "Self-revealing tide",
      note: "The named component derives its tide primary and general Tides secondary internally from semantic data.",
      code: `import { TideDisc } from "src/cumulus/components/hud/TideDisc";

<TideDisc tide="valor" id={tideDeckId} label="Rising Valor" description={tide.description} />`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};

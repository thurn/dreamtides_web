// Registry demo entry for TideDisc — see site-node.tsx for the stageRef recipe.
// Production never renders a bare TideDisc: the disc is always the trigger of an
// named TideDisc reveal, so the
// live demo owns a stageRef and wires one disc through that canonical reveal —
// press or hover it and the tide's InfoCard appears beside it. The disc rows
// above show the five tides at both sizes ('sm' desktop select, 'lg' mobile
// select). tide-spec.ts is this page's documented palette home (see the callout).

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
        gap: token("--space-4"),
        padding: token("--space-4"),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {ALL_TIDES.map((tide) => (
          <TideDisc key={tide} tide={tide} id={`demo-sm-${tide}`} label={tide} description={`A ${tide} tide.`} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {ALL_TIDES.map((tide) => (
          <TideDisc
            key={tide}
            tide={tide}
            id={`demo-lg-${tide}`}
            label={tide}
            description={`A ${tide} tide.`}
            size="lg"
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TideDisc tide="valor" id="demo-reveal-valor" label="Rising Valor" description="A tide of steadfast courage that rewards holding the line." size="lg" />
      </div>
    </div>
  );
}

export const tideDiscDemo: CumulusComponent = {
  id: "tide-disc",
  title: "Tide Disc",
  blurb:
    "The single semantic tide mark: a colored disc carrying the tide's glyph and its own strict tide reveal, sized 'sm' or 'lg'.",
  callout:
    "The tide-identity palette lives in src/cumulus/components/hud/tide-spec.ts. Its five tides — Ember #fb923c, Valor #facc15, Vision #60a5fa, Wild #4ade80, Shadow #c084fc — each own a fixed accent and glyph, exposed as TIDES / tideVisual / tideAlignmentLabel. TideDisc and InfoCard's tide variant read that table. Selection-provenance controls use role colors instead. tide-spec has no renderable component of its own, so it is documented here on its canonical renderer.",
  group: "Components",
  docName: "TideDisc",
  Component: TideDiscDemo,
  usage: [
    {
      label: "Bare disc",
      note: "The atom on its own — the color and glyph come from the named tide (never a raw value). `interactive` brightens it on hover and shows a pointer cursor. Rarely used alone: production wraps it in a reveal (below).",
      code: `import { TideDisc } from "src/cumulus/components/hud/TideDisc";

// The compact 'sm' disc (desktop select) and the larger 'lg' disc (mobile select):
<TideDisc tide="valor" id={tideDeckId} label="Rising Valor" description={tide.description} />
<TideDisc tide="valor" id={tideDeckId} label="Rising Valor" description={tide.description} size="lg" />`,
    },
    {
      label: "Self-revealing tide",
      note: "The named component derives its tide primary and general Tides secondary internally from semantic data.",
      code: `import { TideDisc } from "src/cumulus/components/hud/TideDisc";

<TideDisc tide="valor" id={tideDeckId} label="Rising Valor" description={tide.description} size="lg" />`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};

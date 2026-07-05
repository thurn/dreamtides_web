// Registry demo entry for TideDisc — see tide-pill.tsx for the recipe. Shows
// the five tides' discs side by side, plus an interactive disc that brightens
// on hover the way the desktop select's reveal triggers do.

import { TideDisc } from "../../components/hud/TideDisc";
import type { Tide } from "../../components/hud/tide-spec";
import type { TangoComponent } from "../registry";

const ALL_TIDES: Tide[] = ["ember", "valor", "vision", "wild", "shadow"];

function TideDiscDemo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {ALL_TIDES.map((tide) => (
        <TideDisc key={tide} tide={tide} id={`demo-${tide}`} interactive />
      ))}
    </div>
  );
}

export const tideDiscDemo: TangoComponent = {
  id: "tide-disc",
  title: "Tide Disc",
  blurb:
    "The single collapsed tide mark: a small colored disc carrying the tide's glyph — the atom the Tide Cluster and the desktop select's hover-reveal tide row both render from.",
  group: "Components",
  docName: "TideDisc",
  Component: TideDiscDemo,
  usage: [
    {
      code: `import { TideDisc } from "src/tango/components/hud/TideDisc";

// Decorative (inside a labelled control, like the resting cluster):
<TideDisc tide="valor" id={tideDeckId} />

// As a reveal trigger (brightens on hover, pointer cursor):
<TideDisc tide="valor" id={tideDeckId} label="Tide: Valor" interactive />`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};

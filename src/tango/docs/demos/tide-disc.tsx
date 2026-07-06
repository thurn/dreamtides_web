// Registry demo entry for TideDisc — see tide-pill.tsx for the recipe. Shows
// the five tides' discs at both sizes, interactive so they brighten on hover
// the way the select screens' reveal triggers do.

import { TideDisc } from "../../components/hud/TideDisc";
import type { Tide } from "../../components/hud/tide-spec";
import type { TangoComponent } from "../registry";

const ALL_TIDES: Tide[] = ["ember", "valor", "vision", "wild", "shadow"];

function TideDiscDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {ALL_TIDES.map((tide) => (
          <TideDisc key={tide} tide={tide} id={`demo-sm-${tide}`} interactive />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {ALL_TIDES.map((tide) => (
          <TideDisc
            key={tide}
            tide={tide}
            id={`demo-lg-${tide}`}
            size="lg"
            interactive
          />
        ))}
      </div>
    </div>
  );
}

export const tideDiscDemo: TangoComponent = {
  id: "tide-disc",
  title: "Tide Disc",
  blurb:
    "The single tide mark: a colored disc carrying the tide's glyph, sized 'sm' (desktop select) or 'lg' (mobile select) — the atom both Dreamcaller-select tide rows render from.",
  group: "Components",
  docName: "TideDisc",
  Component: TideDiscDemo,
  usage: [
    {
      code: `import { TideDisc } from "src/tango/components/hud/TideDisc";

// As a reveal trigger (brightens on hover, pointer cursor):
<TideDisc tide="valor" id={tideDeckId} label="Tide: Valor" interactive />

// The larger, more touch-friendly disc (mobile select):
<TideDisc tide="valor" id={tideDeckId} label="Tide: Valor" size="lg" interactive />`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};

// Registry demo entry for TideDisc — see site-node.tsx for the stageRef recipe.
// Production never renders a bare TideDisc: the disc is always the trigger of an
// InfoCard.PressInfo reveal (see quest-start-shared's TideDiscReveal), so the
// live demo owns a stageRef and wires one disc through that canonical reveal —
// press or hover it and the tide's InfoCard appears beside it. The disc rows
// above show the five tides at both sizes ('sm' desktop select, 'lg' mobile
// select). tide-spec.ts is this page's documented palette home (see the callout).

import { useRef } from "react";
import { TideDisc } from "../../components/hud/TideDisc";
import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
import { token } from "../../primitives/tokens";
import type { Tide } from "../../components/hud/tide-spec";
import type { TangoComponent } from "../registry";

const ALL_TIDES: Tide[] = ["ember", "valor", "vision", "wild", "shadow"];

/** The secondary definition shown beside the specific tide's own card. */
const TIDES_BLURB =
  "Pools of cards you will see during the quest. Different tides are used every time you play.";

function TideDiscDemo() {
  // The reveal anchors and clamps against this stage, exactly as the
  // Dreamcaller-select screen root does in production.
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
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
      {/* The canonical composition: a disc as the trigger of an
          InfoCard.PressInfo reveal, mirroring quest-start-shared's
          TideDiscReveal. Press or hover it to see the tide's card. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <InfoCard.PressInfo
          stageRef={stageRef}
          card={
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: token("--space-3"),
              }}
            >
              <InfoCard
                variant="tide"
                tide="valor"
                title="Rising Valor"
                body={richText.plain(
                  "A tide of steadfast courage that rewards holding the line.",
                )}
              />
              <InfoCard
                variant="text"
                title="Tides"
                body={richText.plain(TIDES_BLURB)}
              />
            </div>
          }
        >
          <TideDisc
            tide="valor"
            id="demo-reveal-valor"
            label="Tide: Valor"
            size="lg"
            interactive
          />
        </InfoCard.PressInfo>
      </div>
    </div>
  );
}

export const tideDiscDemo: TangoComponent = {
  id: "tide-disc",
  title: "Tide Disc",
  blurb:
    "The single tide mark: a colored disc carrying the tide's glyph, sized 'sm' (desktop select) or 'lg' (mobile select) — the atom both Dreamcaller-select tide rows render from. In production a disc is never bare: it is always the trigger of an InfoCard.PressInfo reveal that carries the tide's description.",
  callout:
    "The tide palette lives in src/tango/components/hud/tide-spec.ts. Its five tides — Ember #fb923c, Valor #facc15, Vision #60a5fa, Wild #4ade80, Shadow #c084fc — each own a fixed accent and glyph, exposed as TIDES / tideVisual / tideAlignmentLabel. TideDisc, InfoCard's tide variant, and any tide chip all read that one table, so a tide reads identically everywhere. tide-spec has no renderable component of its own, so it is documented here on its canonical renderer.",
  group: "Components",
  docName: "TideDisc",
  Component: TideDiscDemo,
  usage: [
    {
      label: "Bare disc",
      note: "The atom on its own — the color and glyph come from the named tide (never a raw value). `interactive` brightens it on hover and shows a pointer cursor. Rarely used alone: production wraps it in a reveal (below).",
      code: `import { TideDisc } from "src/tango/components/hud/TideDisc";

// The compact 'sm' disc (desktop select) and the larger 'lg' disc (mobile select):
<TideDisc tide="valor" id={tideDeckId} label="Tide: Valor" interactive />
<TideDisc tide="valor" id={tideDeckId} label="Tide: Valor" size="lg" interactive />`,
    },
    {
      label: "Disc-in-reveal (canonical)",
      note: "How a tide disc is ALWAYS rendered in production (see quest-start-shared's TideDiscReveal): the disc is the trigger of an InfoCard.PressInfo reveal anchored to the screen's `stageRef`, carrying the tide's own colored card first and a secondary text definition beside it. A tide disc never appears without its reveal.",
      code: `import { TideDisc } from "src/tango/components/hud/TideDisc";
import { InfoCard } from "src/tango/components/overlay/InfoCard";
import { richText } from "src/tango/components/card/rich-text";

<InfoCard.PressInfo
  stageRef={stageRef}
  card={
    <div style={{ display: "flex", alignItems: "flex-start", gap: token("--space-3") }}>
      <InfoCard variant="tide" tide="valor" title="Rising Valor" body={richText.plain(tide.description)} />
      <InfoCard variant="text" title="Tides" body={richText.plain(tidesBlurb)} />
    </div>
  }
>
  <TideDisc tide="valor" id={tideDeckId} label="Tide: Valor" size="lg" interactive />
</InfoCard.PressInfo>`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};

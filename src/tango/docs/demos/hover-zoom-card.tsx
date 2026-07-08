// Registry demo entry for HoverZoomCard — the in-place card zoom wrapper.
//
// HoverZoomCard has no style/className escape hatch and its whole point is how a
// ROW of wrapped cards behaves (each neighbour pops in turn as the pointer
// sweeps across), so the live Component below lays out several wrapped cards
// side by side rather than a single one. Every wrapped slot renders the same
// `children` supplied via `sampleContent` (a medium InfoCard stands in for the
// real GameCard, which would need an async UUID lookup) and receives the current
// control `args`, so toggling `fill` demonstrates the fixed-box mode across the
// whole row. `docName` points at the real HoverZoomCard so the props table
// reports its actual API (`enabled`, `fill`, `targetWidthPx`, `logSurface`,
// `glossaryText`, `testId`) and the exported MAX_SCALE / TARGET_WIDTH_PX caps.

import type { ReactNode } from "react";
import { HoverZoomCard } from "../../components/card/HoverZoomCard";
import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
import type { TangoComponent } from "../registry";

interface HoverZoomCardDemoArgs {
  /** Inert pass-through when false — the whole row stops zooming. */
  enabled?: boolean;
  /** Fill a fixed box (100% w/h) instead of shrinking to the card's own size. */
  fill?: boolean;
  /** Width (px) the card grows to on hover, before the MAX_SCALE / viewport caps. */
  targetWidthPx?: number;
  /** Label recorded with the `card_hover_zoom` log event. */
  logSurface?: string;
  /** Rules text whose gameplay terms are defined beside the enlarged card. */
  glossaryText?: string;
  /** The medium card to wrap, supplied via sampleContent. */
  children?: ReactNode;
}

// Three side-by-side slots so an enlarged card overhangs its neighbours and the
// pointer can sweep from one to the next, popping each in turn.
const SLOT_COUNT = 3;

function HoverZoomCardDemo({
  enabled = true,
  fill = false,
  targetWidthPx,
  logSurface = "tango-docs",
  glossaryText,
  children,
}: HoverZoomCardDemoArgs) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      {Array.from({ length: SLOT_COUNT }, (_unused, index) => (
        // The caller owns the wrapper. In the default mode the wrapper hugs the
        // card's own size; `fill` makes the card occupy a fixed box fully (as a
        // battle-hand slot would), so that mode gives the wrapper an explicit
        // box for the card to fill.
        <div
          key={index}
          style={fill ? { width: 180, height: 252 } : undefined}
        >
          <HoverZoomCard
            enabled={enabled}
            fill={fill}
            targetWidthPx={targetWidthPx}
            logSurface={logSurface}
            glossaryText={glossaryText}
          >
            {children}
          </HoverZoomCard>
        </div>
      ))}
    </div>
  );
}

export const hoverZoomCardDemo: TangoComponent = {
  id: "hover-zoom-card",
  title: "Hover Zoom Card",
  blurb:
    "Wraps a medium card so hovering grows the card itself in place — the enlarged copy pops out of the layout (above neighbours and any overflow: hidden) while the original keeps its footprint and interactivity; growth is capped at MAX_SCALE 1.5x and a legible-rules-text target width.",
  callout:
    "Layout is the caller's — HoverZoomCard has no style or className escape hatch. Wrap it in your own sized element, and set `fill` when that wrapper gives the card a fixed box to occupy (e.g. a battle-hand slot) rather than letting the card size itself.",
  group: "Components",
  docName: "HoverZoomCard",
  Component: HoverZoomCardDemo,
  usage: [
    {
      label: "Plain wrap",
      note: "The card sizes itself; hovering grows it in place. Pass the card's rendered rules text as `glossaryText` (and `suppressHoverHelp` on the card) so term definitions appear beside the enlarged copy.",
      code: `import { HoverZoomCard } from "src/tango/components/card/HoverZoomCard";

<HoverZoomCard glossaryText={card.renderedText} logSurface="deck-viewer">
  <GameCard card={card} suppressHoverHelp />
</HoverZoomCard>`,
    },
    {
      label: "Fill a fixed slot",
      note: "When your wrapper is a fixed box (a battle-hand cell), set `fill` so the card occupies it fully instead of shrinking to its own size.",
      code: `<div style={{ width: 168, height: 236 }}>
  <HoverZoomCard fill glossaryText={card.renderedText} logSurface="battle-hand">
    <GameCard card={card} suppressHoverHelp />
  </HoverZoomCard>
</div>`,
    },
  ],
  demo: {
    // `fill` defaults false (the card sizes itself). `enabled` is seeded true so
    // the metadata-driven toggle matches the live behaviour — an unseeded
    // boolean control renders unchecked while the card is in fact enabled.
    defaultArgs: {
      enabled: true,
      fill: false,
    },
    sampleContent: {
      children: (
        <InfoCard
          variant="text"
          title="Compact Card Slot"
          body={richText.rules(
            "Hover to grow this card in place. Neighbouring cards each pop in turn as the pointer sweeps across them.",
          )}
        />
      ),
    },
  },
};

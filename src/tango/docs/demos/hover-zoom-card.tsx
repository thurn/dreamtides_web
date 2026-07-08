import { HoverZoomCard } from "../../components/card/HoverZoomCard";
import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
import type { TangoComponent } from "../registry";

function HoverZoomCardDemo(args: Record<string, unknown>) {
  return (
    <HoverZoomCard
      enabled={args.enabled !== false}
      fill={args.fill === true}
      targetWidthPx={
        typeof args.targetWidthPx === "number" ? args.targetWidthPx : 340
      }
      zoomMotion={args.zoomMotion === "gentle" ? "gentle" : "snap"}
      logSurface={
        typeof args.logSurface === "string" ? args.logSurface : "tango-docs"
      }
      glossaryText={
        typeof args.glossaryText === "string" ? args.glossaryText : undefined
      }
    >
      <InfoCard
        variant="text"
        title="Compact Card Slot"
        body={richText.rules("Hover to grow this preview. Support appears beside it.")}
      />
    </HoverZoomCard>
  );
}

export const hoverZoomCardDemo: TangoComponent = {
  id: "hover-zoom-card",
  title: "Hover Zoom Card",
  blurb:
    "The in-place card zoom wrapper for compact card slots: hover grows a portaled copy while the original footprint keeps layout stable.",
  group: "Components",
  docName: "HoverZoomCard",
  Component: HoverZoomCardDemo,
  usage: [
    {
      code: `import { HoverZoomCard } from "src/tango/components/card/HoverZoomCard";

<HoverZoomCard glossaryText={card.renderedText}>
  <GameCard card={card} suppressHoverHelp />
</HoverZoomCard>`,
    },
    {
      note: "Use gentle motion on surfaces where the card is already readable and only needs a small hover lift while the glossary stack appears.",
      code: `<HoverZoomCard
  targetWidthPx={250}
  zoomMotion="gentle"
  glossaryText={card.renderedText}
>
  <GameCard card={card} suppressHoverHelp />
</HoverZoomCard>`,
    },
  ],
  demo: {
    defaultArgs: {
      enabled: true,
      fill: false,
      targetWidthPx: 340,
      zoomMotion: "snap",
      logSurface: "tango-docs",
      glossaryText: "Support appears beside the enlarged card.",
    },
  },
};

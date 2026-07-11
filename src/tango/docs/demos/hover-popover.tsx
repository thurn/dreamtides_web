// Registry demo entry for HoverPopover — the lightweight hover/focus tooltip
// primitive. `delayMs`, `placement`, `maxWidthPx`, `triggerAs`, and
// `triggerLayout` are seeded from defaultArgs; `content` is a ReactNode with no
// generated control, so it is seeded via sampleContent and spread into the demo
// wrapper.
//
// HoverPopover is reserved for passive, fine-pointer-only preview or explanatory
// UI. Named game entities use their semantic components and the coordinator.

import {
  CARD_HOVER_PREVIEW_DELAY_MS,
  HoverPopover,
} from "../../components/overlay/HoverPopover";
import type { TangoComponent } from "../registry";
import type { ReactNode } from "react";

function HoverPopoverDemo(args: Record<string, unknown>) {
  const content = (args.content as ReactNode | undefined) ?? null;
  return (
    <HoverPopover
      delayMs={
        typeof args.delayMs === "number"
          ? args.delayMs
          : CARD_HOVER_PREVIEW_DELAY_MS
      }
      placement={args.placement === "left" ? "left" : "top"}
      maxWidthPx={
        typeof args.maxWidthPx === "number" ? args.maxWidthPx : undefined
      }
      triggerAs={args.triggerAs === "div" ? "div" : "span"}
      triggerLayout={args.triggerLayout === "inlineFlex" ? "inlineFlex" : "inline"}
      content={content}
    >
      <span style={{ cursor: "help", textDecoration: "underline dotted" }}>
        Hover for context
      </span>
    </HoverPopover>
  );
}

export const hoverPopoverDemo: TangoComponent = {
  id: "hover-popover",
  title: "Hover Popover",
  blurb:
    "A lightweight hover/focus tooltip primitive that portals passive explanatory content or a full-card preview to document.body and keeps it on-screen.",
  callout:
    "Use a named semantic component for every game entity. Reach for HoverPopover only for passive explanatory UI, aggregate summaries, or legacy compact-row card previews on fine-pointer surfaces; it has no touch-hold contract.",
  group: "Primitives",
  docName: "HoverPopover",
  Component: HoverPopoverDemo,
  usage: [
    {
      label: "Passive explanatory tooltip",
      note: "An informational icon can reveal brief explanatory copy on hover or keyboard focus after `delayMs`.",
      code: `import { HoverPopover } from "src/tango/components/overlay/HoverPopover";

<HoverPopover delayMs={300} content={<span>{explanation}</span>}>
  <span aria-label="About this section">ⓘ</span>
</HoverPopover>`,
    },
    {
      label: "Block deck-row preview",
      note: "A block-level trigger (`triggerAs=\"div\"`) on a compact deck row that reveals a full-card preview beside the row; pass `maxWidthPx={null}` so the self-sizing preview is not capped.",
      code: `import {
  CARD_HOVER_PREVIEW_DELAY_MS,
  CARD_HOVER_PREVIEW_WIDTH_PX,
  HoverPopover,
} from "src/tango/components/overlay/HoverPopover";

<HoverPopover
  triggerAs="div"
  placement="left"
  delayMs={CARD_HOVER_PREVIEW_DELAY_MS}
  maxWidthPx={null}
  content={({ anchorRect, side }) => (
    <CardHoverPreview
      card={card}
      widthPx={CARD_HOVER_PREVIEW_WIDTH_PX}
      popoverSide={side}
      anchorRect={anchorRect}
    />
  )}
>
  <div className="deck-row">{card.name}</div>
</HoverPopover>`,
    },
  ],
  demo: {
    defaultArgs: {
      delayMs: CARD_HOVER_PREVIEW_DELAY_MS,
      placement: "top",
      maxWidthPx: 260,
      triggerAs: "span",
      triggerLayout: "inline",
    },
    sampleContent: {
      content: (
        <span style={{ display: "block", padding: 12 }}>Passive explanatory copy.</span>
      ),
    },
  },
};

// Registry demo entry for HoverPopover — the lightweight hover/focus tooltip
// primitive. `delayMs`, `placement`, `maxWidthPx` and `triggerAs` are seeded
// from defaultArgs; `content` is a ReactNode with no generated control, so it
// is seeded via sampleContent and spread into the demo wrapper.
//
// The `callout` carries the load-bearing InfoCard-vs-HoverPopover decision
// rule (see the SKILL.md "Popup rule"): InfoCard / InfoCard.PressInfo is the
// input-adaptive press engine for object / entity card reveals, while
// HoverPopover is the hover-only tooltip for a small informational node beside
// a trigger. Every current HoverPopover consumer (glossary definitions, pip /
// stat-orb tooltips, compact deck-row and shop-ware card previews) is a
// passive hover reveal, never a touch-hold object press.

import {
  CARD_HOVER_PREVIEW_DELAY_MS,
  HoverPopover,
} from "../../components/overlay/HoverPopover";
import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
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
      content={content}
    >
      <span style={{ cursor: "help", textDecoration: "underline dotted" }}>
        Hover this term
      </span>
    </HoverPopover>
  );
}

export const hoverPopoverDemo: TangoComponent = {
  id: "hover-popover",
  title: "Hover Popover",
  blurb:
    "A lightweight hover/focus tooltip primitive that portals a small content node to document.body, kept on-screen by a viewport-aware placement pass; used for glossary-term definitions on rules text and full-card previews on compact deck rows.",
  callout:
    "Choosing between the two reveals: use InfoCard / InfoCard.PressInfo for an object or entity card (a card, dreamcaller, dreamsign, tide, or site) — it is the input-adaptive press engine (fine-pointer hover OR touch press-down), pointer-anchored and clamped above or beside the trigger, and it is the canonical Popup rule for every game-object reveal. Reach for HoverPopover instead when the reveal is a passive tooltip rather than an object card — a glossary-term definition on rules text, a full-card preview on a compact deck row, or a pip-badge tooltip — on a fine-pointer surface: it is hover/focus only, with no touch-hold contract and simpler placement.",
  group: "Primitives",
  docName: "HoverPopover",
  Component: HoverPopoverDemo,
  usage: [
    {
      label: "Inline glossary tooltip",
      note: "The default: an inline `span` trigger inside flowing rules text that reveals a small definition node on hover after `delayMs`.",
      code: `import { HoverPopover } from "src/tango/components/overlay/HoverPopover";

<HoverPopover delayMs={300} content={<GlossaryDefinitionCard entry={entry} />}>
  <span className="glossary-term">{entry.term}</span>
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
    },
    sampleContent: {
      content: (
        <InfoCard
          variant="text"
          title="Reclaim"
          body={richText.plain(
            "Play this card from your void, then banish it.",
          )}
        />
      ),
    },
  },
};

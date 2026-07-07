import { HoverPopover } from "../../components/overlay/HoverPopover";
import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
import type { TangoComponent } from "../registry";

function HoverPopoverDemo(args: Record<string, unknown>) {
  return (
    <HoverPopover
      delayMs={typeof args.delayMs === "number" ? args.delayMs : 250}
      placement={args.placement === "left" ? "left" : "top"}
      maxWidthPx={
        typeof args.maxWidthPx === "number" ? args.maxWidthPx : undefined
      }
      triggerAs="span"
      content={
        <InfoCard
          variant="text"
          title="Glossary Reveal"
          body={richText.plain("A pointer-anchored hover reveal for glossary text and card previews.")}
        />
      }
    >
      <span style={{ cursor: "help", textDecoration: "underline" }}>
        Hover this term
      </span>
    </HoverPopover>
  );
}

export const hoverPopoverDemo: TangoComponent = {
  id: "hover-popover",
  title: "Hover Popover",
  blurb:
    "The pointer-and-focus anchored popover primitive for glossary definitions and compact card previews, with viewport-aware placement.",
  callout:
    "Use InfoCard.PressInfo for press-to-reveal screen objects. Use HoverPopover for inline text and compact list previews whose trigger already lives inside flowing content.",
  group: "Components",
  docName: "HoverPopover",
  Component: HoverPopoverDemo,
  usage: [
    {
      code: `import { HoverPopover } from "src/tango/components/overlay/HoverPopover";

<HoverPopover content={<GlossaryDefinitionCard entry={entry} />}>
  <span>{entry.term}</span>
</HoverPopover>`,
    },
  ],
  demo: {
    defaultArgs: {
      delayMs: 250,
      placement: "top",
      maxWidthPx: 260,
    },
  },
};

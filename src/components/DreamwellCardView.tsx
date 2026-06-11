import { type CSSProperties, useRef } from "react";
import { cardImageUrl, cardIdenticonUri, hasAssignedImage } from "../data/card-database";
import { CardStatOrb } from "./CardStatOrb";
import { renderRulesText } from "./RulesText";
import { useCardTermPopover } from "./useCardTermPopover";

/**
 * The data a Dreamwell card needs to render. A subset of
 * {@link import("../battle/types").DreamwellCardDefinition}, kept structural so
 * the component does not depend on the battle module.
 */
export interface DreamwellCardViewData {
  id: string;
  name: string;
  renderedText: string;
  energyAdded: number;
  imageNumber: number;
}

/**
 * A Dreamwell card rendered in landscape (3:2) with rounded corners and a
 * frosted text box, sharing the regular card treatment for art, rules-text
 * symbol highlighting, and the on-hover glossary term panel (see
 * {@link useCardTermPopover}). It differs from a regular card in three ways:
 * the energy mark in the top-right shows the card's `energy-added` over a
 * **purple** flame (the number stays white); there is no title bar — the card
 * name is shown inline at the head of the text box at a larger font size,
 * followed by the rules text; and the frame is landscape.
 *
 * Sizing is driven by container queries (`container-type: inline-size`), so the
 * card scales to whatever width its container gives it; every length below is in
 * `cqw` (1% of the card's own width) so the layout holds at any size.
 */
export function DreamwellCardView({
  card,
  className,
  style,
}: {
  card: DreamwellCardViewData;
  className?: string;
  style?: CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { triggerHandlers, popoverPortal } = useCardTermPopover({
    anchorRef: rootRef,
    text: card.renderedText,
    enabled: true,
  });

  const artUrl = hasAssignedImage(card.imageNumber)
    ? cardImageUrl(card.imageNumber)
    : cardIdenticonUri(card.id);

  return (
    <div
      ref={rootRef}
      data-dreamwell-card={card.id}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 2",
        containerType: "inline-size",
        borderRadius: "5cqw",
        overflow: "hidden",
        boxShadow:
          "0 6cqw 14cqw rgba(0, 0, 0, 0.55), 0 0 0 0.6cqw rgba(168, 85, 247, 0.45)",
        userSelect: "none",
        ...style,
      }}
      {...triggerHandlers}
    >
      {/* Card art covers the whole frame. */}
      <img
        src={artUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {/* A bottom-up scrim keeps the text box legible over bright art. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(10, 6, 18, 0.92) 0%, rgba(10, 6, 18, 0.55) 34%, rgba(10, 6, 18, 0) 58%)",
        }}
      />
      {/* Energy-added mark: purple flame, white number, top-right corner. */}
      <div
        style={{
          position: "absolute",
          top: "4cqw",
          right: "4.5cqw",
        }}
      >
        <CardStatOrb
          variant="dreamwellEnergy"
          value={String(card.energyAdded)}
          sizeVar="15cqw"
          numberSizeVar="9cqw"
          numberCapPx={64}
          ariaLabel={`${String(card.energyAdded)} energy added`}
        />
      </div>
      {/* Text box: inline name at a larger font, then the rules text. */}
      <div
        style={{
          position: "absolute",
          left: "5cqw",
          right: "5cqw",
          bottom: "5cqw",
          padding: "3.5cqw 4cqw",
          borderRadius: "3cqw",
          background: "rgba(12, 8, 22, 0.72)",
          backdropFilter: "blur(2px)",
          border: "0.4cqw solid rgba(168, 85, 247, 0.35)",
          color: "#f8fafc",
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: "5.4cqw",
          lineHeight: 1.18,
        }}
      >
        <span
          style={{
            display: "block",
            fontFamily: '"Anton", system-ui, sans-serif',
            fontSize: "8.4cqw",
            lineHeight: 1.05,
            letterSpacing: "0.01em",
            marginBottom: "1.6cqw",
          }}
        >
          {card.name}
        </span>
        {renderRulesText(card.renderedText)}
      </div>
      {popoverPortal}
    </div>
  );
}

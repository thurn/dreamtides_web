import { useRef, useState } from "react";
import type { CardData } from "../../types/cards";
import type { CardSizePreset } from "../card-size";
import { CardView } from "../../tango/components/card/CardView";
import { MtgNameTooltip } from "./MtgNameTooltip";

export interface BrowserCardProps {
  card: CardData;
  size: CardSizePreset;
  /** Invoked when the card body is clicked; makes the card act as a button. */
  onClick?: () => void;
}

/**
 * Read-only card tile for the card-browsing surfaces. Renders the shared
 * `CardView` at the active size and shows the source Magic: The Gathering name
 * as a hover tooltip when the card carries one. The card editor layers inline
 * editing on top of `CardView` directly; this is the plain, non-editing tile
 * the Pool Viewer uses.
 */
export function BrowserCard({ card, size, onClick }: BrowserCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [hovering, setHovering] = useState(false);
  const mtgName = (card.mtgName ?? "").trim();

  return (
    <article
      ref={cardRef}
      aria-label={card.name}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ display: "block" }}
    >
      <CardView
        card={card}
        large={size === "large"}
        suppressHoverHelp
        onClick={onClick}
      />
      {hovering && mtgName !== "" ? (
        <MtgNameTooltip anchorRef={cardRef} mtgName={mtgName} />
      ) : null}
    </article>
  );
}

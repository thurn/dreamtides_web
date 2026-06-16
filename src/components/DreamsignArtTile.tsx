import { useState, type CSSProperties } from "react";
import { HoverPopover } from "./HoverPopover";
import { DreamsignHoverCard } from "./DreamsignHoverCard";
import type { Dreamsign } from "../types/quest";

/**
 * Shared dreamsign artwork tile.
 *
 * Renders a single square showing the dreamsign's `imageName` artwork loaded
 * from `/dreamsigns/<imageName>`. Boon dreamsigns get a purple border; bane
 * dreamsigns get a red border plus a grayscale filter so the warning reads
 * before the art does. The tile wraps itself in a `HoverPopover` so the
 * player can read the full name + effect text on hover.
 *
 * Used by the Shop tile for dreamsign offerings and the Deck Viewer's
 * dreamsign sidebar so both surfaces draw their iconography from the same
 * artwork pipeline.
 */

const BOON_BORDER = "rgba(168, 85, 247, 0.65)";
const BOON_GLOW = "rgba(168, 85, 247, 0.30)";
const BANE_BORDER = "rgba(239, 68, 68, 0.85)";
const BANE_GLOW = "rgba(239, 68, 68, 0.40)";
const BANE_FILTER = "grayscale(0.7)";

interface DreamsignArtTileProps {
  dreamsign: Dreamsign;
  /** Square tile edge length in pixels. */
  sizePx: number;
  /**
   * Optional override for the hover delay. Defaults to 250ms, matching the
   * HUD dreamsign row so the player can scrub across tiles quickly without
   * popovers chasing the cursor.
   */
  hoverDelayMs?: number;
}

export function DreamsignArtTile({
  dreamsign,
  sizePx,
  hoverDelayMs = 250,
}: DreamsignArtTileProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;

  const borderColor = dreamsign.isBane ? BANE_BORDER : BOON_BORDER;
  const glow = dreamsign.isBane ? BANE_GLOW : BOON_GLOW;

  const tileStyle: CSSProperties = {
    height: sizePx,
    width: sizePx,
    background: "rgba(10, 6, 18, 0.65)",
    border: `1px solid ${borderColor}`,
    boxShadow: `0 0 6px ${glow}`,
    filter: dreamsign.isBane ? BANE_FILTER : "none",
  };

  const imgAlt = dreamsign.imageAlt ?? dreamsign.name;

  return (
    <HoverPopover
      triggerAs="span"
      delayMs={hoverDelayMs}
      maxWidthPx={null}
      content={({ side, anchorRect }) => (
        <DreamsignHoverCard
          dreamsign={dreamsign}
          testid="dreamsign-art-popover"
          popoverSide={side}
          anchorRect={anchorRect}
        />
      )}
      className="inline-block"
    >
      <span
        data-testid="dreamsign-art-tile"
        data-dreamsign-id={dreamsign.id ?? dreamsign.name}
        data-is-bane={String(dreamsign.isBane)}
        aria-label={
          dreamsign.isBane
            ? `Bane dreamsign: ${dreamsign.name}`
            : `Dreamsign: ${dreamsign.name}`
        }
        className="flex items-center justify-center overflow-hidden rounded-md"
        style={tileStyle}
      >
        {showImage ? (
          <img
            src={`/dreamsigns/${String(dreamsign.imageName)}`}
            alt={imgAlt}
            className="h-full w-full object-cover"
            onError={() => {
              setImageBroken(true);
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="text-base"
            style={{
              color: dreamsign.isBane ? "#fca5a5" : "#e9d5ff",
            }}
          >
            {dreamsign.isBane ? "☠" : "✦"}
          </span>
        )}
      </span>
    </HoverPopover>
  );
}

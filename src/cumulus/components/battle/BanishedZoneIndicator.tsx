import type { ReactElement } from "react";
import { cardImageUrl } from "../../../data/card-database";
import { BANISHED_ZONE_IMAGE_NUMBER } from "../../../data/battle-zone-art";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";

export interface BanishedZoneIndicatorProps {
  /** Number of cards in the banished zone. */
  readonly count: number;
  /** Accessible owner-aware name for the zone. */
  readonly label: string;
  /** Opens the banished-card browser. */
  readonly onActivate: () => void;
  /** Optional stable test id for the indicator. */
  readonly testId?: string;
}

const EDGE_FADE =
  "radial-gradient(ellipse at center, rgba(0, 0, 0, 1) 42%, rgba(0, 0, 0, 0.82) 58%, rgba(0, 0, 0, 0) 82%)";

/**
 * An ethereal square portal into a non-empty banished zone. It represents the
 * zone symbolically and never reveals a banished card on the battle surface.
 */
export function BanishedZoneIndicator({
  count,
  label,
  onActivate,
  testId,
}: BanishedZoneIndicatorProps): ReactElement {
  return (
    <Pressable
      as="button"
      aria-label={`${label}, ${String(count)} ${count === 1 ? "card" : "cards"}`}
      data-banished-zone-indicator=""
      data-banished-zone-count={String(count)}
      data-testid={testId}
      onClick={onActivate}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: "1",
        appearance: "none",
        padding: 0,
        overflow: "hidden",
        border: 0,
        borderRadius: token("--radius-panel"),
        background: "transparent",
        boxShadow: `${token("--shadow-md")}, ${token("--glow-accent-soft")}`,
      }}
    >
      <img
        src={cardImageUrl(BANISHED_ZONE_IMAGE_NUMBER)}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-banished-zone-art={String(BANISHED_ZONE_IMAGE_NUMBER)}
        style={{
          position: "absolute",
          inset: "-12%",
          display: "block",
          width: "124%",
          maxWidth: "none",
          height: "124%",
          objectFit: "cover",
          filter: "contrast(1.08) brightness(1.08)",
          maskImage: EDGE_FADE,
          WebkitMaskImage: EDGE_FADE,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </Pressable>
  );
}

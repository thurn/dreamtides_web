import type { ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { CARD_ASPECT_RATIO, CARD_CORNER_RADIUS } from "./card-aspect";

export interface GalleryActionCardProps {
  readonly action: { readonly glyph: Glyph; readonly label: string };
  readonly width: string | number;
}

/** Card-shaped action material shared by gallery sources and reveal overlays. */
export function GalleryActionCard({
  action,
  width,
}: GalleryActionCardProps): ReactElement {
  const resolvedWidth = typeof width === "number" ? `${String(width)}px` : width;
  return (
    <div
      data-gallery-action-surface=""
      style={{
        width: "100%",
        aspectRatio: CARD_ASPECT_RATIO,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-3"),
        overflow: "hidden",
        ...glassSurfaceStyle({ radius: CARD_CORNER_RADIUS }),
        background: `${token("--glass-sheen")}, ${token("--gallery-action-fill")}`,
        border: `1px solid ${token("--gallery-action-rim")}`,
        boxShadow: token("--glass-on-glass-shadow"),
      }}
    >
      <i
        className={action.glyph}
        aria-hidden="true"
        data-gallery-action-glyph=""
        style={{
          fontSize: `calc(${resolvedWidth} * 0.38)`,
          color: token("--gallery-action-foreground"),
          textShadow: token("--shadow-sm"),
          filter: token("--gallery-action-soften"),
        }}
      />
      <span
        data-gallery-action-label=""
        style={{
          font: token("--t-body"),
          color: token("--gallery-action-foreground"),
          textAlign: "center",
          textShadow: token("--shadow-sm"),
          filter: token("--gallery-action-soften"),
        }}
      >
        {action.label}
      </span>
    </div>
  );
}

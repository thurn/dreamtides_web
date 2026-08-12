import type { ReactElement } from "react";
import type { LocalizedString } from "@trox/runtime";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  CARD_ASPECT_RATIO,
  CARD_CORNER_RADIUS,
} from "./card-aspect";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export interface GalleryActionCardProps {
  readonly action: {
    readonly glyph: Glyph;
    readonly label?: LocalizedString;
    readonly authoredLabel?: string;
  };
  readonly width: string | number;
}

/** Card-shaped action material shared by gallery sources and reveal overlays. */
export function GalleryActionCard({
  action,
  width,
}: GalleryActionCardProps): ReactElement {
  if ((action.label === undefined) === (action.authoredLabel === undefined)) {
    throw new Error("GalleryActionCard requires exactly one label source.");
  }
  const resolve = useLocalizer();
  const resolvedWidth = typeof width === "number" ? `${String(width)}px` : width;
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: CARD_ASPECT_RATIO,
        position: "relative",
      }}
    >
      <div
        data-gallery-action-surface=""
        style={{
          position: "absolute",
          top: "-1px",
          left: 0,
          width: "100%",
          // The one-pixel rim sits inside border-box sizing. Extending both
          // vertical edges keeps the visible action face aligned with a card.
          height: "calc(100% + 2px)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: token("--space-xs"),
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
          }}
        />
        <span
          data-gallery-action-label=""
          style={{
            font: token("--t-body"),
            color: token("--gallery-action-foreground"),
            textAlign: "center",
          }}
        >
          {action.label === undefined ? action.authoredLabel : resolve(action.label)}
        </span>
      </div>
    </div>
  );
}

import type { CSSProperties } from "react";
import { GLYPHS } from "../primitives/glyph";
import { InlineGlyph } from "../components/typography/InlineGlyph";

interface CardChangeBadgeProps {
  /** CSS length for the badge diameter, resolved by the owning card surface. */
  readonly sizeVar: string;
  /** Accessible description when the badge conveys meaning on its own. */
  readonly ariaLabel?: string;
}

/**
 * The monochrome hammer-in-circle marker shared by changed card stats and rules
 * text. Positioning belongs to the card region that owns the marker; this
 * primitive owns the badge's fixed geometry and glyph treatment.
 */
export function CardChangeBadge({
  sizeVar,
  ariaLabel,
}: CardChangeBadgeProps) {
  return (
    <span
      aria-hidden={ariaLabel === undefined ? "true" : undefined}
      aria-label={ariaLabel}
      role={ariaLabel === undefined ? undefined : "img"}
      style={
        {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: sizeVar,
          height: sizeVar,
          borderRadius: "50%",
          background: "#000000",
          border: `calc(${sizeVar} * ${String(1 / 30)}) solid #ffffff`,
          color: "#ffffff",
          boxSizing: "border-box",
          fontSize: `calc(${sizeVar} * 0.62)`,
          lineHeight: 1,
        } satisfies CSSProperties
      }
    >
      <InlineGlyph glyph={GLYPHS.transfigurationSite} />
    </span>
  );
}

import type { CSSProperties } from "react";
import { ENERGY_PIP_COLOR } from "./PipBadge";

/**
 * A glowing Boxicons glyph used for the card resource marks. Boxicons paints
 * via the element's text color, so callers pass the resource hue; an `em`-based
 * bloom (and an optional crisp black outline) is pinned to the icon's own
 * `font-size` so both track the glyph at any size.
 *
 * Single source of truth for the spark and energy symbols: the corner stat
 * orbs (`CardStatOrb`) and the inline references in rules text (`RulesText`)
 * render through the same classes, colors, and glow filters so a `●3` / `1✦`
 * reads as the same mark in both places.
 */

/** Solid amber-gold fill for the spark mark. */
export const SPARK_ICON_COLOR = "#f3c33f";
/**
 * Blue fill for the energy mark. Pulled from the shared resource token so the
 * inline energy glyph and the corner energy orb read as the exact same blue
 * and cannot drift apart.
 */
export const ENERGY_ICON_COLOR = ENERGY_PIP_COLOR;

/** Boxicons filled classes for each resource mark. */
export const SPARK_ICON_CLASS = "bxf bx-sparkles";
export const ENERGY_ICON_CLASS = "bxf bx-fire-alt";

/**
 * Subtle emitted-light bloom for a resource mark: two stacked, zero-offset
 * `drop-shadow()` layers (a tight hot core and a wider soft halo). Zero offset
 * on every layer reads as the glyph *being* the light source rather than
 * casting a shadow, and `drop-shadow` (not `text-shadow`) follows the glyph's
 * actual alpha silhouette so the glow hugs its edges. Radii are in `em` so the
 * bloom scales with the icon's pinned `font-size`.
 */
export const SPARK_GLOW_FILTER =
  "drop-shadow(0 0 0.22em rgba(245, 205, 90, 0.6)) " +
  "drop-shadow(0 0 0.5em rgba(243, 180, 50, 0.34))";
export const ENERGY_GLOW_FILTER =
  "drop-shadow(0 0 0.22em rgba(56, 189, 248, 0.6)) " +
  "drop-shadow(0 0 0.5em rgba(14, 165, 233, 0.34))";

/**
 * A crisp black outline hugging the glyph silhouette, composed from four
 * cardinal zero-blur `drop-shadow()` copies. Offsets are in `em` so the outline
 * tracks the rendered icon size. Applied before the glow so the bloom radiates
 * around the outlined glyph rather than inside it.
 */
export const ICON_OUTLINE_FILTER =
  "drop-shadow(0.022em 0 0 #000) drop-shadow(-0.022em 0 0 #000) " +
  "drop-shadow(0 0.022em 0 #000) drop-shadow(0 -0.022em 0 #000)";

export interface GlowIconProps {
  /** Boxicons class(es) for the glyph (e.g. `SPARK_ICON_CLASS`). */
  iconClass: string;
  /** Fill color — Boxicons paints via the element's text color. */
  color: string;
  /**
   * Rendered width/height as any CSS length. Defaults to `1em` so an inline
   * glyph tracks the surrounding text size. The icon's own `font-size` is
   * pinned to this value so the `em`-based glow and outline scale with it.
   */
  size?: string;
  /** Emitted-light bloom filter. Omit for no glow. */
  glowFilter?: string;
  /** When true, adds the crisp black outline beneath the glow. */
  outline?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; the icon is hidden from assistive tech when unset. */
  title?: string;
}

export function GlowIcon({
  iconClass,
  color,
  size = "1em",
  glowFilter,
  outline = false,
  className,
  style,
  title,
}: GlowIconProps) {
  const filter = [outline ? ICON_OUTLINE_FILTER : null, glowFilter ?? null]
    .filter((layer): layer is string => layer !== null)
    .join(" ");
  return (
    <i
      className={`${iconClass}${className !== undefined ? ` ${className}` : ""}`}
      role={title !== undefined ? "img" : undefined}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
      style={{
        // Center the glyph in a square footprint so the corner stat's absolute
        // centering lands true.
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        // Pin font-size to the icon size so the glyph fills the box and the
        // `em`-based glow and outline track it.
        fontSize: size,
        lineHeight: 1,
        color,
        filter: filter !== "" ? filter : undefined,
        ...style,
      }}
    />
  );
}

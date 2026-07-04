import { ENERGY_PIP_COLOR } from "./PipBadge";

/**
 * A Boxicons glyph used for the card resource marks. Boxicons paints via the
 * element's text color, so callers pass the resource hue; an optional soft
 * content-protection shadow (and an optional emitted-light glow, supplied by the
 * caller) is pinned to the icon's own `font-size` so it tracks the glyph at any
 * size.
 *
 * Source of truth for the spark and energy hues: the corner stat orbs
 * (`CardStatOrb`) and the inline references in rules text (`RulesText`) pull the
 * same colors so a `●3` / `1✦` reads as the same resource in both places. The
 * corner stats use the larger sparkle/flame glyphs through this component; the
 * inline references draw their own plain `<i>` in the matching hue.
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
 * Filled lightning-bolt mark for activated abilities. Shared by the card
 * title-bar fast/interrupt chips (`CardView`) and the inline `❖` / `❖❖`
 * activated-ability markers in rules text (`RulesText`) so both read as the
 * same glyph.
 */
export const BOLT_ICON_CLASS = "bxf bx-bolt";

/**
 * Spark glyph for inline rules text. The single "sparkle" star reads more
 * cleanly than the busier multi-star "sparkles" at the small inline size,
 * while the corner spark stat keeps `SPARK_ICON_CLASS` at its larger size.
 */
export const SPARK_INLINE_ICON_CLASS = "bxf bx-sparkle";

/**
 * Soft content-protection shadow that grounds the glyph against the art behind
 * it: a short downward dark blur plus a tight dark halo. This reads as depth
 * rather than the hard cartoon keyline a multi-offset solid outline produces.
 * Offsets/radii are in `em` so it tracks the rendered icon size. Applied before
 * the glow so the colored bloom still radiates outward.
 */
export const ICON_SHADOW_FILTER =
  "drop-shadow(0 0.03em 0.05em rgba(0, 0, 0, 0.55)) " +
  "drop-shadow(0 0 0.03em rgba(0, 0, 0, 0.45))";

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
  /** When true, adds the soft content-protection shadow beneath the glow. */
  shadow?: boolean;
  /** Accessible label; the icon is hidden from assistive tech when unset. */
  title?: string;
}

export function GlowIcon({
  iconClass,
  color,
  size = "1em",
  glowFilter,
  shadow = false,
  title,
}: GlowIconProps) {
  const filter = [shadow ? ICON_SHADOW_FILTER : null, glowFilter ?? null]
    .filter((layer): layer is string => layer !== null)
    .join(" ");
  return (
    <i
      className={iconClass}
      role={title !== undefined ? "img" : undefined}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
      style={{
        // Center the glyph in a square footprint so a caller's absolute
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
      }}
    />
  );
}

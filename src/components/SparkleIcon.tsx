import type { CSSProperties } from "react";

/**
 * The amber-gold spark mark: the Boxicons filled "sparkle" glyph (`bxf
 * bx-sparkle`, a four-point concave star) drawn with a warm bloom. Single
 * source of truth for the spark symbol behind the corner spark stat and in
 * place of the inline `✦` glyph in rules text.
 *
 * The glyph is driven by `color` (the Boxicons font paints via the element's
 * text color) so callers pick the amber-gold spark hue. The icon's own
 * `font-size` is pinned to its rendered size so the `em`-based glow scales with
 * it.
 */

/** Solid amber-gold fill for the spark mark (matches the rules-text strategy). */
export const SPARKLE_COLOR = "#f3c33f";

/**
 * Subtle emitted-light bloom for the spark mark. Two stacked, zero-offset
 * `drop-shadow()` layers in the warm amber family (a tight hot core and a wider
 * softer halo), per the rules-text highlighting strategy: zero offset on every
 * layer reads as the glyph *being* the light source rather than casting a
 * shadow, and `drop-shadow` (not `text-shadow`) follows the glyph's actual alpha
 * silhouette so the glow hugs the star's points. Radii are in `em` so the bloom
 * scales with the icon: the component sets the icon's own `font-size` equal to
 * its rendered size, so `1em` always resolves to the icon size in both the small
 * inline rules glyph and the larger corner stat.
 */
export const SPARKLE_GLOW_FILTER =
  "drop-shadow(0 0 0.22em rgba(245, 205, 90, 0.6)) " +
  "drop-shadow(0 0 0.5em rgba(243, 180, 50, 0.34))";

export interface SparkleIconProps {
  /**
   * Rendered width/height as any CSS length. Defaults to `1em` so the inline
   * rules glyph tracks the surrounding text size. The icon's own `font-size` is
   * pinned to this value so the `em`-based glow scales with the icon.
   */
  size?: string;
  /** Fill color. Defaults to the amber-gold spark hue. */
  color?: string;
  /** When true (default), applies the subtle warm bloom. */
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; the icon is hidden from assistive tech when unset. */
  title?: string;
}

export function SparkleIcon({
  size = "1em",
  color = SPARKLE_COLOR,
  glow = true,
  className,
  style,
  title,
}: SparkleIconProps) {
  return (
    <i
      className={`bxf bx-sparkle${className ? ` ${className}` : ""}`}
      role={title !== undefined ? "img" : undefined}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
      style={{
        // Center the glyph in a square footprint so the corner stat's absolute
        // centering lands true and the inline rules glyph flows with the text.
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        // Pin font-size to the icon size so the glyph fills the box and the
        // `em`-based glow tracks it.
        fontSize: size,
        lineHeight: 1,
        color,
        filter: glow ? SPARKLE_GLOW_FILTER : undefined,
        ...style,
      }}
    />
  );
}

import type { CSSProperties } from "react";

/**
 * Boxicons filled "sparkle" glyph (a four-point concave star), inlined as an
 * SVG because the shipped Boxicons web font (v2.1.4) predates this icon — it
 * exists only in the newer Boxicons set, which is not published as an npm web
 * font. Single source of truth for the spark mark drawn behind the corner spark
 * stat and in place of the inline `✦` glyph in rules text.
 *
 * `viewBox="0 0 24 24"`, `fill="currentColor"` in the source; we drive the fill
 * via the `color` prop so callers pick the amber-gold spark hue.
 */
const SPARKLE_PATH =
  "m21.45 11.11-3-1.5-2.68-1.34-.03-.03-1.34-2.68-1.5-3c-.34-.68-1.45-.68-1.79 0l-1.5 3-1.34 2.68-.03.03-2.68 1.34-3 1.5c-.34.17-.55.52-.55.89s.21.72.55.89l3 1.5 2.68 1.34.03.03 1.34 2.68 1.5 3c.17.34.52.55.89.55s.72-.21.89-.55l1.5-3 1.34-2.68.03-.03 2.68-1.34 3-1.5c.34-.17.55-.52.55-.89s-.21-.72-.55-.89Z";

/** Solid amber-gold fill for the spark mark (matches the rules-text strategy). */
export const SPARKLE_COLOR = "#f3c33f";

/**
 * Subtle emitted-light bloom for the spark mark. Two stacked, zero-offset
 * `drop-shadow()` layers in the warm amber family (a tight hot core and a wider
 * softer halo), per the rules-text highlighting strategy: zero offset on every
 * layer reads as the glyph *being* the light source rather than casting a
 * shadow, and `drop-shadow` (not `text-shadow`) follows the glyph's actual alpha
 * silhouette so the glow hugs the star's points. Radii are in `em` so the bloom
 * scales with the icon: the component sets the SVG's own `font-size` equal to
 * its rendered size, so `1em` always resolves to the icon size in both the small
 * inline rules glyph and the larger corner stat.
 */
export const SPARKLE_GLOW_FILTER =
  "drop-shadow(0 0 0.22em rgba(245, 205, 90, 0.6)) " +
  "drop-shadow(0 0 0.5em rgba(243, 180, 50, 0.34))";

export interface SparkleIconProps {
  /**
   * Rendered width/height as any CSS length. Defaults to `1em` so the inline
   * rules glyph tracks the surrounding text size. The SVG's own `font-size` is
   * pinned to this value so the `em`-based glow scales with the icon.
   */
  size?: string;
  /** Fill color. Defaults to the amber-gold spark hue. */
  color?: string;
  /** When true (default), applies the subtle warm bloom. */
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; also rendered as a `<title>` when set. */
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
      style={{
        // Flow inline by default. Tailwind's preflight sets `svg { display:
        // block }`, which would otherwise drop the inline rules glyph onto its
        // own line; callers that position it absolutely override this.
        display: "inline-block",
        // Pin font-size to the icon size so the `em`-based glow tracks it.
        fontSize: size,
        fill: color,
        filter: glow ? SPARKLE_GLOW_FILTER : undefined,
        ...style,
      }}
    >
      {title !== undefined ? <title>{title}</title> : null}
      <path d={SPARKLE_PATH} />
    </svg>
  );
}

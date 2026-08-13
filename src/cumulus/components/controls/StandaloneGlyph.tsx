import { type Glyph, GLYPHS } from "../../primitives/glyph";
import { type CumulusColor, resolveColor } from "../../primitives/color";
import type { LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/**
 * A Boxicons glyph in a standalone one-em square. The surrounding layout owns
 * its font size and placement; this component owns centered glyph geometry,
 * semantic color, accessibility, and the optional content-protection depth
 * treatment used over card or scene media.
 *
 * Source of truth for the spark and energy hues: the corner stat orbs
 * (`CardStatOrb`) and the inline references in rules text (`RulesText`) pull the
 * same colors so a `●3` / `1✦` reads as the same resource in both places. The
 * Corner stats use the larger sparkle/flame glyphs through this component;
 * inline references use `InlineGlyph` in the matching hue.
 */

/** Solid amber-gold fill for the spark mark. */
export const SPARK_ICON_COLOR: CumulusColor = "#f3c33f";
/**
 * Blue fill for the energy mark shared by card corners and inline rules text.
 */
export const ENERGY_ICON_COLOR: CumulusColor = "#0ea5e9";

/** Boxicons filled classes for each resource mark, from the shared glyph registry. */
export const SPARK_ICON_CLASS: Glyph = GLYPHS.spark;
export const ENERGY_ICON_CLASS: Glyph = GLYPHS.energy;

/**
 * Filled lightning-bolt mark for ability timing. Shared by the card title-bar
 * fast/interrupt chips (`CardView`) and the inline `❖` / `❖❖` fast/interrupt
 * markers in rules text (`RulesText`) so both read as the same glyph.
 */
export const BOLT_ICON_CLASS: Glyph = GLYPHS.bolt;

/**
 * Spark glyph for inline rules text. The single "sparkle" star reads more
 * cleanly than the busier multi-star "sparkles" at the small inline size,
 * while the corner spark stat keeps `SPARK_ICON_CLASS` at its larger size.
 */
export const SPARK_INLINE_ICON_CLASS: Glyph = GLYPHS.sparkInline;

/**
 * Soft content-protection shadow that grounds the glyph against the art behind
 * it: a short downward dark blur plus a tight dark halo. This reads as depth
 * rather than the hard cartoon keyline a multi-offset solid outline produces.
 * Offsets/radii are in `em` so it tracks the surrounding layout's font size.
 */
export const GLYPH_CONTENT_PROTECTION_FILTER =
  "drop-shadow(0 0.03em 0.05em rgba(0, 0, 0, 0.55)) " +
  "drop-shadow(0 0 0.03em rgba(0, 0, 0, 0.45))";

/** Named depth treatments for a standalone glyph. */
export type StandaloneGlyphDepth = "flat" | "content-protection";

export interface StandaloneGlyphProps {
  /** The standalone {@link Glyph} to render. */
  glyph: Glyph;
  /** Fill {@link CumulusColor} — Boxicons paints via the element's text color. */
  color: CumulusColor;
  /** Flat by default; use content protection when the glyph sits over media. */
  depth?: StandaloneGlyphDepth;
  /** Accessible meaning; the glyph is hidden from assistive tech when unset. */
  label?: LocalizedString;
}

export function StandaloneGlyph({
  glyph,
  color,
  depth = "flat",
  label,
}: StandaloneGlyphProps) {
  const resolve = useLocalizer();
  return (
    <i
      className={glyph}
      role={label !== undefined ? "img" : undefined}
      aria-label={label === undefined ? undefined : resolve(label)}
      aria-hidden={label === undefined ? true : undefined}
      style={{
        // The caller controls font-size on its layout wrapper. This primitive
        // consumes exactly one em in each axis and centers the font glyph in it.
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1em",
        height: "1em",
        fontSize: "1em",
        lineHeight: 1,
        color: resolveColor(color),
        filter:
          depth === "content-protection"
            ? GLYPH_CONTENT_PROTECTION_FILTER
            : undefined,
      }}
    />
  );
}

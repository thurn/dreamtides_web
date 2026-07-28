import type { ReactElement } from "react";
import {
  type CumulusColor,
  resolveColor,
} from "../../primitives/color";
import type { Glyph } from "../../primitives/glyph";

export interface InlineGlyphProps {
  /** Named Boxicons glyph from the shared Cumulus glyph vocabulary. */
  glyph: Glyph;
  /** Optional semantic fill color. Omit to inherit the surrounding text color. */
  color?: CumulusColor;
  /** Accessible meaning. Omit only when surrounding copy already names the glyph. */
  label?: string;
}

/**
 * A Boxicons glyph for flowing text.
 *
 * The glyph occupies one square em and uses CSS's typographic `middle`
 * alignment: the square's center lands on the surrounding font's baseline plus
 * half its x-height, which is precisely the center of a lowercase `x`.
 */
export function InlineGlyph({
  glyph,
  color,
  label,
}: InlineGlyphProps): ReactElement {
  return (
    <i
      className={glyph}
      data-inline-glyph=""
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: "1em",
        height: "1em",
        fontSize: "1em",
        lineHeight: 1,
        verticalAlign: "middle",
        color: color === undefined ? undefined : resolveColor(color),
      }}
    />
  );
}

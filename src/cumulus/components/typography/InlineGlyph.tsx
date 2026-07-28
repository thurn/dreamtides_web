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
 * alignment as its baseline. The font-relative translation then moves that
 * center from half the x-height to half the cap height, matching a capital
 * `X` without baking in a font- or size-specific pixel offset. A plain outer
 * inline shell preserves that internal formatting context if an ancestor
 * blockifies the component as a flex or grid item.
 */
export function InlineGlyph({
  glyph,
  color,
  label,
}: InlineGlyphProps): ReactElement {
  return (
    <span
      data-inline-glyph=""
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      style={{
        color: color === undefined ? undefined : resolveColor(color),
      }}
    >
      <span
        data-inline-glyph-metric=""
        aria-hidden="true"
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: "1em",
          height: "1em",
          fontSize: "1em",
          lineHeight: 1,
          verticalAlign: "middle",
          transform: "translateY(calc(0.5ex - 0.5cap))",
        }}
      >
        <i
          className={glyph}
          aria-hidden="true"
          style={{
            fontSize: "1em",
            lineHeight: 1,
          }}
        />
      </span>
    </span>
  );
}

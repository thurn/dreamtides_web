// EssenceValue — the ONE way to show a player-facing essence amount outside
// flowing rules text: the number glued directly to the filled crypto glyph with
// no gap (`120◆`), kept on a single line. The amount carries no trailing
// "essence" word because the glyph names the currency.
//
// EssenceValue inherits its type from the surrounding context — it sets the
// color (via `tone`) and the tight number+glyph pairing, nothing else. Size and
// weight come from the element you place it in, so a caller controls scale by
// styling that container, never the value itself. (For a sized, self-contained
// economy chip on its own surface, reach for ResourceChip instead.)
//
// `EssenceGlyph` is the bare currency mark on its own, inheriting the
// surrounding text color and size — for the handful of surfaces that lay out the
// glyph and its number by hand.

import { token } from "../../primitives/tokens";
import { GLYPHS } from "../../primitives/glyph";

/** The filled Boxicons crypto glyph — the essence currency mark everywhere. */
const ESSENCE_ICON_CLASS = GLYPHS.essence;

/**
 * The essence currency glyph on its own, inheriting the surrounding text color
 * (so it tints with the value it follows) and size. The icon's mass sits low in
 * its em box, so a small upward nudge centers it on the digits it is glued to.
 */
export function EssenceGlyph() {
  return (
    <i
      aria-hidden="true"
      className={`${ESSENCE_ICON_CLASS} align-middle`}
      style={{ transform: "translateY(-0.06em)" }}
    />
  );
}

/** How the value is colored. */
export type EssenceTone = "value" | "inherit";

export interface EssenceValueProps {
  /** The essence amount. */
  amount: number | string;
  /**
   * Color role. `value` (default) paints the amount and glyph in the essence
   * violet; `inherit` takes the surrounding text color, for a value that sits
   * inside a button or other control whose label color already reads.
   */
  tone?: EssenceTone;
}

/**
 * Renders an essence amount as a currency value — the number glued to the crypto
 * glyph (`120◆`), the whole unit kept on one line and using tabular figures so
 * animating counts don't jitter.
 */
export function EssenceValue({ amount, tone = "value" }: EssenceValueProps) {
  return (
    // `tango` carries the design-token scope so `--essence` resolves when the
    // value is mounted outside a `.tango` subtree (e.g. a quest screen).
    <span
      className="tango"
      style={{
        color: tone === "inherit" ? "inherit" : token("--essence"),
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span>{amount}</span>
      <EssenceGlyph />
    </span>
  );
}

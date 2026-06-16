import type { ComponentPropsWithoutRef, CSSProperties } from "react";

/**
 * The filled Boxicons crypto glyph is the essence currency mark across the whole
 * prototype — the same mark essence references carry inside card and dreamsign
 * rules text (see `RulesText`). Pulling it into one module keeps every wallet,
 * price, reward, and cost surface drawing the identical glyph.
 */
export const ESSENCE_ICON_CLASS = "bxf bx-crypto";

/**
 * The purple essence reads in everywhere it is a *value* rather than a control
 * label. Mirrors the `--color-essence` token used by the surfaces that wrap an
 * essence amount.
 */
export const ESSENCE_VALUE_COLOR = "var(--color-essence)";

interface EssenceGlyphProps {
  /** Extra classes appended after the icon + alignment classes. */
  className?: string;
  /** Merged onto the glyph (after the centering nudge). */
  style?: CSSProperties;
}

/**
 * The essence currency glyph on its own. By default it inherits the surrounding
 * text color so it tints with the value it follows (purple for a plain value,
 * white inside a button). The icon's mass sits low in its em box, so a small
 * upward nudge centers it on the digits it is glued to.
 */
export function EssenceGlyph({ className, style }: EssenceGlyphProps) {
  return (
    <i
      aria-hidden="true"
      className={`${ESSENCE_ICON_CLASS} align-middle${className ? ` ${className}` : ""}`}
      style={{ transform: "translateY(-0.06em)", ...style }}
    />
  );
}

interface EssenceValueProps extends Omit<ComponentPropsWithoutRef<"span">, "color"> {
  /** The essence amount. */
  amount: number | string;
  /** Optional sign/prefix glued in front of the amount (e.g. `"+"` for gains). */
  prefix?: string;
  /**
   * Color for the amount and glyph. Defaults to the purple essence value color.
   * Pass `"inherit"` (or an explicit color) inside a button or other control so
   * the value reads in the control's own label color — white — rather than
   * purple.
   */
  color?: string;
}

/**
 * Renders an essence amount as a currency value: the number glued directly to
 * the crypto glyph with no space (`120◆`), the whole unit kept on one line. This
 * is the player-facing way to show essence anywhere outside flowing rules text;
 * the amount carries no trailing "essence" word because the glyph names the
 * currency. Any `data-*` / `aria-*` props are forwarded to the wrapper so test
 * hooks and accessibility labels stay attached to the value.
 */
export function EssenceValue({
  amount,
  prefix,
  color = ESSENCE_VALUE_COLOR,
  className,
  style,
  ...rest
}: EssenceValueProps) {
  return (
    <span
      className={className}
      style={{ color, whiteSpace: "nowrap", ...style }}
      {...rest}
    >
      <span className="tabular-nums">
        {prefix}
        {amount}
      </span>
      <EssenceGlyph />
    </span>
  );
}

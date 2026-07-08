// Button — rung 1 of Tango's four-rung button suite: the beveled purple sprite,
// the primary / commit action.
//
// The suite is four rungs of decreasing weight and emphasis:
//   1. Button — THIS beveled purple sprite (Button_Purple.png) drawn as a
//      scalable CSS 9-patch (border-image). The primary / commit action.
//   2. GlassButton — a labeled glass control-surface, a secondary chrome action
//      that sits quietly beside the filter/sort controls.
//   3. IconButton — the glass disc, a compact glyph-only chrome action (a deck
//      viewer's close control, the dreamscape menu).
//   4. Plain pressable text — tertiary / inline affordances (Back, Skip, Reset).
//
// Button stays the ONE purple sprite. A secondary action steps DOWN a rung —
// to a GlassButton, an IconButton, or plain pressable text — never to a
// recolored Button: the suite has one flat-gradient-free primary and expresses
// lower emphasis by rung, not by a second button color.
//
//   - one appearance — the chamfered purple sprite, sliced `56 fill` so it
//     scales to any label width AND height while the ornate corners stay
//     crisp.
//   - the commit action ("Begin Your Dream") is THE SAME BUTTON, taller —
//     `size="lg"`. Commit is a size, not a variant.
//   - press feedback routes through the shared press primitive: a
//     scale-DOWN by --press-scale (0.9), plus a slight brighten. Button
//     uses the `usePress` hook (not the `<Pressable>` wrapper component)
//     because it needs to combine the press transform with the brighten
//     filter on the very same element — exactly the composition case
//     Pressable.tsx's own doc comment calls out for the hook form.
//   - hover (fine pointer) lifts the button the opposite way — a small
//     scale-UP plus a violet drop-shadow glow that follows the sprite's
//     chamfered alpha — so the target invites the pointer before it's pressed.
//   - the inline price can be denominated in any economy currency via
//     `costKind` (essence / energy / spark / points / counter); the mark stays
//     the button's on-accent white and only its glyph shape changes.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/buttons/Button.jsx / .d.ts).

import { ECONOMY_MARKS, type EconomyKind } from "../hud/economy-spec";
import buttonPurple from "../../assets/Button_Purple.png";
import { HOVER_SCALE, PRESS_SCALE, usePress } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";

/** Height/scale variants. 'lg' is the taller commit height. */
type ButtonSize = "sm" | "md" | "lg";

interface SizeSpec {
  height: number;
  font: number;
  padding: string;
  borderWidth: number;
}

/** Border-image slice matching Button_Purple.png's (742x256) bevel + chamfer. */
const SLICE = 56;

const SIZES: Record<ButtonSize, SizeSpec> = {
  sm: { height: 42, font: 15, padding: "0 18px", borderWidth: 13 },
  md: { height: 50, font: 16, padding: "0 22px", borderWidth: 15 },
  // The "commit" height — same button, distinctly taller and heavier so the
  // commit action reads as the weightier choice, not a near-identical md.
  lg: { height: 62, font: 19, padding: "0 30px", borderWidth: 18 },
};

export interface ButtonProps {
  /** Height/scale. 'lg' is the taller commit height ("Begin Your Dream") — commit is a size, not a variant. */
  size?: ButtonSize;
  /** Stretch to fill the container width. */
  full?: boolean;
  /** Dims the button and detaches its click/press feedback. */
  disabled?: boolean;
  /** Appends an inline price, e.g. cost={100} -> "… 100◆", rendered in the
   * button's own on-accent white so the price reads as part of the label. The
   * currency is set by `costKind` (default essence). */
  cost?: number | null;
  /** Which currency the `cost` is denominated in — essence, energy, spark,
   * points, or counter. Picks the shared economy-spec price mark (bx-crypto /
   * bx-fire-alt / bx-sparkles / bx-star-circle / bx-hourglass); the mark stays
   * on-accent white. Default essence. Ignored when `cost` is null. */
  costKind?: EconomyKind;
  /** Fires when the button is activated (no-op while disabled). */
  onClick?: () => void;
  /** Accessible label when the visible content is a bare price with no text. */
  ariaLabel?: string;
  /** The button's text label. Resolve any UUID/name to a plain string before
   * passing it — the button renders copy, never arbitrary caller markup. Omit
   * only for a price-only button (supply `ariaLabel` instead). */
  label?: string;
}

/**
 * Button — the commit / primary rung of the button suite: the beveled purple
 * sprite drawn as a scalable CSS 9-patch. It is the ONE purple sprite; lower
 * emphasis steps down a rung (GlassButton, IconButton, plain pressable text),
 * never to a recolored Button. Press feedback routes through the shared
 * --press-scale primitive. The button has no style / className /
 * arbitrary-attribute escape hatch and takes no `children` slot: its one
 * appearance is fixed and only its typed props (size, full, disabled, cost,
 * costKind, label) shape it — the label is a resolved string, not caller
 * markup, so Button is a leaf, not a container.
 */
export function Button({
  size = "md",
  full = false,
  disabled = false,
  cost = null,
  costKind = "essence",
  onClick,
  ariaLabel,
  label,
}: ButtonProps) {
  const spec = SIZES[size];
  const borderWidth = spec.borderWidth;
  const { pressed, hovered, bind } = usePress();
  const on = pressed && !disabled;
  const lifted = hovered && !on && !disabled;
  // Hover glow (a violet drop-shadow that follows the sprite's chamfered alpha,
  // unlike a rectangular box-shadow) plus a brighten; press keeps the stronger
  // brighten. Composed into one filter so both effects can layer.
  const filterParts = [
    lifted ? "drop-shadow(0 0 12px rgba(168, 85, 247, 0.55))" : "",
    on ? "brightness(1.12)" : lifted ? "brightness(1.06)" : "",
  ].filter(Boolean);
  const transform = on
    ? `scale(${String(PRESS_SCALE)})`
    : lifted
      ? `scale(${String(HOVER_SCALE)})`
      : "none";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={disabled ? undefined : onClick}
      {...(disabled ? {} : bind)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        minHeight: spec.height,
        width: full ? "100%" : "auto",
        boxSizing: "border-box",
        padding: spec.padding,
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        borderStyle: "solid",
        borderWidth,
        borderColor: "transparent",
        borderImageSource: `url(${buttonPurple})`,
        borderImageSlice: `${String(SLICE)} fill`,
        borderImageWidth: `${String(borderWidth)}px`,
        borderImageRepeat: "stretch",
        font: `700 ${String(spec.font)}px/1.1 ${token("--font-ui")}`,
        letterSpacing: "0.01em",
        color: token("--text-on-accent"),
        textShadow: "0 1px 3px rgba(20, 2, 38, 0.85)",
        opacity: disabled ? 0.5 : 1,
        filter: filterParts.length > 0 ? filterParts.join(" ") : "none",
        transformOrigin: "center",
        transform,
        transition: `transform ${token("--dur-fast")} ${token("--ease-out")}, filter ${token("--dur-fast")} ${token("--ease-out")}`,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label != null && <span>{label}</span>}
      {cost != null && (
        // The price renders in the button's own on-accent white (inherited),
        // not the violet essence-role color — inside the purple sprite the mark
        // reads as part of the label, not a separate tinted chip.
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {cost}
          <i
            className={ECONOMY_MARKS[costKind].glyph}
            aria-hidden="true"
            style={{ fontSize: "1.04em", lineHeight: 1 }}
          />
        </span>
      )}
    </button>
  );
}

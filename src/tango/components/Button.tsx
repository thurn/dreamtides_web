// Button — the ONE button in Tango.
//
// The game uses a single button: the beveled purple sprite
// (Button_Purple.png) drawn as a scalable CSS 9-patch (border-image). There
// is no color-coded button language — no flat-gradient primary, no red
// commit pill, no danger/ghost variants. Low-emphasis and destructive
// actions (Back, Skip, Choose again, Reset, Leave) are plain pressable TEXT /
// ICON affordances plus confirmation copy, never a second button color.
//
//   - one appearance — the chamfered purple sprite, sliced `56 fill` so it
//     scales to any label width AND height while the ornate corners stay
//     crisp.
//   - the commit action ("Begin Your Dream") is THE SAME BUTTON, taller —
//     `size="lg"`. Commit is a size, not a variant.
//   - press feedback routes through the shared press primitive: a
//     scale-DOWN by --press-scale (0.94), plus a slight brighten. Button
//     uses the `usePress` hook (not the `<Pressable>` wrapper component)
//     because it needs to combine the press transform with the brighten
//     filter on the very same element — exactly the composition case
//     Pressable.tsx's own doc comment calls out for the hook form.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/buttons/Button.jsx / .d.ts).

import buttonPurple from "../assets/Button_Purple.png";
import { PRESS_SCALE, usePress } from "../primitives/Pressable";
import { token } from "../primitives/tokens";
import { ResourceChip } from "./ResourceChip";

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
  sm: { height: 44, font: 15, padding: "0 18px", borderWidth: 13 },
  md: { height: 52, font: 17, padding: "0 22px", borderWidth: 16 },
  // The "commit" height — same button, taller.
  lg: { height: 56, font: 17, padding: "0 26px", borderWidth: 16 },
};

export interface ButtonProps {
  /** Height/scale. 'lg' is the taller commit height ("Begin Your Dream") — commit is a size, not a variant. */
  size?: ButtonSize;
  /** Stretch to fill the container width. */
  full?: boolean;
  /** Dims the button and detaches its click/press feedback. */
  disabled?: boolean;
  /** Leading icon: a Boxicons class string (e.g. `"bxf bx-sword"`). The button
   * renders the `<i>` itself at a fixed size so every button icon matches. */
  icon?: string;
  /** Appends an inline essence price, e.g. cost={100} -> "… 100◆". */
  cost?: number | null;
  /** Fires when the button is activated (no-op while disabled). */
  onClick?: () => void;
  /** Accessible label when the visible content is icon-only. */
  ariaLabel?: string;
  /** The button's text label. Resolve any UUID/name to a plain string before
   * passing it — the button renders copy, never arbitrary caller markup. Omit
   * for an icon-only button (supply `ariaLabel` instead). */
  label?: string;
}

/**
 * Button — the ONE button: the beveled purple sprite drawn as a scalable CSS
 * 9-patch. There is no variant / color-coded button language — secondary and
 * destructive actions are plain pressable text/icon affordances. Press
 * feedback routes through the shared --press-scale primitive. The button has no
 * style / className / arbitrary-attribute escape hatch and takes no `children`
 * slot: its one appearance is fixed and only its typed props (size, full,
 * disabled, icon, cost, label) shape it — the label is a resolved string, not
 * caller markup, so Button is a leaf, not a container.
 */
export function Button({
  size = "md",
  full = false,
  disabled = false,
  icon,
  cost = null,
  onClick,
  ariaLabel,
  label,
}: ButtonProps) {
  const spec = SIZES[size];
  const borderWidth = spec.borderWidth;
  const { pressed, bind } = usePress();
  const on = pressed && !disabled;

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
        filter: on ? "brightness(1.12)" : "none",
        transformOrigin: "center",
        transform: on ? `scale(${String(PRESS_SCALE)})` : "none",
        transition: `transform ${token("--dur-fast")} ${token("--ease-out")}, filter ${token("--dur-fast")} ${token("--ease-out")}`,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {icon && (
        <span style={{ display: "inline-flex", fontSize: "1.1em" }}>
          <i className={icon} aria-hidden="true" />
        </span>
      )}
      {label != null && <span>{label}</span>}
      {cost != null && (
        <ResourceChip kind="essence" value={cost} size={spec.font} gap={3} />
      )}
    </button>
  );
}

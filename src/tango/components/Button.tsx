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

import * as React from "react";
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

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Height/scale. 'lg' is the taller commit height ("Begin Your Dream") — commit is a size, not a variant. */
  size?: ButtonSize;
  /** Stretch to fill the container width. */
  full?: boolean;
  disabled?: boolean;
  /** Leading icon node (a boxicon <i> element or a glyph). */
  icon?: React.ReactNode;
  /** Appends an inline essence price, e.g. cost={100} -> "… 100◆". */
  cost?: number | null;
  /** Scales the rendered sprite bevel thickness. Default 1. */
  frameScale?: number;
  // The JSDoc comment below is load-bearing, not decorative: without it,
  // react-docgen-typescript silently drops this `children` redeclaration
  // (a known quirk when a props interface extends a DOM attributes type that
  // already declares `children`), which would hide the prop from the doc
  // site's props table entirely. Keep the comment if you touch this field.
  /** Content rendered inside the button. */
  children?: React.ReactNode;
}

/**
 * usePress's `PressBind` is typed generically for `HTMLElement` handlers, but
 * a `<button>`'s own `onPointerDown`/etc. props are typed for the more
 * specific `HTMLButtonElement`. Both describe the exact same DOM node at
 * runtime, so this adapter narrows the event back down at the one call
 * boundary rather than widening ButtonProps' handler types (which would leak
 * the mismatch to every caller).
 */
function adaptPointerHandler(
  handler: React.PointerEventHandler<HTMLButtonElement> | undefined,
): ((event: React.PointerEvent<HTMLElement>) => void) | undefined {
  if (!handler) return undefined;
  return (event) => handler(event as React.PointerEvent<HTMLButtonElement>);
}

/**
 * Button — the ONE button: the beveled purple sprite drawn as a scalable CSS
 * 9-patch. There is no variant / color-coded button language — secondary and
 * destructive actions are plain pressable text/icon affordances. Press
 * feedback routes through the shared --press-scale primitive.
 */
export function Button({
  size = "md",
  full = false,
  disabled = false,
  icon = null,
  cost = null,
  frameScale = 1,
  children,
  style,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...rest
}: ButtonProps) {
  const spec = SIZES[size];
  const borderWidth = Math.max(6, Math.round(spec.borderWidth * frameScale));
  const { pressed, bind } = usePress({
    onPointerDown: adaptPointerHandler(onPointerDown),
    onPointerUp: adaptPointerHandler(onPointerUp),
    onPointerLeave: adaptPointerHandler(onPointerLeave),
    onPointerCancel: adaptPointerHandler(onPointerCancel),
  });
  const on = pressed && !disabled;

  return (
    <button
      type="button"
      disabled={disabled}
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
        font: `700 ${String(spec.font)}px/1.1 ${token("--font-sans")}`,
        letterSpacing: "0.01em",
        color: token("--text-on-accent"),
        textShadow: "0 1px 3px rgba(20, 2, 38, 0.85)",
        opacity: disabled ? 0.5 : 1,
        filter: on ? "brightness(1.12)" : "none",
        transformOrigin: "center",
        transform: on ? `scale(${String(PRESS_SCALE)})` : "none",
        transition: `transform ${token("--dur-fast")} ${token("--ease-out")}, filter ${token("--dur-fast")} ${token("--ease-out")}`,
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      {...rest}
    >
      {icon && (
        <span style={{ display: "inline-flex", fontSize: "1.1em" }}>
          {icon}
        </span>
      )}
      <span>{children}</span>
      {cost != null && (
        <ResourceChip kind="essence" value={cost} size={spec.font} gap={3} />
      )}
    </button>
  );
}

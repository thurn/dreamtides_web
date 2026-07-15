// IconButton — the compact glass icon disc in Cumulus's control suite.
//
// GlassButton carries labeled primary and secondary actions. THIS compact
// glyph-only glass disc is a chrome action that lives in a corner — a deck
// viewer's close control or the dreamscape menu — while a bare pressable glyph
// is the lightest inline affordance.
//
// The disc wears the ONE shared control material — `glassIconButtonChrome()`,
// the same liquid glass as the SegmentedControl / Select surface, made a
// fully-round disc — so a corner icon button reads as a member of the same
// family as the filter/sort controls it sits beside. Neutral glass serves
// secondary actions; the shared purple accent recipe gives a primary icon
// action the same emphasis as an accent GlassButton. A `GlowIcon` paints the
// glyph centered in the disc, and press/hover feedback routes through the one
// shared `Pressable` primitive (scale-down on press, up on hover). The disc
// shows only its glyph; `label` is its accessible name.

import type { ReactElement } from "react";
import { GlowIcon } from "./GlowIcon";
import { Pressable } from "../../primitives/Pressable";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  glassAccentChrome,
  glassIconButtonChrome,
} from "../../internal/control-treatment";

/** The two disc sizes the screens observed. `md` is the default. */
export type IconButtonSize = "sm" | "md";

/** Visual treatment for the glass icon-button surface. */
export type IconButtonVariant = "default" | "accent";

interface IconButtonSizeSpec {
  /** Diameter of the fully-round disc, in px. */
  disc: number;
  /** Glyph font size, in px. */
  glyph: number;
}

/**
 * The two observed size tuples (disc px / glyph font px). Exactly the two the
 * deck-viewer close control and dreamscape menu button use — no other sizes.
 */
const ICON_BUTTON_SIZES: Record<IconButtonSize, IconButtonSizeSpec> = {
  sm: { disc: 40, glyph: 22 },
  md: { disc: 48, glyph: 26 },
};

export interface IconButtonProps {
  /** The glyph painted centered in the disc (e.g. `GLYPHS.close`). */
  glyph: Glyph;
  /** Disc size — `sm` (40/22) or `md` (48/26). Defaults to `md`. */
  size?: IconButtonSize;
  /** The disc's accessible name (`aria-label`); the disc shows only its glyph. */
  label: string;
  /** Strict neutral or purple accent glass surface treatment. */
  variant?: IconButtonVariant;
  /** Fires when the disc is activated (no-op while disabled). */
  onPress: () => void;
  /** Detaches the click / press feedback and marks the disc `aria-disabled`. */
  disabled?: boolean;
  /**
   * Surface beneath the control. `onMedia` uses the full liquid-glass recipe;
   * `onGlass` uses a lighter tonal lens so an existing glass tint is not
   * compounded. Defaults to `onMedia`.
   */
  placement?: GlassControlPlacement;
  /**
   * When the disc is a disclosure trigger, its `aria-expanded` state (whether
   * the surface it controls is open). Omitted for a plain action button.
   */
  ariaExpanded?: boolean;
  /** Id of the disclosure surface controlled by this button. */
  ariaControls?: string;
  /** A `data-testid` for selecting the disc in tests. */
  testId?: string;
}

/**
 * IconButton — the glass icon disc: a `glassIconButtonChrome()` surface, a
 * centered `GlowIcon` glyph, and shared `Pressable` press/hover feedback, on a
 * fully-round disc. `label` names it for assistive tech; `disabled` detaches
 * its click and press feedback.
 */
export function IconButton({
  glyph,
  size = "md",
  label,
  variant = "default",
  onPress,
  disabled = false,
  placement = "onMedia",
  ariaExpanded,
  ariaControls,
  testId,
}: IconButtonProps): ReactElement {
  const spec = ICON_BUTTON_SIZES[size];
  return (
    <Pressable
      as="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      data-glass-placement={placement}
      data-glass-variant={variant}
      data-testid={testId}
      disabled={disabled}
      onClick={disabled ? undefined : onPress}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        width: spec.disc,
        height: spec.disc,
        display: "grid",
        placeItems: "center",
        // The glyph tracks the disc's font-size (GlowIcon size="1em"), matching
        // the call sites' rendered look.
        fontSize: spec.glyph,
        color: token("--text-primary"),
        ...glassIconButtonChrome(placement),
        ...(variant === "accent" ? glassAccentChrome(placement) : {}),
      }}
    >
      <GlowIcon iconClass={glyph} color="text-primary" size="1em" />
    </Pressable>
  );
}

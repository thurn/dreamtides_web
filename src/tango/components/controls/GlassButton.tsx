// GlassButton — the labeled glass secondary action, rung 2 of Tango's button
// suite.
//
// The suite is four rungs of decreasing weight: the beveled purple Button (the
// one commit / primary action), THIS labeled glass control (a secondary chrome
// action), the glyph-only glass IconButton (a corner chrome action), and a bare
// pressable glyph (the lightest inline affordance).
//
// GlassButton wears the ONE shared control material — `controlChrome().trigger`,
// the SAME liquid glass as the SegmentedControl / Select trigger — at the md
// control height (42px) and the control body typography (`--t-body`), so a
// labeled secondary action reads as one family with the filter/sort controls it
// sits beside, and stays quietly below the purple commit Button it defers to. A
// text `label` (a resolved string, never caller markup) sits in the control
// font; an optional leading `glyph` paints a `GlowIcon` before it. Press/hover
// feedback routes through the one shared `Pressable` primitive (scale-down on
// press, up on hover); `disabled` marks it `aria-disabled` and detaches its
// click and press feedback.

import type { ReactElement } from "react";
import { GlowIcon } from "./GlowIcon";
import { Pressable } from "../../primitives/Pressable";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { controlChrome } from "../../internal/control-treatment";

/** The md control height (px) — matches the Select / SegmentedControl cluster. */
const GLASS_BUTTON_HEIGHT = 42;

export interface GlassButtonProps {
  /** The button's text — a resolved string shown in the control typography. */
  label: string;
  /** Fires when the button is activated (no-op while disabled). */
  onPress: () => void;
  /** Optional leading glyph painted as a `GlowIcon` before the label. */
  glyph?: Glyph;
  /** Detaches the click / press feedback and marks the button `aria-disabled`. */
  disabled?: boolean;
}

/**
 * GlassButton — a `controlChrome().trigger` glass surface carrying a text
 * `label` in the control body typography, with an optional leading `glyph`.
 * Shared `Pressable` press/hover feedback; `disabled` detaches its click and
 * press feedback and marks it `aria-disabled`.
 */
export function GlassButton({
  label,
  onPress,
  glyph,
  disabled = false,
}: GlassButtonProps): ReactElement {
  const chrome = controlChrome();
  return (
    <Pressable
      as="button"
      disabled={disabled}
      onClick={disabled ? undefined : onPress}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: GLASS_BUTTON_HEIGHT,
        padding: "0 14px",
        boxSizing: "border-box",
        font: token("--t-body"),
        color: token("--text-primary"),
        whiteSpace: "nowrap",
        ...chrome.trigger,
      }}
    >
      {glyph !== undefined && (
        <GlowIcon
          iconClass={glyph}
          color={chrome.triggerGlyphColor}
          size="1.1em"
        />
      )}
      {label}
    </Pressable>
  );
}

// GlassButton — the labeled action on Cumulus's shared glass material.
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
// sits beside. Neutral glass serves secondary actions; the purple accent
// recipe lets a primary action retain the same material language. A
// text `label` (a resolved string, never caller markup) sits in the control
// font; an optional leading `glyph` paints a `GlowIcon` before it. Press/hover
// feedback routes through the one shared `Pressable` primitive (scale-down on
// press, up on hover); `disabled` dims the full control, marks it
// `aria-disabled`, and detaches its click and press feedback.

import type { ReactElement } from "react";
import { GlowIcon } from "./GlowIcon";
import { EssenceValue } from "../hud/EssenceValue";
import { Pressable } from "../../primitives/Pressable";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { controlChrome } from "../../internal/control-treatment";

/** The md control height (px) — matches the Select / SegmentedControl cluster. */
const GLASS_BUTTON_HEIGHT = 42;

/** Visual treatment for the glass button surface. */
export type GlassButtonVariant = "default" | "danger" | "accent";

/** Optional punctuation placed symmetrically between the label and a cost. */
export type GlassButtonCostSeparator = "dot";

/** One possible label/cost state whose intrinsic width the button reserves. */
export interface GlassButtonWidthReservation {
  label: string;
  cost?: number | null;
}

/**
 * Danger treatment for destructive actions: the accent soft-wash material in
 * red, preserving the same glass body, wash strength, rim, and shadow geometry.
 */
const dangerChromeOnMedia: React.CSSProperties = {
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--danger) 20%, transparent), color-mix(in srgb, var(--danger) 10%, transparent)), var(--glass-sheen), var(--glass-fill)",
  // Keep the same shorthand property as the base control material. Mixing its
  // `border` shorthand with a danger-only `borderColor` longhand makes React
  // clear the shorthand during danger → default rerenders, exposing the
  // inherited white text color as an unintended full-strength border.
  border: "1px solid color-mix(in srgb, var(--danger) 62%, white 38%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -12px 26px color-mix(in srgb, var(--danger) 12%, transparent), 0 10px 26px color-mix(in srgb, var(--danger) 26%, transparent)",
};

/** Danger accent balanced for a control nested on an existing glass surface. */
const dangerChromeOnGlass: React.CSSProperties = {
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--danger) 18%, transparent), color-mix(in srgb, var(--danger) 8%, transparent)), var(--glass-on-glass-sheen), var(--glass-on-glass-fill)",
  // Match the base material's shorthand so React can atomically replace and
  // restore the rim when a Purge action transitions danger → default.
  border: "1px solid color-mix(in srgb, var(--danger) 58%, white 42%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -10px 22px color-mix(in srgb, var(--danger) 10%, transparent), 0 8px 22px color-mix(in srgb, var(--danger) 22%, transparent)",
};

const accentChrome = {
  onMedia: {
    background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-bright) 20%, transparent), color-mix(in srgb, var(--accent-strong) 10%, transparent)), var(--glass-sheen), var(--glass-fill)",
    border: "1px solid color-mix(in srgb, var(--accent-bright) 62%, white 38%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -12px 26px color-mix(in srgb, var(--accent-strong) 12%, transparent), 0 10px 26px color-mix(in srgb, var(--accent) 26%, transparent)",
  },
  onGlass: {
    background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-bright) 18%, transparent), color-mix(in srgb, var(--accent-strong) 8%, transparent)), var(--glass-on-glass-sheen), var(--glass-on-glass-fill)",
    border: "1px solid color-mix(in srgb, var(--accent-bright) 58%, white 42%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -10px 22px color-mix(in srgb, var(--accent-strong) 10%, transparent), 0 8px 22px color-mix(in srgb, var(--accent) 22%, transparent)",
  },
};

export interface GlassButtonProps {
  /** The button's text, centered by the component at every rendered width. */
  label: string;
  /** Fires when the button is activated (no-op while disabled). */
  onPress: () => void;
  /** Optional leading glyph painted as a `GlowIcon` before the label. */
  glyph?: Glyph;
  /** Optional inline essence cost rendered after the label. */
  cost?: number | null;
  /** Optional separator rendered between the label and a present cost. */
  costSeparator?: GlassButtonCostSeparator;
  /**
   * Possible dynamic label/cost states. The button reserves the widest state
   * while rendering only the current one, preventing surrounding layout shift.
   */
  widthReservations?: readonly GlassButtonWidthReservation[];
  /** Strict neutral, danger, or purple accent glass surface treatment. */
  variant?: GlassButtonVariant;
  /**
   * Surface beneath the control. `onMedia` uses the full liquid-glass recipe;
   * `onGlass` uses a lighter tonal lens so an existing glass tint is not
   * compounded. Defaults to `onMedia`.
   */
  placement?: GlassControlPlacement;
  /** Dims the control, detaches click / press feedback, and marks it `aria-disabled`. */
  disabled?: boolean;
  /** A `data-testid` for selecting the button in tests. */
  testId?: string;
}

/**
 * GlassButton — a `controlChrome().trigger` glass surface carrying a text
 * `label` in the control body typography, with an optional leading `glyph`.
 * Shared `Pressable` press/hover feedback; `disabled` dims the complete glass
 * control, detaches its interaction, and marks it `aria-disabled`.
 */
export function GlassButton({
  label,
  onPress,
  glyph,
  cost = null,
  costSeparator,
  widthReservations = [],
  variant = "default",
  placement = "onMedia",
  disabled = false,
  testId,
}: GlassButtonProps): ReactElement {
  const chrome = controlChrome(placement);
  const variantChrome = resolveVariantChrome(variant, placement);
  return (
    <Pressable
      as="button"
      data-glass-placement={placement}
      data-glass-variant={variant}
      data-testid={testId}
      disabled={disabled}
      onClick={disabled ? undefined : onPress}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: GLASS_BUTTON_HEIGHT,
        padding: "0 14px",
        boxSizing: "border-box",
        font: token("--t-body"),
        color: token("--text-on-glass"),
        textAlign: "center",
        whiteSpace: "nowrap",
        ...chrome.trigger,
        ...variantChrome,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {glyph !== undefined && (
        <GlowIcon
          iconClass={glyph}
          color={chrome.triggerGlyphColor}
          size="1.1em"
        />
      )}
      <span
        style={
          widthReservations.length === 0
            ? { display: "contents" }
            : { display: "grid" }
        }
      >
        <GlassButtonContent
          label={label}
          cost={cost}
          costSeparator={costSeparator}
        />
        {widthReservations.map((reservation, index) => (
          <span
            key={`${reservation.label}-${String(reservation.cost)}-${String(index)}`}
            aria-hidden="true"
            data-glass-button-width-reservation=""
            style={{
              gridArea: "1 / 1",
              visibility: "hidden",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <GlassButtonContent
              label={reservation.label}
              cost={reservation.cost ?? null}
              costSeparator={costSeparator}
            />
          </span>
        ))}
      </span>
    </Pressable>
  );
}

function resolveVariantChrome(
  variant: GlassButtonVariant,
  placement: GlassControlPlacement,
): React.CSSProperties {
  if (variant === "default") return {};
  if (variant === "danger") {
    return placement === "onGlass" ? dangerChromeOnGlass : dangerChromeOnMedia;
  }
  return accentChrome[placement];
}

function GlassButtonContent({
  label,
  cost,
  costSeparator,
}: {
  readonly label: string;
  readonly cost: number | null;
  readonly costSeparator: GlassButtonCostSeparator | undefined;
}): ReactElement {
  return (
    <span
      data-glass-button-content=""
      style={{
        gridArea: "1 / 1",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <span>{label}</span>
      {cost !== null && costSeparator === "dot" && (
        <span aria-hidden="true" data-glass-button-cost-separator="">
          ·
        </span>
      )}
      {cost !== null && <EssenceValue amount={cost} tone="inherit" />}
    </span>
  );
}

// GlassButton — the labeled action on Tango's shared glass material.
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
// sits beside. Neutral glass serves secondary actions; strict purple accent
// recipes let a primary action retain the same material language. A
// text `label` (a resolved string, never caller markup) sits in the control
// font; an optional leading `glyph` paints a `GlowIcon` before it. Press/hover
// feedback routes through the one shared `Pressable` primitive (scale-down on
// press, up on hover); `disabled` marks it `aria-disabled` and detaches its
// click and press feedback.

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

/** Purple primary-action recipes available while the accent glass is tuned. */
export const ACCENT_GLASS_BUTTON_VARIANTS = [
  "accent-rim",
  "accent-wash",
  "accent-glow",
  "accent-depth",
  "accent-danger",
] as const;

export type AccentGlassButtonVariant =
  (typeof ACCENT_GLASS_BUTTON_VARIANTS)[number];

/** Visual treatment for the glass button surface. */
export type GlassButtonVariant =
  | "default"
  | "danger"
  | AccentGlassButtonVariant;

/** One possible label/cost state whose intrinsic width the button reserves. */
export interface GlassButtonWidthReservation {
  label: string;
  cost?: number | null;
}

/**
 * Danger treatment for destructive secondary actions: the same glass body
 * with a red rim, light red wash, and red outer glow so the media still reads
 * through the control.
 */
const dangerChromeOnMedia: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(244, 43, 72, 0.12), rgba(150, 12, 35, 0.10)), var(--glass-sheen), rgba(22, 14, 32, 0.38)",
  // Keep the same shorthand property as the base control material. Mixing its
  // `border` shorthand with a danger-only `borderColor` longhand makes React
  // clear the shorthand during danger → default rerenders, exposing the
  // inherited white text color as an unintended full-strength border.
  border: "1px solid rgba(255, 111, 130, 0.92)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -14px 30px rgba(150, 12, 35, 0.10), 0 0 0 1px rgba(244, 43, 72, 0.20), 0 14px 36px rgba(244, 43, 72, 0.44)",
};

/** Danger accent balanced for a control nested on an existing glass surface. */
const dangerChromeOnGlass: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(244, 43, 72, 0.13), rgba(150, 12, 35, 0.08)), var(--glass-on-glass-sheen), var(--glass-on-glass-fill)",
  // Match the base material's shorthand so React can atomically replace and
  // restore the rim when a Purge action transitions danger → default.
  border: "1px solid rgba(255, 111, 130, 0.82)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -12px 24px rgba(150, 12, 35, 0.08), 0 0 0 1px rgba(244, 43, 72, 0.16), 0 10px 28px rgba(244, 43, 72, 0.28)",
};

interface PlacementChrome {
  readonly onMedia: React.CSSProperties;
  readonly onGlass: React.CSSProperties;
}

const ACCENT_CHROME: Readonly<
  Record<AccentGlassButtonVariant, PlacementChrome>
> = {
  "accent-rim": {
    onMedia: {
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, transparent), transparent), var(--glass-sheen), var(--glass-fill)",
      border: "1px solid color-mix(in srgb, var(--accent-bright) 78%, white 22%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.26), 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent), 0 8px 22px color-mix(in srgb, var(--accent) 18%, transparent)",
    },
    onGlass: {
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent), var(--glass-on-glass-sheen), var(--glass-on-glass-fill)",
      border: "1px solid color-mix(in srgb, var(--accent-bright) 72%, white 28%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent), 0 8px 20px color-mix(in srgb, var(--accent) 16%, transparent)",
    },
  },
  "accent-wash": {
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
  },
  "accent-glow": {
    onMedia: {
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-bright) 10%, transparent), color-mix(in srgb, var(--accent-strong) 5%, transparent)), var(--glass-sheen), var(--glass-fill)",
      border: "1px solid color-mix(in srgb, var(--accent-bright) 88%, white 12%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 1px color-mix(in srgb, var(--accent) 32%, transparent), 0 0 22px color-mix(in srgb, var(--accent-bright) 46%, transparent), 0 16px 42px color-mix(in srgb, var(--accent-strong) 38%, transparent)",
    },
    onGlass: {
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-bright) 10%, transparent), color-mix(in srgb, var(--accent-strong) 4%, transparent)), var(--glass-on-glass-sheen), var(--glass-on-glass-fill)",
      border: "1px solid color-mix(in srgb, var(--accent-bright) 84%, white 16%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32), 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), 0 0 18px color-mix(in srgb, var(--accent-bright) 40%, transparent), 0 12px 34px color-mix(in srgb, var(--accent-strong) 32%, transparent)",
    },
  },
  "accent-depth": {
    onMedia: {
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-bright) 28%, transparent), color-mix(in srgb, var(--accent-strong) 22%, transparent)), var(--glass-sheen), var(--glass-fill)",
      border: "1px solid color-mix(in srgb, var(--accent-bright) 74%, white 26%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.34), inset 0 -16px 30px color-mix(in srgb, var(--accent-strong) 30%, transparent), 0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent), 0 14px 34px color-mix(in srgb, var(--accent-strong) 34%, transparent)",
    },
    onGlass: {
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-bright) 24%, transparent), color-mix(in srgb, var(--accent-strong) 18%, transparent)), var(--glass-on-glass-sheen), var(--glass-on-glass-fill)",
      border: "1px solid color-mix(in srgb, var(--accent-bright) 70%, white 30%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -14px 26px color-mix(in srgb, var(--accent-strong) 26%, transparent), 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent), 0 11px 30px color-mix(in srgb, var(--accent-strong) 28%, transparent)",
    },
  },
  "accent-danger": {
    // The danger recipe translated from ember red to brand violet: the same
    // wash/rim/glow hierarchy, with the shared glass layers kept intact.
    onMedia: {
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-bright) 12%, transparent), color-mix(in srgb, var(--accent-strong) 10%, transparent)), var(--glass-sheen), var(--glass-fill)",
      border: "1px solid color-mix(in srgb, var(--accent-bright) 82%, white 18%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -14px 30px color-mix(in srgb, var(--accent-strong) 10%, transparent), 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent), 0 14px 36px color-mix(in srgb, var(--accent) 44%, transparent)",
    },
    onGlass: {
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-bright) 13%, transparent), color-mix(in srgb, var(--accent-strong) 8%, transparent)), var(--glass-on-glass-sheen), var(--glass-on-glass-fill)",
      border: "1px solid color-mix(in srgb, var(--accent-bright) 76%, white 24%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -12px 24px color-mix(in srgb, var(--accent-strong) 8%, transparent), 0 0 0 1px color-mix(in srgb, var(--accent) 16%, transparent), 0 10px 28px color-mix(in srgb, var(--accent) 28%, transparent)",
    },
  },
};

export interface GlassButtonProps {
  /** The button's text — a resolved string shown in the control typography. */
  label: string;
  /** Fires when the button is activated (no-op while disabled). */
  onPress: () => void;
  /** Optional leading glyph painted as a `GlowIcon` before the label. */
  glyph?: Glyph;
  /** Optional inline essence cost rendered after the label. */
  cost?: number | null;
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
  /** Detaches the click / press feedback and marks the button `aria-disabled`. */
  disabled?: boolean;
  /** A `data-testid` for selecting the button in tests. */
  testId?: string;
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
  cost = null,
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
        gap: 8,
        height: GLASS_BUTTON_HEIGHT,
        padding: "0 14px",
        boxSizing: "border-box",
        font: token("--t-body"),
        color: token("--text-on-glass"),
        whiteSpace: "nowrap",
        ...chrome.trigger,
        ...variantChrome,
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
        <GlassButtonContent label={label} cost={cost} />
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
  return ACCENT_CHROME[variant][placement];
}

function GlassButtonContent({
  label,
  cost,
}: {
  readonly label: string;
  readonly cost: number | null;
}): ReactElement {
  return (
    <span
      style={{
        gridArea: "1 / 1",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>{label}</span>
      {cost !== null && <EssenceValue amount={cost} tone="inherit" />}
    </span>
  );
}

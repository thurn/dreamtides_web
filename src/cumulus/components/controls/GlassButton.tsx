// GlassButton — the labeled action on Cumulus's shared glass material.
//
// The accent variant is the primary / commit action. Neutral glass serves
// secondary chrome, the glyph-only IconButton serves compact corner actions,
// and a bare pressable glyph is the lightest inline affordance.
//
// GlassButton wears the ONE shared control material — `controlChrome().trigger`,
// the SAME liquid glass as the SegmentedControl / Select trigger — at the md
// control height (42px) and the bold button typography (`--t-button`), so a
// labeled secondary action reads as one family with the filter/sort controls it
// sits beside. Neutral glass serves secondary actions; the purple accent
// recipe lets a primary action retain the same material language. A
// text `label` (a resolved string, never caller markup) sits in the control
// font; an optional leading `glyph` paints a `StandaloneGlyph` before it. Essence can
// be presented either as a punctuated cost or as a plain action value. Prominent
// primary actions can opt into the larger 56px treatment. Press/hover
// feedback routes through the one shared `Pressable` primitive (scale-down on
// press, up on hover); `disabled` dims the full control, marks it
// `aria-disabled`, and detaches its click and press feedback.

import type { LocalizedString } from "@trox/runtime";
import type { ReactElement } from "react";
import { StandaloneGlyph } from "./StandaloneGlyph";
import { EssenceValue } from "../hud/EssenceValue";
import { Pressable } from "../../primitives/Pressable";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  controlChrome,
  glassAccentChrome,
} from "../../internal/control-treatment";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** Named control heights (px): standard aligns with the control cluster while
 * prominent supplies the larger primary-action target. */
const GLASS_BUTTON_HEIGHT = {
  compact: 42,
  standard: 42,
  prominent: 56,
} as const;

/** Visual treatment for the glass button surface. */
export type GlassButtonVariant = "default" | "danger" | "accent";

/** Horizontal density and label scale; both sizes preserve the 42px target. */
export type GlassButtonSize = "prominent" | "standard" | "compact";

/** One possible label/essence-cost state whose intrinsic width is reserved. */
export interface GlassButtonWidthReservation {
  label?: LocalizedString;
  authoredLabel?: string;
  essenceCost?: number | null;
}

/** Core GlassButton props shared by structured action models. */
export interface GlassButtonAction {
  /** The button's text, centered by the component at every rendered width. */
  label?: LocalizedString;
  /** Button text supplied by canonical authored or developer-only content. */
  authoredLabel?: string;
  /** Fires when the button is activated (no-op while disabled). */
  onPress: () => void;
  /** Optional leading glyph painted as a `StandaloneGlyph` before the label. */
  glyph?: Glyph;
  /** Optional numerical essence cost rendered after a centered dot. */
  essenceCost?: number | null;
  /** Strict surface treatment: accent for primary/commit actions, default for
   * secondary actions, or danger for destructive actions. */
  variant?: GlassButtonVariant;
  /** Dims the control, detaches click / press feedback, and marks it `aria-disabled`. */
  disabled?: boolean;
  /** A `data-testid` for selecting the button in tests. */
  testId?: string;
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

interface GlassButtonOptions {
  /** Optional non-cost Essence value rendered directly after the label. */
  essenceValue?: number | null;
  /** Prominent primary-action sizing, standard label spacing, or compact
   * spacing for narrow parallel actions. */
  size?: GlassButtonSize;
  /**
   * Possible dynamic label/essence-cost states. The button reserves the widest
   * state while rendering only the current one, preventing surrounding layout
   * shift.
   */
  widthReservations?: readonly GlassButtonWidthReservation[];
  /**
   * Surface beneath the control. `onMedia` uses the full liquid-glass recipe;
   * `onGlass` uses a lighter tonal lens so an existing glass tint is not
   * compounded. Defaults to `onMedia`.
   */
  placement?: GlassControlPlacement;
  /** Toggle state for controls whose action switches a persistent local mode. */
  pressed?: boolean;
  /** Accessible name when the visible label alone does not distinguish siblings. */
  accessibilityLabel?: LocalizedString;
  /** Accessible name supplied by canonical authored or developer-only copy. */
  authoredAccessibilityLabel?: string;
}

export interface GlassButtonProps
  extends GlassButtonAction, GlassButtonOptions {}

/**
 * GlassButton — a `controlChrome().trigger` glass surface carrying a text
 * `label` in the control body typography, with an optional leading `glyph`.
 * Shared `Pressable` press/hover feedback; `disabled` dims the complete glass
 * control, detaches its interaction, and marks it `aria-disabled`.
 */
export function GlassButton({
  label,
  authoredLabel,
  onPress,
  glyph,
  essenceCost = null,
  essenceValue = null,
  size = "standard",
  widthReservations = [],
  variant = "default",
  placement = "onMedia",
  disabled = false,
  pressed,
  accessibilityLabel,
  authoredAccessibilityLabel,
  testId,
}: GlassButtonProps): ReactElement {
  const resolve = useLocalizer();
  if ((label === undefined) === (authoredLabel === undefined)) {
    throw new Error(
      "GlassButton requires exactly one of label or authoredLabel.",
    );
  }
  if (accessibilityLabel !== undefined && authoredAccessibilityLabel !== undefined) {
    throw new Error("GlassButton accepts accessibilityLabel or authoredAccessibilityLabel, not both.");
  }
  const chrome = controlChrome(placement);
  const variantChrome = resolveVariantChrome(variant, placement);
  return (
    <Pressable
      as="button"
      data-glass-placement={placement}
      data-glass-variant={variant}
      data-testid={testId}
      aria-label={
        authoredAccessibilityLabel ?? (accessibilityLabel === undefined
          ? undefined
          : resolve(accessibilityLabel))
      }
      aria-pressed={pressed}
      data-pressed={pressed === undefined ? undefined : String(pressed)}
      disabled={disabled}
      onClick={disabled ? undefined : onPress}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-s"),
        height: GLASS_BUTTON_HEIGHT[size],
        padding:
          size === "prominent"
            ? `0 ${token("--space-2xl")}`
            : size === "compact"
              ? `0 ${token("--space-s")}`
              : `0 ${token("--space-l")}`,
        boxSizing: "border-box",
        font:
          size === "prominent"
            ? token("--t-button-lg")
            : size === "compact"
              ? token("--t-button-sm")
              : token("--t-button"),
        color: token("--text-on-glass"),
        textAlign: "center",
        whiteSpace: "nowrap",
        ...chrome.trigger,
        ...variantChrome,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {glyph !== undefined && (
        <span style={{ display: "inline-flex", fontSize: "1.1em" }}>
          <StandaloneGlyph glyph={glyph} color={chrome.triggerGlyphColor} />
        </span>
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
          authoredLabel={authoredLabel}
          essenceCost={essenceCost}
          essenceValue={essenceValue}
        />
        {widthReservations.map((reservation, index) => (
          <span
            key={`${String(reservation.essenceCost)}-${String(index)}`}
            aria-hidden="true"
            data-glass-button-width-reservation=""
            style={{
              gridArea: "1 / 1",
              visibility: "hidden",
              display: "inline-flex",
              alignItems: "center",
              gap: 0,
            }}
          >
            <GlassButtonContent
              label={reservation.label}
              authoredLabel={reservation.authoredLabel}
              essenceCost={reservation.essenceCost ?? null}
              essenceValue={null}
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
  return glassAccentChrome(placement);
}

function GlassButtonContent({
  label,
  authoredLabel,
  essenceCost,
  essenceValue,
}: {
  readonly label?: LocalizedString;
  readonly authoredLabel?: string;
  readonly essenceCost: number | null;
  readonly essenceValue: number | null;
}): ReactElement {
  const resolve = useLocalizer();
  if ((label === undefined) === (authoredLabel === undefined)) {
    throw new Error(
      "GlassButton content requires exactly one localized or authored label.",
    );
  }
  return (
    <span
      data-glass-button-content=""
      style={{
        gridArea: "1 / 1",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
      }}
    >
      <span>{label === undefined ? authoredLabel : resolve(label)}</span>
      {essenceCost !== null && (
        <span
          data-glass-button-essence-cost=""
          style={{ marginLeft: token("--space-xs") }}
        >
          {" · "}
          <EssenceValue amount={essenceCost} tone="inherit" />
        </span>
      )}
      {essenceValue !== null && (
        <span
          data-glass-button-essence-value=""
          style={{ marginLeft: token("--space-xs") }}
        >
          <EssenceValue amount={essenceValue} tone="inherit" />
        </span>
      )}
    </span>
  );
}

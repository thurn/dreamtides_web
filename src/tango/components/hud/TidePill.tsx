// TidePill — the labelled tag used for a Dreamcaller's tides/affiliations/
// categories. `tone` picks one of the brand's tide colors; the pill shows the
// tide's icon + name.
//
// A TidePill ALWAYS carries its tide description: hovering (fine pointer) or
// pressing (touch) a pill reveals that copy through the ONE shared popover,
// InfoCard, so a reader always learns what a tide means without leaving the
// screen. The reveal is baked into the component (the `description` prop is
// required) rather than left to each caller, so the pairing can never be
// forgotten and every tide popup reads identically. The reveal routes through
// InfoCard's `usePressReveal` + `anchorRect` + `PressPopover` engine — the same
// input-adaptive contract the dreamsign strip and site discs use — so timing,
// placement, and the on-screen clamp cannot diverge. Pass `stageRef` (the
// screen root) for the anchored, clamped reveal; omit it and the card floats
// directly above the pill (standalone / list use).
//
// Colors are token-driven, never a raw hex duplicating a token:
//   - violet -> --accent-bright / --primitive-violet-400 (also the source of
//     --accent-tint / --border-accent, whose alpha values these washes match)
//   - blue   -> --energy / --primitive-energy-300 (the game's blue resource role)
//   - gold   -> --primitive-gold-300 / --primitive-gold-500
//   - green  -> --positive (== --primitive-sap-400, the player/grant green)
//   - rust   -> --primitive-rust-500 (already documented as "tide / earthy affiliation")
//   - red    -> --danger (== --primitive-ember-500) / --primitive-ember-400
//   - neutral -> a muted surface (--text-secondary / --border-mid), with an
//     alpha wash that has no dedicated token and is copied verbatim from the
//     source
// The alpha-tinted backgrounds/borders that have no dedicated wash token use
// `color-mix()` against the base color token rather than a hardcoded rgba, so
// a future token rename/reband still propagates.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/pills/TidePill.jsx / .d.ts).

import * as React from "react";
import { createPortal } from "react-dom";
import { InfoCard } from "../overlay/InfoCard";
import { richText } from "../card/rich-text";
import { token } from "../../primitives/tokens";
import { type Glyph } from "../../primitives/glyph";
import { type TangoColor } from "../../primitives/color";

const { usePressReveal, anchorRect, PressPopover, PRESS_SCALE } = InfoCard;

/** Height/scale variants. */
type TidePillSize = "sm" | "md";

interface ToneSpec {
  bg: string;
  fg: string;
  bd: string;
  /** The tone's accent color for the reveal disc, as a strict {@link TangoColor}
   * (the pill's own `fg` is a resolved color-mix / token string, which is not a
   * valid disc accent — the disc derives its ring/glow alpha via color-mix). */
  disc: TangoColor;
}

/** The parent design system's tide colors, normalized to Tango tokens. */
const TONES: Record<string, ToneSpec> = {
  violet: {
    bg: token("--accent-tint"),
    fg: token("--accent-bright"),
    bd: token("--border-accent"),
    disc: "accent-bright",
  },
  blue: {
    bg: `color-mix(in srgb, ${token("--energy")} 18%, transparent)`,
    fg: token("--primitive-energy-300"),
    bd: `color-mix(in srgb, ${token("--energy")} 45%, transparent)`,
    disc: "energy-bright",
  },
  gold: {
    bg: `color-mix(in srgb, ${token("--primitive-gold-500")} 18%, transparent)`,
    fg: token("--primitive-gold-300"),
    bd: `color-mix(in srgb, ${token("--primitive-gold-500")} 45%, transparent)`,
    disc: "gold-light",
  },
  green: {
    bg: `color-mix(in srgb, ${token("--positive")} 18%, transparent)`,
    fg: token("--positive"),
    bd: `color-mix(in srgb, ${token("--positive")} 45%, transparent)`,
    disc: "positive",
  },
  rust: {
    bg: `color-mix(in srgb, ${token("--primitive-rust-500")} 20%, transparent)`,
    fg: `color-mix(in srgb, ${token("--primitive-rust-500")} 45%, white)`,
    bd: `color-mix(in srgb, ${token("--primitive-rust-500")} 50%, transparent)`,
    disc: "#d8a98d",
  },
  red: {
    bg: `color-mix(in srgb, ${token("--danger")} 18%, transparent)`,
    fg: token("--primitive-ember-400"),
    bd: `color-mix(in srgb, ${token("--danger")} 45%, transparent)`,
    disc: "#f87171",
  },
  // No dedicated wash token for this washed-out neutral fill; copied verbatim
  // from the source, matching SegmentedControl's track-background precedent.
  neutral: {
    bg: "rgba(255, 255, 255, 0.06)",
    fg: token("--text-secondary"),
    bd: token("--border-mid"),
    disc: "text-secondary",
  },
};

export interface TidePillProps {
  /** The tide/affiliation name. Resolve any UUID to the display name before
   * passing it — the pill renders copy from a plain string, not caller markup,
   * so TidePill is a leaf, not a container. */
  label: string;
  /** The tide's description, revealed through the shared InfoCard on hover /
   * press. Required: a TidePill always carries its description so the reveal
   * can never be forgotten. Plain prose — resolve before display. */
  description: string;
  /** Tide color. */
  tone?: "violet" | "blue" | "gold" | "green" | "rust" | "red" | "neutral";
  /** Leading icon: a {@link Glyph} (e.g. `GLYPHS.water`). The pill renders the
   * `<i>` itself at a fixed size so every tide icon matches, and it heads the
   * InfoCard reveal as the tide's glyph disc. */
  icon?: Glyph;
  /** Height/scale. Default 'md'. */
  size?: TidePillSize;
  /**
   * Screen root the reveal anchors + clamps against. Pass it for the
   * material-continuity reveal (preferred); omit it and the card floats
   * directly above the pill.
   */
  stageRef?: React.RefObject<HTMLElement | null>;
  /** Fires on a tap / click that was not a deliberate hold-to-read. */
  onPress?: () => void;
}

/**
 * TidePill — the labelled tag for a Dreamcaller's tides/affiliations/
 * categories (icon + name). Hovering (fine pointer) or pressing (touch) the
 * pill always reveals the tide's `description` through the ONE shared InfoCard;
 * pass `stageRef` for the anchored, clamped reveal or omit it to float the card
 * directly above the pill.
 */
export function TidePill({
  label,
  description,
  tone = "violet",
  icon,
  size = "md",
  stageRef,
  onPress,
}: TidePillProps) {
  const spec = TONES[tone] ?? TONES.violet;
  const pad = size === "sm" ? "3px 9px" : "5px 12px";
  const ref = React.useRef<HTMLSpanElement>(null);
  const { pressed, shown, begin, end, enter, leave, heldPastTap } =
    usePressReveal();
  const [anchor, setAnchor] = React.useState<ReturnType<
    typeof anchorRect
  > | null>(null);

  const useStage = Boolean(stageRef?.current);

  React.useLayoutEffect(() => {
    if (shown && useStage && stageRef?.current && ref.current) {
      setAnchor(anchorRect(stageRef.current, ref.current));
    } else {
      setAnchor(null);
    }
  }, [shown, useStage, stageRef]);

  const onUp = (): void => {
    const tap = !heldPastTap();
    end();
    if (tap && onPress) {
      onPress();
    }
  };

  // The reveal: the tide's icon heads an InfoCard `icon` disc tinted to its own
  // tone; a tide without a glyph falls back to the plain `text` variant. The
  // description renders as plain prose through the shared rich-text model.
  const card =
    icon !== undefined ? (
      <InfoCard
        variant="icon"
        glyph={icon}
        discAccent={spec.disc}
        title={label}
        body={richText.plain(description)}
      />
    ) : (
      <InfoCard variant="text" title={label} body={richText.plain(description)} />
    );

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`Tide: ${label}`}
      onPointerEnter={enter}
      onPointerDown={begin}
      onPointerUp={onUp}
      onPointerLeave={leave}
      onPointerCancel={end}
      onKeyDown={
        onPress
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPress();
              }
            }
          : undefined
      }
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flex: "none",
        padding: pad,
        borderRadius: token("--radius-pill"),
        background: spec.bg,
        border: `1px solid ${spec.bd}`,
        color: spec.fg,
        font: `600 ${size === "sm" ? 12 : 13}px/1 ${token("--font-ui")}`,
        letterSpacing: "0.005em",
        whiteSpace: "nowrap",
        cursor: "pointer",
        touchAction: "none",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        zIndex: pressed ? 60 : undefined,
        transformOrigin: "center",
        transform: pressed ? `scale(${String(PRESS_SCALE)})` : "none",
        transition: `transform ${token("--dur-fast")} ${token("--ease-out")}`,
      }}
    >
      {icon && (
        <span style={{ display: "inline-flex", fontSize: "1.05em" }}>
          <i className={icon} aria-hidden="true" />
        </span>
      )}
      {label}

      {/* Anchored, clamped reveal through the shared engine (preferred). */}
      {shown &&
        useStage &&
        anchor &&
        stageRef?.current &&
        createPortal(
          <PressPopover anchor={anchor}>{card}</PressPopover>,
          stageRef.current,
        )}

      {/* Standalone fallback: the same InfoCard floated directly above. */}
      {shown && !useStage && (
        <span
          style={{
            position: "absolute",
            left: "50%",
            bottom: "100%",
            transform: "translate(-50%, -14px)",
            zIndex: 90,
            pointerEvents: "none",
          }}
        >
          {card}
        </span>
      )}
    </span>
  );
}

// TidePill — the labelled tag used for one of the game's five tides. The `tide`
// prop names the tide; the pill owns that tide's icon and color, so a caller
// picks a tide, never a raw glyph or an arbitrary color.
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
// The five tides, each with its fixed mark and color. The names, colors, and
// glyphs mirror production's single source of truth,
// `src/components/tide-visuals.ts` (TIDE_COLOR_CHIP / TIDE_ACCENT_COLOR, keyed
// by the deck color), as shown on the Dreamcaller-select screen and the tides
// editor — the Tango isolation boundary forbids importing it directly, so the
// values are mirrored here with that file as the authority:
//   - Ember  (orange #fb923c) — GLYPHS.tideEmber  / bx-hot
//   - Valor  (gold   #facc15) — GLYPHS.tideValor  / bx-shield
//   - Vision (blue   #60a5fa) — GLYPHS.tideVision / bx-eye-alt
//   - Wild   (green  #4ade80) — GLYPHS.tideWild   / bx-leaf
//   - Shadow (purple #c084fc) — GLYPHS.tideShadow / bx-skull
// The tinted background/border have no dedicated token, so they derive from the
// tide's accent via `color-mix()` rather than a hardcoded rgba.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/pills/TidePill.jsx / .d.ts).

import * as React from "react";
import { createPortal } from "react-dom";
import { InfoCard } from "../overlay/InfoCard";
import { richText } from "../card/rich-text";
import { token } from "../../primitives/tokens";
import { TIDES, type Tide } from "./tide-spec";

// The tide icon + color table lives in `tide-spec` so the shared InfoCard can
// derive a tide's colored disc from it too without a circular import; it is
// re-exported here so long-standing callers keep importing `Tide` / `tideVisual`
// from TidePill.
export { tideVisual, type Tide } from "./tide-spec";

const { usePressReveal, anchorRect, PressPopover, PRESS_SCALE } = InfoCard;

/** Height/scale variants. */
type TidePillSize = "sm" | "md";

export interface TidePillProps {
  /** The tide/affiliation name. Resolve any UUID to the display name before
   * passing it — the pill renders copy from a plain string, not caller markup,
   * so TidePill is a leaf, not a container. */
  label: string;
  /** The tide's description, revealed through the shared InfoCard on hover /
   * press. Required: a TidePill always carries its description so the reveal
   * can never be forgotten. Plain prose — resolve before display. */
  description: string;
  /** Which of the five tides. Fixes the pill's icon and color. Default 'shadow'. */
  tide?: Tide;
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
 * TidePill — the labelled tag for one of the game's five tides (fixed icon +
 * name). Hovering (fine pointer) or pressing (touch) the pill always reveals the
 * tide's `description` through the ONE shared InfoCard; pass `stageRef` for the
 * anchored, clamped reveal or omit it to float the card directly above the pill.
 */
export function TidePill({
  label,
  description,
  tide = "shadow",
  size = "md",
  stageRef,
  onPress,
}: TidePillProps) {
  const spec = TIDES[tide];
  const icon = spec.icon;
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

  // The reveal: the tide's fixed mark heads the shared InfoCard `icon` disc; the
  // description renders as plain prose through the shared rich-text model.
  const card = (
    <InfoCard
      variant="icon"
      glyph={icon}
      title={label}
      body={richText.plain(description)}
    />
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
      <span style={{ display: "inline-flex", fontSize: "1.05em" }}>
        <i className={icon} aria-hidden="true" />
      </span>
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

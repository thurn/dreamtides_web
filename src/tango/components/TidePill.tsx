// TidePill — the labelled tag used for a Dreamcaller's tides/affiliations/
// categories. `tone` picks one of the brand's tide colors; the pill shows the
// tide's icon + name.
//
// TidePill is PURELY PRESENTATIONAL — it renders the chip (and, when `onPress`
// is passed, its own press feedback) and nothing else. The mobile touch-down
// preview (a tide's description, via `PressInfo` + `InfoCard`) is a later
// composition, not baked into this component — InfoCard does not exist in
// Tango yet (tracked separately). When it lands, callers wrap a TidePill in
// `PressInfo`/`InfoCard` themselves so every popup in the system reads
// identically; TidePill never floats its own bespoke popup.
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
//     source, matching SegmentedControl's track-background precedent
// The alpha-tinted backgrounds/borders that have no dedicated wash token use
// `color-mix()` against the base color token rather than a hardcoded rgba, so
// a future token rename/reband still propagates.
//
// Press feedback (when `onPress` is passed) routes through the shared
// `usePress` hook rather than a bare onClick/:active, matching the
// rest of Tango's interactive controls.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/pills/TidePill.jsx / .d.ts).

import type { ReactNode } from "react";
import { usePress, PRESS_SCALE } from "../primitives/Pressable";
import { token } from "../primitives/tokens";

/** Height/scale variants. */
type TidePillSize = "sm" | "md";

interface ToneSpec {
  bg: string;
  fg: string;
  bd: string;
}

/** The parent design system's tide colors, normalized to Tango tokens. */
const TONES: Record<string, ToneSpec> = {
  violet: {
    bg: token("--accent-tint"),
    fg: token("--accent-bright"),
    bd: token("--border-accent"),
  },
  blue: {
    bg: `color-mix(in srgb, ${token("--energy")} 18%, transparent)`,
    fg: token("--primitive-energy-300"),
    bd: `color-mix(in srgb, ${token("--energy")} 45%, transparent)`,
  },
  gold: {
    bg: `color-mix(in srgb, ${token("--primitive-gold-500")} 18%, transparent)`,
    fg: token("--primitive-gold-300"),
    bd: `color-mix(in srgb, ${token("--primitive-gold-500")} 45%, transparent)`,
  },
  green: {
    bg: `color-mix(in srgb, ${token("--positive")} 18%, transparent)`,
    fg: token("--positive"),
    bd: `color-mix(in srgb, ${token("--positive")} 45%, transparent)`,
  },
  rust: {
    bg: `color-mix(in srgb, ${token("--primitive-rust-500")} 20%, transparent)`,
    fg: `color-mix(in srgb, ${token("--primitive-rust-500")} 45%, white)`,
    bd: `color-mix(in srgb, ${token("--primitive-rust-500")} 50%, transparent)`,
  },
  red: {
    bg: `color-mix(in srgb, ${token("--danger")} 18%, transparent)`,
    fg: token("--primitive-ember-400"),
    bd: `color-mix(in srgb, ${token("--danger")} 45%, transparent)`,
  },
  // No dedicated wash token for this washed-out neutral fill; copied verbatim
  // from the source, matching SegmentedControl's track-background precedent.
  neutral: {
    bg: "rgba(255, 255, 255, 0.06)",
    fg: token("--text-secondary"),
    bd: token("--border-mid"),
  },
};

export interface TidePillProps {
  /** The tide/affiliation name (and any other inline content). */
  children?: ReactNode;
  /** Tide color. */
  tone?: "violet" | "blue" | "gold" | "green" | "rust" | "red" | "neutral";
  /** Leading icon node (a boxicon `<i>` element or a glyph). */
  icon?: ReactNode;
  /** Height/scale. Default 'md'. */
  size?: TidePillSize;
  /** Fires on press. When set, the pill renders as a button with press feedback. */
  onPress?: () => void;
}

/**
 * TidePill — the labelled tag for a Dreamcaller's tides/affiliations/
 * categories (icon + name). Presentational only; wrap in `PressInfo` +
 * `InfoCard` for the touch-down description popup once InfoCard lands in
 * Tango.
 */
export function TidePill({
  children,
  tone = "violet",
  icon = null,
  size = "md",
  onPress,
}: TidePillProps) {
  const spec = TONES[tone] ?? TONES.violet;
  const pad = size === "sm" ? "3px 9px" : "5px 12px";
  const { pressed, bind } = usePress();
  const on = pressed && Boolean(onPress);

  return (
    <span
      role={onPress ? "button" : undefined}
      tabIndex={onPress ? 0 : undefined}
      {...(onPress ? bind : {})}
      onClick={onPress}
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
        cursor: onPress ? "pointer" : "default",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        transformOrigin: "center",
        transform: on ? `scale(${String(PRESS_SCALE)})` : "none",
        transition: `transform ${token("--dur-fast")} ${token("--ease-out")}`,
      }}
    >
      {icon && (
        <span style={{ display: "inline-flex", fontSize: "1.05em" }}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

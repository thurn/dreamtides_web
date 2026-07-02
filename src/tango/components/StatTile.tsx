// StatTile — a labelled value cell for summary grids (deck stats, quest-end
// results). A solid raised card with a big value over a small uppercase
// label. Pass `accent` to tint the value (e.g. essence remaining in violet).
//
// Colors are token-driven (`--surface-raised` / `--border-soft` / `--r-md` /
// `--text-muted` / `--text-primary` / `--font-sans`), never a raw hex, so a
// future token rename/reband propagates automatically. `accent` is the one
// prop that intentionally accepts a raw color string (a `var(--...)`
// reference passed by the caller, e.g. `var(--essence)`) so any resource
// role token can tint the value without StatTile hard-coding a closed set.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/pills/StatTile.jsx / .d.ts).

import type { CSSProperties, ReactNode } from "react";
import { token } from "../primitives/tokens";

export interface StatTileProps {
  /** Small uppercase caption above the value. */
  label: string;
  /** The headline figure. Any node (string, number, or richer markup). */
  value: ReactNode;
  /** Optional secondary line under the value. */
  sub?: ReactNode;
  /** Tint color for the value. */
  accent?: string | null;
  style?: CSSProperties;
}

/**
 * Displays a single labelled value cell for summary grids (deck stats, quest
 * results). `label` is the caption, `value` the headline figure, `sub` an
 * optional secondary line, `accent` tints the value (plain text when
 * omitted/null). Lay several out in a grid for a stats block.
 */
export function StatTile({
  label,
  value,
  sub = null,
  accent = null,
  style = {},
}: StatTileProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "14px 16px",
        background: token("--surface-raised"),
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--r-md"),
        ...style,
      }}
    >
      <span
        style={{
          font: `700 11px/1 ${token("--font-sans")}`,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          color: token("--text-muted"),
        }}
      >
        {label}
      </span>
      <span
        style={{
          font: `800 24px/1 ${token("--font-sans")}`,
          fontVariantNumeric: "tabular-nums",
          color: accent ?? token("--text-primary"),
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            font: `500 12px/1.3 ${token("--font-sans")}`,
            color: token("--text-muted"),
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

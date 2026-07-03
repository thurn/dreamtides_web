// StatTile — a labelled value cell for summary grids (deck stats, quest-end
// results). A solid raised card with a big value over a small uppercase
// label. Pass `accent` to tint the value (e.g. essence remaining in violet).
//
// Colors are token-driven (`--surface-raised` / `--border-soft` / `--radius-control` /
// `--text-muted` / `--text-primary` / `--font-ui`), never a raw hex, so a
// future token rename/reband propagates automatically. `accent` names a
// resource-role token (essence / energy / spark / points) rather than taking a
// raw color string, so the value can only ever be tinted with an approved role
// hue — never an arbitrary color.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/pills/StatTile.jsx / .d.ts).

import { token } from "../primitives/tokens";

/** Resource-role tokens a StatTile value may be tinted with. */
type StatTileAccent = "essence" | "energy" | "spark" | "points";

/** Maps an accent role to its `var(--...)` role-color token. */
const ACCENT_TOKENS: Record<StatTileAccent, string> = {
  essence: token("--essence"),
  energy: token("--energy"),
  spark: token("--spark"),
  points: token("--points"),
};

export interface StatTileProps {
  /** Small uppercase caption above the value. */
  label: string;
  /** The headline figure, already resolved to display text (e.g. "240", "4 / 6"). */
  value: string;
  /** Optional secondary line under the value. */
  sub?: string;
  /** Tint the value with a resource-role hue. Plain text when omitted. */
  accent?: StatTileAccent;
}

/**
 * Displays a single labelled value cell for summary grids (deck stats, quest
 * results). `label` is the caption, `value` the headline figure, `sub` an
 * optional secondary line, `accent` tints the value with a resource-role hue
 * (plain text when omitted). Lay several out in a grid for a stats block.
 */
export function StatTile({
  label,
  value,
  sub,
  accent,
}: StatTileProps) {
  const accentColor = accent ? ACCENT_TOKENS[accent] : null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "14px 16px",
        background: token("--surface-raised"),
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-control"),
      }}
    >
      <span
        style={{
          font: `700 11px/1 ${token("--font-ui")}`,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          color: token("--text-muted"),
        }}
      >
        {label}
      </span>
      <span
        style={{
          font: `800 24px/1 ${token("--font-ui")}`,
          fontVariantNumeric: "tabular-nums",
          color: accentColor ?? token("--text-primary"),
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            font: `500 12px/1.3 ${token("--font-ui")}`,
            color: token("--text-muted"),
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

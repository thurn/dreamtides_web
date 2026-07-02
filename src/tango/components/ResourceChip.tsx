// ResourceChip — the canonical inline "value + mark" pairing for the game's
// economy (energy, spark, essence, points, counters). Every resource number
// in the game routes through this one component so the mark and its role
// color stay identical everywhere: a blue droplet for energy, a gold
// sparkle for spark, a violet crypto-mark for essence/points, an hourglass
// for generic counters.
//
// The value and its mark are paired TIGHT (R-08, see the parent design
// system's rules): the default `gap` is 0 so a value reads as one unit —
// `200◆`, the mark hugging the number — matching the game's HUD. Pass `gap`
// to loosen it if a specific layout needs air.
//
// Colors are token-driven (the `--energy` / `--spark` / `--essence` /
// `--points` / `--accent-bright` resource-role tokens), never a raw hex, so a
// future token rename/reband propagates automatically.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/buttons/ResourceChip.jsx / .d.ts). Requires Boxicons v3's
// filled stylesheet on the page (loaded globally for /tango by main.tsx).

import type { CSSProperties } from "react";
import { token } from "../primitives/tokens";

/** Which economy value a ResourceChip renders. */
type ResourceKind = "essence" | "energy" | "spark" | "points" | "counter";

interface ResourceSpec {
  /** Boxicons v3 filled class, e.g. "bxf bx-crypto". */
  icon: string;
  /** `var(--...)` reference to the resource's role token. */
  color: string;
}

/** The economy's resource marks, normalized to the parent design system: each
 * value is a filled Boxicon (never a unicode pictograph), colored by role, so
 * the economy reads identically to the desktop build and to the game card. */
const SPECS: Record<ResourceKind, ResourceSpec> = {
  essence: { icon: "bxf bx-crypto", color: token("--essence") },
  energy: { icon: "bxf bx-fire-alt", color: token("--energy") },
  spark: { icon: "bxf bx-sparkles", color: token("--spark") },
  points: { icon: "bxf bx-star-circle", color: token("--points") },
  counter: { icon: "bxf bx-hourglass", color: token("--accent-bright") },
};

export interface ResourceChipProps {
  /** Which economy value: essence, energy, spark, points, counter. Rendered as
   *  the parent's filled-Boxicon mark (bx-crypto / bx-fire-alt / bx-sparkles /
   *  bx-star-circle / bx-hourglass), colored by role. */
  kind?: ResourceKind;
  /** The numeric value to show. Omit to render the mark alone. */
  value?: number | string;
  /** Pixel font-size; everything scales from it. */
  size?: number;
  /** Render as a solid pill badge (for HUD/over-art) instead of inline text. */
  chip?: boolean;
  /** Space between the value and its mark. Default 0 — a tight pairing (200◆). */
  gap?: number;
  style?: CSSProperties;
}

/**
 * Displays a single game-economy resource value with its colored filled-Boxicon
 * mark. The one component to reach for whenever a number of essence/energy/
 * spark/points/counters appears, so the mark and color stay consistent
 * everywhere — and identical to the parent design system.
 */
export function ResourceChip({
  kind = "essence",
  value,
  size = 16,
  chip = false,
  gap = 0,
  style = {},
}: ResourceChipProps) {
  const spec = SPECS[kind] ?? SPECS.essence;
  const glyph = (
    <i
      className={spec.icon}
      aria-hidden="true"
      style={{ color: spec.color, fontSize: "1.04em", lineHeight: 1 }}
    />
  );
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        font: `800 ${String(size)}px/1 var(--font-sans)`,
        color: token("--text-primary"),
        fontVariantNumeric: "tabular-nums",
        ...(chip
          ? {
              padding: `${String(size * 0.34)}px ${String(size * 0.6)}px`,
              background: token("--surface-glass"),
              border: `1px solid ${token("--border-soft")}`,
              borderRadius: token("--r-pill"),
            }
          : {}),
        ...style,
      }}
    >
      {value != null && <span>{value}</span>}
      {glyph}
    </span>
  );
}

// tide-spec — the game's five tides and their fixed marks + colors, the ONE
// source the whole design system reads a tide's icon and palette from. Kept in
// its own module (not on TidePill) so both the pill/cluster AND the shared
// InfoCard can derive a tide's colored disc from the same table without a
// circular import (TidePill imports InfoCard for its reveal engine).
//
// The names, colors, and glyphs mirror production's single source of truth,
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

import { GLYPHS, type Glyph } from "../../primitives/glyph";

/** The game's five tides. Each owns a fixed icon + color (see {@link TIDES}). */
export type Tide = "ember" | "valor" | "vision" | "wild" | "shadow";

export interface TideSpec {
  /** The tide's fixed mark — one of the five filled tide glyphs. */
  icon: Glyph;
  bg: string;
  fg: string;
  bd: string;
}

/** Build a tide's tinted background/border from its bright accent color, so all
 * five read as one hue family (mirrors the production chip treatment). */
function tideSpec(icon: Glyph, accent: string): TideSpec {
  return {
    icon,
    fg: accent,
    bg: `color-mix(in srgb, ${accent} 18%, transparent)`,
    bd: `color-mix(in srgb, ${accent} 45%, transparent)`,
  };
}

/**
 * The five tides, each with its fixed filled mark and accent color. The accent
 * hexes are the production `TIDE_ACCENT_COLOR` values (see the file header).
 */
export const TIDES: Record<Tide, TideSpec> = {
  ember: tideSpec(GLYPHS.tideEmber, "#fb923c"),
  valor: tideSpec(GLYPHS.tideValor, "#facc15"),
  vision: tideSpec(GLYPHS.tideVision, "#60a5fa"),
  wild: tideSpec(GLYPHS.tideWild, "#4ade80"),
  shadow: tideSpec(GLYPHS.tideShadow, "#c084fc"),
};

/**
 * The fixed icon + tinted colors for a tide, so any component (a TidePill, the
 * collapsed TideCluster, or the shared InfoCard's tide variant) can render a
 * tide's disc / flying clone pixel-identically — without duplicating the tone
 * table.
 */
export function tideVisual(tide: Tide): TideSpec {
  return TIDES[tide];
}

/** The tide's alignment name (its {@link Tide} key), Title-Cased for display —
 * "valor" → "Valor". */
export function tideAlignmentLabel(tide: Tide): string {
  return tide.charAt(0).toUpperCase() + tide.slice(1);
}

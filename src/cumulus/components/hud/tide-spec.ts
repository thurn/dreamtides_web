// tide-spec — the game's five alignment tides and their fixed marks + colors.
// Kept in its own leaf module so both TideDisc and the shared InfoCard derive a
// tide's colored disc from the same table without a circular import (InfoCard
// carries the reveal engine those callers depend on).
//
// The names, colors, and glyphs mirror production's tide-identity vocabulary,
// `src/editor/tide-visuals.ts` (TIDE_COLOR_CHIP / TIDE_ACCENT_COLOR, keyed
// by the deck color), as shown on the Dreamcaller-select screen and the tides
// editor — the Cumulus isolation boundary forbids importing it directly, so the
// values are mirrored here with that file as the authority. Controls that
// color by selection provenance use their own role palette rather than this
// alignment palette:
//   - Ember  (orange #fb923c) — GLYPHS.tideEmber  / bx-hot
//   - Valor  (gold   #facc15) — GLYPHS.tideValor  / bx-shield
//   - Vision (blue   #60a5fa) — GLYPHS.tideVision / bx-eye-alt
//   - Wild   (green  #4ade80) — GLYPHS.tideWild   / bx-leaf
//   - Shadow (purple #c084fc) — GLYPHS.tideShadow / bx-skull
// The tinted background/border have no dedicated token, so they derive from the
// tide's accent via `color-mix()` rather than a hardcoded rgba.
//
// PALETTE HOME: this module is the design system's home for the tide palette.
// The five accent hexes in TIDES are the whole tide vocabulary Cumulus reads;
// `cumulus-tokens.css` carries no `--tide-*` tokens, so a tide's color is read
// here (or through `tideVisual()`), never from a design token.

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
 * The fixed icon + tinted colors for a tide, so any component (a TideDisc or
 * the shared InfoCard's tide variant) can render a tide's disc
 * pixel-identically — without duplicating the tone table.
 */
export function tideVisual(tide: Tide): TideSpec {
  return TIDES[tide];
}

/** The tide's alignment name (its {@link Tide} key), Title-Cased for display —
 * "valor" → "Valor". */
export function tideAlignmentLabel(tide: Tide): string {
  return tide.charAt(0).toUpperCase() + tide.slice(1);
}

// economy-spec — the ONE kind→glyph/color table for ResourceChip's game-economy
// values. Kept in its own module so other economy surfaces can share the same
// named glyph and role color without duplicating the mapping.
//
// Each mark's glyph is a named `GLYPHS.<kind>` value, never a re-typed class
// string, so an icon-font rename in the glyph vocabulary propagates here
// automatically. Economy resources use their named role tokens; points use
// neutral primary text because score has no palette hue of its own.
//
// ResourceChip paints each mark in `mark.color` so every HUD economy value uses
// its semantic role color.

import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";

/** The five economy currencies a mark can denominate. */
export type EconomyKind = "essence" | "energy" | "spark" | "points" | "counter";

/** A currency's fixed mark: the named glyph plus its role-token color. */
export interface EconomyMark {
  /** The currency's filled Boxicon mark, from the shared glyph vocabulary. */
  glyph: Glyph;
  /** `var(--...)` reference to the currency's role token. */
  color: string;
}

/**
 * The economy's currency marks. Each glyph comes from `GLYPHS.<kind>` (the
 * design system's named vocabulary) and each color from the matching role
 * token.
 */
export const ECONOMY_MARKS: Record<EconomyKind, EconomyMark> = {
  essence: { glyph: GLYPHS.essence, color: token("--essence") },
  energy: { glyph: GLYPHS.energy, color: token("--energy") },
  spark: { glyph: GLYPHS.spark, color: token("--spark") },
  points: { glyph: GLYPHS.points, color: token("--text-primary") },
  counter: { glyph: GLYPHS.counter, color: token("--accent-bright") },
};

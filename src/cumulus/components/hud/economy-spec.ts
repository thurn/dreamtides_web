// economy-spec — the ONE kind→glyph/color table for the game's economy. Both
// consumers of a currency mark — the HUD `ResourceChip` (an inline value + its
// mark) and `Button` (an inline price) — read this single table, so a HUD chip
// and a button price render the SAME glyph for the SAME currency and can never
// drift apart. Kept in its own module (not on either component) so neither has
// to import the other.
//
// Each mark's glyph is a named `GLYPHS.<kind>` value, never a re-typed class
// string, so an icon-font rename in the glyph vocabulary propagates here
// automatically. Each color is the currency's role token (`--essence`,
// `--energy`, `--spark`, `--points`, and `--accent-bright` for the generic
// counter), never a raw hex, so a token reband propagates too.
//
// ResourceChip paints its mark in `mark.color`; Button ignores `.color` and
// renders the same glyph in its own inherited on-accent white — so a price
// inside the purple sprite reads as part of the label, while the identical
// currency in the HUD reads in its role color.

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
 * token — the single table both `ResourceChip` and `Button` read.
 */
export const ECONOMY_MARKS: Record<EconomyKind, EconomyMark> = {
  essence: { glyph: GLYPHS.essence, color: token("--essence") },
  energy: { glyph: GLYPHS.energy, color: token("--energy") },
  spark: { glyph: GLYPHS.spark, color: token("--spark") },
  points: { glyph: GLYPHS.points, color: token("--points") },
  counter: { glyph: GLYPHS.counter, color: token("--accent-bright") },
};

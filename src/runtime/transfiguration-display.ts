// Display descriptor data shared by the card renderer (Cumulus's CardView) and the
// transfiguration game logic. These are the pure, non-UI presentation values a
// transfiguration attaches to a card: the per-type accent colors, the lighter
// tints painted onto the card itself, the Boxicons glyph classes shown in the
// name bar, and the semantic descriptor CardView consumes to paint a
// transfigured card.
//
// They live here (an allowlisted `src/runtime/` module) rather than in
// `src/transfiguration/transfiguration-logic.ts` so the Cumulus UI library can
// import the card-display pieces it needs without reaching into the game-logic
// module. `transfiguration-logic.ts` re-exports every symbol below, so its
// existing consumers are unaffected.

import type { TransfigurationType } from "../types/journey";

/** Saturated selection-ring color owned by each transfiguration type. */
export const TRANSFIGURATION_COLORS: Readonly<
  Record<TransfigurationType, `#${string}`>
> = {
  Empowered: "#10b981",
  Amplified: "#f59e0b",
  Kindled: "#ef4444",
  Inspired: "#3b82f6",
  Enduring: "#6366f1",
  Hastened: "#06b6d4",
  Resonant: "#d946ef",
  Attuned: "#f43f5e",
  Perfected: "#a855f7",
};

/**
 * Lighter pastel tints used to paint the transfigured parts of a card itself —
 * the name gem, the changed stat orb, and the added/changed rules text. These
 * sit a few shades lighter than {@link TRANSFIGURATION_COLORS} (which stay
 * saturated for borders, badges, and selection glows) so the tinted text reads
 * clearly over the card's dark frosted chrome while still reading as the same
 * color family. Each value is the Tailwind 300-level pastel of its type's hue.
 */
export const TRANSFIGURATION_TINT_COLORS: Readonly<
  Record<TransfigurationType, `#${string}`>
> = {
  Empowered: "#6ee7b7",
  Amplified: "#fcd34d",
  Kindled: "#fca5a5",
  Inspired: "#93c5fd",
  Enduring: "#a5b4fc",
  Hastened: "#67e8f9",
  Resonant: "#f0abfc",
  Attuned: "#fda4af",
  Perfected: "#d8b4fe",
};

/**
 * Boxicons glyph class for each transfiguration type, painted in the tint color
 * inside the card's name bar. Each icon evokes the transfiguration's effect:
 * a bolt for the energy-cheapening Empowered, a rising trend for the
 * number-raising Amplified, a flame for the spark-doubling Kindled, a mind for
 * the card-drawing Inspired, an infinity loop for the recurring Enduring, a
 * broadcast wave for the trigger-widening Resonant, a tuning slider for the
 * ability-cheapening Attuned, a rocket for the Fast-granting Hastened, and a
 * flawless gem for the all-applying Perfected.
 */
export const TRANSFIGURATION_ICONS: Readonly<
  Record<TransfigurationType, string>
> = {
  Empowered: "bx-bolt",
  Amplified: "bx-trending-up",
  Kindled: "bx-flame",
  Inspired: "bx-brain",
  Enduring: "bx-infinite",
  Hastened: "bx-rocket",
  Resonant: "bx-broadcast",
  Attuned: "bx-slider",
  Perfected: "bx-diamond",
};

/**
 * Semantic description of the transfiguration changes CardView must paint. The
 * renderer derives every color and glyph from `type`; callers cannot customize
 * transfiguration appearance per card. Computed by `buildTransfigurationDisplay`.
 */
export interface CardTransfigurationDisplay {
  readonly type: TransfigurationType;
  /** Rules text with the changed/added spans wrapped in transfigure markers. */
  readonly markedText: string;
  /** True when the energy cost changed (Empowered); badges the energy orb. */
  readonly energyChanged: boolean;
  /** True when the spark changed (Kindled); badges the spark orb. */
  readonly sparkChanged: boolean;
  /** True when the card gained Fast (Hastened); tints the speed bolt. */
  readonly fastChanged: boolean;
}

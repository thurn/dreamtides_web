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

import type { TransfigurationApplication } from "../engine/dsl/types";
import type { TransfigurationPresentation } from "../types/transfiguration-data";
import type { TransfigurationType } from "../types/journey";
import type { TransfigurationFormDefinition } from "../types/transfiguration-data";

/**
 * Semantic description of the transfiguration changes CardView must paint. The
 * renderer derives every color and glyph from `type`; callers cannot customize
 * transfiguration appearance per card. Computed by `buildTransfigurationDisplay`.
 */
export interface CardTransfigurationDisplay {
  readonly type: TransfigurationType;
  readonly applications?: readonly { readonly application: TransfigurationApplication; readonly form: TransfigurationPresentation; readonly constituents?: readonly TransfigurationPresentation[] }[];
  readonly form: Pick<
    TransfigurationFormDefinition,
    "name" | "description" | "glyph" | "accentColor" | "tintColor"
  >;
  /** Rules text with the changed/added spans wrapped in transfigure markers. */
  readonly markedText: string;
  /** True when the energy cost changed (Empowered); badges the energy orb. */
  readonly energyChanged: boolean;
  /** Catalog-authored name of the form that changed the energy cost. */
  readonly energyChangeName: string | null;
  /** True when the spark changed (Kindled); badges the spark orb. */
  readonly sparkChanged: boolean;
  /** Catalog-authored name of the form that changed spark. */
  readonly sparkChangeName: string | null;
  /** True when the card gained Fast (Hastened); tints the speed bolt. */
  readonly fastChanged: boolean;
}

/** Authored descriptions in complete application order, including repeated occasions. */
export function transfigurationDisplayName(display: CardTransfigurationDisplay): string {
  return display.applications?.map(step => step.form.name).join(" → ") ?? display.form.name;
}
export function transfigurationDisplayDescription(display: CardTransfigurationDisplay): string {
  return display.applications?.map(step => `${step.form.name}: ${step.form.description}${step.constituents === undefined ? "" : ` (${step.constituents.map(form => form.name).join(", ")})`}`).join("\n") ?? display.form.description;
}

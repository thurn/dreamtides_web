/**
 * Private-use-area sentinel characters that delimit a transfigured span inside
 * a card's rendered rules text.
 *
 * `buildTransfigurationDisplay` (in the transfiguration logic) wraps each run of
 * modified rules text in these markers, and the rules-text renderer splits on
 * them to tint only the transfigured span. They live here — shared, non-UI
 * infrastructure — so both the quest logic that writes them and the Cumulus
 * rules-text renderer that reads them import the exact same code points from a
 * single source of truth.
 *
 * The characters are drawn from the Unicode private-use area so they can never
 * collide with authored card text.
 */
export const TRANSFIGURE_MARK_START = "\u{E000}";
export const TRANSFIGURE_MARK_END = "\u{E001}";

/**
 * Inline symbol shortcuts for the card editor. Typing one of the trigger
 * sequences (e.g. `\e`) into a text field replaces it immediately with the
 * mapped glyph.
 */
export const SYMBOL_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["\\e", "●"],
  ["\\c", "⧗"],
  ["\\p", "⍟"],
  ["\\x", "☾"],
  ["\\s", "✦"],
  ["\\f", "❖"],
  ["\\d", "–"],
  ["\\t", "▸"],
  ["\\lte", "≤"],
  ["\\gte", "≥"],
];

export interface SymbolReplacementResult {
  /** The text with every trigger sequence replaced by its glyph. */
  value: string;
  /** Caret position adjusted to account for the length change. */
  caret: number;
}

/**
 * Replace every trigger sequence in `value` with its glyph, tracking how the
 * caret at `caret` shifts as characters before/around it collapse.
 */
export function applySymbolReplacements(
  value: string,
  caret: number,
): SymbolReplacementResult {
  let result = value;
  let nextCaret = caret;

  for (const [sequence, glyph] of SYMBOL_REPLACEMENTS) {
    let index = result.indexOf(sequence);
    while (index !== -1) {
      const before = result.slice(0, index);
      const after = result.slice(index + sequence.length);
      result = before + glyph + after;

      const sequenceEnd = index + sequence.length;
      const delta = sequence.length - glyph.length;
      if (nextCaret >= sequenceEnd) {
        // Caret sat after the sequence; pull it back by the collapsed length.
        nextCaret -= delta;
      } else if (nextCaret > index) {
        // Caret was inside the sequence; park it just after the glyph.
        nextCaret = index + glyph.length;
      }

      index = result.indexOf(sequence, index + glyph.length);
    }
  }

  return { value: result, caret: nextCaret };
}

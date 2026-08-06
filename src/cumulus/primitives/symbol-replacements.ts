/** Authoring shortcuts shared by Cumulus-backed editors. */
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
  readonly value: string;
  readonly caret: number;
}

/** Replace every recognized shortcut while preserving the logical caret. */
export function applySymbolReplacements(
  value: string,
  caret: number,
): SymbolReplacementResult {
  let result = value;
  let nextCaret = caret;

  for (const [sequence, glyph] of SYMBOL_REPLACEMENTS) {
    let index = result.indexOf(sequence);
    while (index !== -1) {
      result =
        result.slice(0, index) + glyph + result.slice(index + sequence.length);
      const sequenceEnd = index + sequence.length;
      const delta = sequence.length - glyph.length;
      if (nextCaret >= sequenceEnd) nextCaret -= delta;
      else if (nextCaret > index) nextCaret = index + glyph.length;
      index = result.indexOf(sequence, index + glyph.length);
    }
  }

  return { value: result, caret: nextCaret };
}

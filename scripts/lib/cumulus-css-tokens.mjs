// Pure parser for the CSS custom properties in the Cumulus design tokens sheet
// (src/cumulus/primitives/cumulus-tokens.css). Shared by two consumers:
//   - scripts/generate-cumulus-tokens.mjs, which turns the result into a typed
//     tokens.ts (deduping repeated names last-wins itself).
//   - the Primitives-section token doc, which groups entries by their
//     `@kind` marker to render specimens.
//
// Kept deliberately dumb: this module knows nothing about cumulus-tokens.css's
// actual token names or structure, only the generic shape every
// `--name: value;` declaration (optionally followed by a `/* @kind ... */`
// marker) takes.

/**
 * Extract every `--name: value;` custom-property declaration from `cssText`.
 *
 * Block comments are stripped before matching, so section-header comments
 * and multi-line prose between declarations never produce phantom entries
 * or bleed into a neighboring value. The one comment form that survives is a
 * `/* @kind <word> *\/` marker that TRAILS a declaration's terminating `;`,
 * which is attached to that entry as `kind`. A `@kind`-shaped comment placed
 * anywhere else (e.g. inside the value, before the `;`) is stripped like any
 * other comment and yields no `kind`.
 *
 * The terminating `;` may be omitted for the final declaration before a
 * closing `}` (valid CSS), and that declaration is still returned.
 *
 * Ordinary (non-custom) properties like `color: red;` are never matched.
 * Duplicate `--name` declarations are all returned, in source order —
 * callers that want "last wins" apply that themselves.
 *
 * Known limitations, acceptable for design-token values (colors, sizes,
 * shadows, gradients — none of which contain a bare `;`):
 *   - A value containing a literal `;` (e.g. inside a quoted string)
 *     truncates at that `;`.
 *   - An unterminated block comment (`/*` with no closing `*\/`) is not
 *     suppressed.
 *
 * @param {string} cssText
 * @returns {Array<{ name: string, value: string, kind?: string }>}
 */
export function parseCssTokens(cssText) {
  // The null byte can't appear in real CSS source, so it's a safe sentinel
  // for round-tripping a trailing `@kind` marker's payload through the
  // comment-stripping pass below without it being mistaken for parseable
  // declaration text.
  const SENTINEL = "\0";

  const withoutComments = cssText.replace(
    /\/\*([\s\S]*?)\*\//g,
    (_whole, body, offset) => {
      const kindMatch = body.trim().match(/^@kind\s+(\S+)$/);
      if (kindMatch && trailsSemicolon(cssText, offset)) {
        return `${SENTINEL}${kindMatch[1]}${SENTINEL}`;
      }
      // Every other comment — including a misplaced/in-value `@kind` marker —
      // is stripped entirely, so no sentinel and no text can leak into a value.
      return "";
    },
  );

  // A declaration's value never contains `;`, `}`, or the sentinel; it is
  // terminated either by `;` (optionally followed by a trailing @kind marker)
  // or, for the last declaration in a block, by the closing `}`.
  const declarationRe = new RegExp(
    `--([a-zA-Z0-9_-]+)\\s*:\\s*([^;}${SENTINEL}]+?)\\s*(?:;\\s*(?:${SENTINEL}([^${SENTINEL}]+)${SENTINEL})?|(?=}))`,
    "g",
  );

  const tokens = [];
  for (const match of withoutComments.matchAll(declarationRe)) {
    const [, name, rawValue, kind] = match;
    const token = { name, value: rawValue.trim() };
    if (kind !== undefined) {
      token.kind = kind;
    }
    tokens.push(token);
  }
  return tokens;
}

/**
 * Whether the character immediately before `offset` in `text`, ignoring
 * whitespace, is a `;` — i.e. whether a comment starting at `offset` trails a
 * declaration's terminating semicolon rather than sitting inside its value.
 */
function trailsSemicolon(text, offset) {
  let i = offset - 1;
  while (i >= 0 && /\s/.test(text[i])) {
    i -= 1;
  }
  return i >= 0 && text[i] === ";";
}

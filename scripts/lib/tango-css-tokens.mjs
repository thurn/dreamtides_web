// Pure parser for the CSS custom properties in the Tango design tokens sheet
// (src/tango/primitives/tango-tokens.css). Shared by two consumers:
//   - scripts/generate-tango-tokens.mjs, which turns the result into a typed
//     tokens.ts (deduping repeated names last-wins itself).
//   - the Primitives-section token doc, which groups entries by their
//     `@kind` marker to render specimens.
//
// Kept deliberately dumb: this module knows nothing about tango-tokens.css's
// actual token names or structure, only the generic shape every
// `--name: value;` declaration (optionally followed by a `/* @kind ... */`
// marker) takes.

/**
 * Extract every `--name: value;` custom-property declaration from `cssText`.
 *
 * Block comments are stripped before matching, so section-header comments
 * and multi-line prose between declarations never produce phantom entries
 * or bleed into a neighboring value. The one comment form that survives is a
 * declaration's own trailing `/* @kind <word> *\/` marker, which is attached
 * to that entry as `kind` instead of being discarded.
 *
 * Ordinary (non-custom) properties like `color: red;` are never matched.
 * Duplicate `--name` declarations are all returned, in source order —
 * callers that want "last wins" apply that themselves.
 *
 * @param {string} cssText
 * @returns {Array<{ name: string, value: string, kind?: string }>}
 */
export function parseCssTokens(cssText) {
  // The null byte can't appear in real CSS source, so it's a safe sentinel
  // for round-tripping a `@kind` marker's payload through the
  // comment-stripping pass below without it being mistaken for parseable
  // declaration text.
  const SENTINEL = "\0";

  const withoutComments = cssText.replace(/\/\*([\s\S]*?)\*\//g, (_whole, body) => {
    const kindMatch = body.trim().match(/^@kind\s+(\S+)$/);
    return kindMatch ? `${SENTINEL}${kindMatch[1]}${SENTINEL}` : "";
  });

  const declarationRe = new RegExp(
    `--([a-zA-Z0-9_-]+)\\s*:\\s*([^;]+);(?:\\s*${SENTINEL}([^\\0]+)${SENTINEL})?`,
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

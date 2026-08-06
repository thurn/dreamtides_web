// A tiny, dependency-free TSX highlighter for the /cumulus doc site's usage
// snippets. It is deliberately NOT a full parser — the snippets are short,
// hand-authored JSX call sites (see registry `usage`), so a single-pass scanner
// that recognises comments, strings, keywords, JSX element/attribute names,
// component references and numbers reads them well enough to color. Anything it
// can't classify falls through as default-colored text, so a snippet always
// renders correctly, just less colorfully, in the worst case.
//
// It lives in docs/ (the doc-site harness, not product UI), so the literal
// syntax-theme colors below are intentional: a code theme is its own palette,
// not part of the design token system the components build from.

import { type ReactNode } from "react";

/** The syntax theme. Values are a dark editor palette (VS Code "Dark+"-ish). */
const COLORS = {
  comment: "#7c8598",
  keyword: "#c586c0",
  string: "#ce9178",
  tag: "#4ec9b0",
  attr: "#9cdcfe",
  number: "#b5cea8",
} as const;

type TokenType = keyof typeof COLORS | "text";

interface Token {
  type: TokenType;
  value: string;
}

/** JS/TS keywords worth coloring in these snippets. */
const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "const",
  "let",
  "var",
  "function",
  "return",
  "new",
  "await",
  "async",
  "default",
  "true",
  "false",
  "null",
  "undefined",
  "as",
]);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[\w$.]/;
const DIGIT = /[0-9]/;

/**
 * Scan a TSX snippet into a flat token stream. Pure. Tracks two bits of JSX
 * context so bare identifiers land in the right bucket:
 *   - `inTag`   — between `<Name` and the matching `>` / `/>`, at expression
 *                 depth 0, a bare identifier is a JSX ATTRIBUTE.
 *   - `exprDepth` — `{...}` inside a tag opens a JS expression; identifiers
 *                 there are ordinary JS again (keywords / component refs), not
 *                 attributes.
 * A capitalized identifier is always treated as a component/type reference (tag
 * color) so `<InfoCard>` and a bare `InfoCard` in an expression match.
 */
export function tokenizeTsx(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let inTag = false;
  let exprDepth = 0;
  const n = code.length;

  const push = (type: TokenType, value: string): void => {
    if (value.length > 0) {
      tokens.push({ type, value });
    }
  };

  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];

    // Line comment.
    if (ch === "/" && next === "/") {
      let j = i + 2;
      while (j < n && code[j] !== "\n") j++;
      push("comment", code.slice(i, j));
      i = j;
      continue;
    }
    // Block comment.
    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(code[j] === "*" && code[j + 1] === "/")) j++;
      j = Math.min(n, j + 2);
      push("comment", code.slice(i, j));
      i = j;
      continue;
    }
    // String / template literal (no nested interpolation handling needed here).
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n && code[j] !== ch) {
        if (code[j] === "\\") j++;
        j++;
      }
      j = Math.min(n, j + 1);
      push("string", code.slice(i, j));
      i = j;
      continue;
    }
    // JSX element open / close: `<Name`, `</Name`, member `<A.B`.
    if (ch === "<" && (next === "/" || (next !== undefined && IDENT_START.test(next)))) {
      const slash = next === "/" ? 1 : 0;
      let j = i + 1 + slash;
      while (j < n && IDENT_PART.test(code[j])) j++;
      push("text", code.slice(i, i + 1 + slash)); // the `<` (and `/`)
      push("tag", code.slice(i + 1 + slash, j));
      inTag = true;
      exprDepth = 0;
      i = j;
      continue;
    }
    // Tag punctuation that closes the opening tag.
    if (inTag && exprDepth === 0 && (ch === ">" || (ch === "/" && next === ">"))) {
      inTag = false;
      const len = ch === "/" ? 2 : 1;
      push("text", code.slice(i, i + len));
      i += len;
      continue;
    }
    // Expression braces inside a tag toggle JS-expression context.
    if (inTag && ch === "{") {
      exprDepth++;
      push("text", ch);
      i++;
      continue;
    }
    if (inTag && ch === "}" && exprDepth > 0) {
      exprDepth--;
      push("text", ch);
      i++;
      continue;
    }
    // Identifier / keyword / attribute / component reference.
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(code[j])) j++;
      const word = code.slice(i, j);
      const head = word.split(".")[0];
      if (KEYWORDS.has(word)) {
        push("keyword", word);
      } else if (/^[A-Z]/.test(head)) {
        push("tag", word);
      } else if (inTag && exprDepth === 0) {
        push("attr", word);
      } else {
        push("text", word);
      }
      i = j;
      continue;
    }
    // Number.
    if (DIGIT.test(ch)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(code[j])) j++;
      push("number", code.slice(i, j));
      i = j;
      continue;
    }
    // Anything else: default text (whitespace, operators, punctuation).
    push("text", ch);
    i++;
  }
  return tokens;
}

/**
 * Render a TSX snippet to colored React nodes for a `<pre><code>` block.
 * Default-colored tokens render as bare strings so they inherit the code
 * element's own color; only classified tokens get a colored `<span>`.
 */
export function highlightTsx(code: string): ReactNode[] {
  return tokenizeTsx(code).map((token, index) => {
    if (token.type === "text") {
      return <span key={index}>{token.value}</span>;
    }
    return (
      <span key={index} style={{ color: COLORS[token.type] }}>
        {token.value}
      </span>
    );
  });
}

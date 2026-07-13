import path from "node:path";

/**
 * Bans raw Boxicons icon-font class strings in Cumulus's product-UI tier.
 *
 * A glyph must arrive as a typed `Glyph` — `GLYPHS.<name>` (the design system's
 * named vocabulary) or `glyph(className)` (the single documented boundary for a
 * class from GAME DATA) — and be rendered through `GlowIcon` / `PipBadge`. A
 * bare `<i className="bxf bx-crypto" />` re-hardcodes a class string that the
 * glyph registry already owns, so the same mark drifts out of sync across call
 * sites (and a typo'd class silently renders a blank box at runtime).
 *
 * SCOPE. Governs the Cumulus tier: every file under `src/cumulus/` plus the
 * adapter/builder layer in `src/screens/cumulus_adapters/`, EXCEPT
 *   - {@link EXEMPT_FILE} `src/cumulus/primitives/glyph.ts` — the one file that
 *     DEFINES the glyph vocabulary and so legitimately holds the raw class
 *     strings the registry brands;
 *   - the `src/cumulus/docs/` doc site — its specimens and mockups intentionally
 *     print raw class strings (matching how the sibling Cumulus lint rules exempt
 *     the doc tier); and
 *   - test files (`*.test.ts` / `*.test.tsx`) — a render test legitimately
 *     asserts against the CONCRETE rendered class (`querySelector("i.bx-x")`),
 *     which the design system's own vocabulary resolves TO; a GLYPHS symbol
 *     cannot be spelled into a DOM selector.
 * All other files are a no-op.
 *
 * DETECTION. Any string {@link Literal} or {@link TemplateElement} whose text
 * contains a Boxicons class token — the base classes `bx` / `bxf`, or an icon
 * class `bx-<name>` (see {@link ICON_CLASS_RE}) — is flagged, UNLESS it is the
 * argument to a `glyph(...)` call. `glyph()` is the single documented boundary
 * for a class that arrives from GAME DATA (a runtime metadata table), so a raw
 * class string branded THROUGH it is the sanctioned path, not a leak (see
 * {@link isGlyphCallArgument}).
 */

/** Repo-relative POSIX path of the one file that DEFINES the glyph vocabulary. */
const EXEMPT_FILE = "src/cumulus/primitives/glyph.ts";

/** The doc-site tier, exempt like the sibling Cumulus rules exempt it. */
const EXEMPT_PREFIX = "src/cumulus/docs/";

/** The sanctioned game-data boundary helper whose argument is exempt. */
const GLYPH_BOUNDARY_FN = "glyph";

/**
 * Matches a Boxicons class token: the base classes `bx` / `bxf` as whole words,
 * or an icon class `bx-<name>`. Kept deliberately narrow to Boxicons so an
 * unrelated string that merely contains the letters "bx" is not flagged.
 */
const ICON_CLASS_RE = /\bbxf?\b|\bbx-[a-z-]+/;

/** True when the repo-relative POSIX path is a test file. */
export function isTestFile(fileRelative) {
  return /\.test\.[cm]?[jt]sx?$/.test(fileRelative);
}

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule governs the given repo-relative POSIX path. */
export function isGovernedFile(fileRelative) {
  if (
    fileRelative === EXEMPT_FILE ||
    fileRelative.startsWith(EXEMPT_PREFIX) ||
    isTestFile(fileRelative)
  ) {
    return false;
  }
  return (
    fileRelative.startsWith("src/cumulus/") ||
    fileRelative.startsWith("src/screens/cumulus_adapters/")
  );
}

/** True when `call` is a `glyph(...)` invocation. */
function isGlyphCall(call) {
  return (
    call?.type === "CallExpression" &&
    call.callee?.type === "Identifier" &&
    call.callee.name === GLYPH_BOUNDARY_FN
  );
}

/**
 * True when `node` (a string `Literal` or a `TemplateLiteral`) is an argument to
 * a `glyph(...)` call — the sanctioned game-data boundary, so its raw class
 * string is not a leak.
 */
export function isGlyphCallArgument(node) {
  const parent = node.parent;
  return isGlyphCall(parent) && (parent.arguments ?? []).includes(node);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw Boxicons icon-font class strings (bx / bxf / bx-*) across the Cumulus tier (all of src/cumulus/ plus src/screens/cumulus_adapters/), except the vocabulary file src/cumulus/primitives/glyph.ts, the doc site, and test files. A glyph must arrive as a typed Glyph (GLYPHS.* / glyph()) rendered through GlowIcon / PipBadge.",
    },
    schema: [],
    messages: {
      rawIconClass:
        "`{{text}}` is a raw Boxicons class string. Reference a named glyph from `GLYPHS` (or brand a game-data class via `glyph()`) and render it through `GlowIcon` / `PipBadge` — the design system owns the icon vocabulary so a mark does not drift or silently render blank.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!isGovernedFile(fileRelative)) {
      return {};
    }

    function report(node, text) {
      if (typeof text !== "string" || !ICON_CLASS_RE.test(text)) {
        return;
      }
      context.report({
        node,
        messageId: "rawIconClass",
        data: { text: text.trim() },
      });
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") {
          return;
        }
        if (isGlyphCallArgument(node)) {
          return;
        }
        report(node, node.value);
      },
      TemplateElement(node) {
        // The literal string a template spells is a leak unless the whole
        // template is a `glyph(...)` argument (the game-data boundary).
        if (isGlyphCallArgument(node.parent)) {
          return;
        }
        report(node, node.value.raw);
      },
    };
  },
};

export default rule;

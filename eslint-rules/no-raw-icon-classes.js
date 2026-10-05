
/**
 * Bans raw Boxicons icon-font class strings in Cumulus's product-UI tier.
 *
 * A glyph must arrive as a typed `Glyph` — `GLYPHS.<name>` (the design system's
 * named vocabulary) or `glyph(className)` (the single documented boundary for a
 * class from GAME DATA) — and be rendered through `StandaloneGlyph` or `InlineGlyph`. A
 * bare `<i className="bxf bx-crypto" />` re-hardcodes a class string that the
 * glyph registry already owns, so the same mark drifts out of sync across call
 * sites (and a typo'd class silently renders a blank box at runtime).
 *
 * eslint.config.js decides which files this rule governs.
 *
 * DETECTION. Any string {@link Literal} or {@link TemplateElement} whose text
 * contains a Boxicons class token — the base classes `bx` / `bxf`, or an icon
 * class `bx-<name>` (see {@link ICON_CLASS_RE}) — is flagged, UNLESS it is the
 * argument to a `glyph(...)` call. `glyph()` is the single documented boundary
 * for a class that arrives from GAME DATA (a runtime metadata table), so a raw
 * class string branded THROUGH it is the sanctioned path, not a leak (see
 * {@link isGlyphCallArgument}).
 */

/** The sanctioned game-data boundary helper whose argument is exempt. */
const GLYPH_BOUNDARY_FN = "glyph";

/**
 * Matches a Boxicons class token: the base classes `bx` / `bxf` as whole words,
 * or an icon class `bx-<name>`. Kept deliberately narrow to Boxicons so an
 * unrelated string that merely contains the letters "bx" is not flagged.
 */
const ICON_CLASS_RE = /\bbxf?\b|\bbx-[a-z-]+/;

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
        "Ban raw Boxicons icon-font class strings (bx / bxf / bx-*) across the Cumulus tier (all of src/cumulus/ plus src/screens/cumulus_adapters/), except the vocabulary file src/cumulus/primitives/glyph.ts, the doc site, and test files. A glyph must arrive as a typed Glyph (GLYPHS.* / glyph()) rendered through StandaloneGlyph or InlineGlyph.",
    },
    schema: [],
    messages: {
      rawIconClass:
        "`{{text}}` is a raw Boxicons class string. Reference a named glyph from `GLYPHS` (or brand a game-data class via `glyph()`) and render it through `StandaloneGlyph` or `InlineGlyph` — the design system owns the icon vocabulary so a mark does not drift or silently render blank.",
    },
  },

  create(context) {
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

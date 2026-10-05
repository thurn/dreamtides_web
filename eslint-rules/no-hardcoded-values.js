import { colorTokenFor } from "./cumulus-token-index.js";

/**
 * Bans hardcoded COLOR literals in Cumulus's product-UI tier.
 *
 * The Cumulus token system exposes public color roles (`--accent`,
 * `--surface-card`, `--text-primary`, …). Product UI must build from those
 * tokens; a raw `#a855f7`, `rgb(...)`,
 * or `hsl(...)` literal hardcodes a value the design system can no longer
 * control. This rule flags such literals and — via the reverse index in
 * {@link colorTokenFor} — names the design token that already carries the
 * color, autofixing when the whole string is a single color.
 *
 * eslint.config.js decides which files this rule governs.
 *
 * Only NUMERIC color literals (hex / `rgb(a)` / `hsl(a)`) are flagged: they are
 * unambiguous and each maps to a token. Named colors (`red`) and non-color
 * values (lengths, `zIndex`, opacity) are deliberately left alone — a length
 * like `12px` has no unambiguous single token and is better handled by choosing
 * a `--space-*`/`--radius-*` token in review.
 */

/** Finds each hex / rgb(a) / hsl(a) color literal inside a string. */
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^()]*\)/g;

/** True when the whole trimmed text is exactly one color literal. */
const WHOLE_COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\([^()]*\))$/;

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Ban hardcoded color literals (hex/rgb/hsl) in Cumulus product UI; use semantic color tokens.",
    },
    schema: [],
    messages: {
      hardcodedColorWithToken:
        "'{{value}}' is a hardcoded color. Use the design token {{token}} (var({{token}})) — product UI builds from tokens, not raw color values.",
      hardcodedColorNoToken:
        "'{{value}}' is a hardcoded color with no matching Cumulus token. Add a named design token for it in src/cumulus/primitives/cumulus-tokens.css, or use the nearest existing token — product UI builds from tokens, not raw color values.",
    },
  },

  create(context) {
    /**
     * Report every color literal in `text`. `node` is the string/template node;
     * `fixTarget` is the node whose entire source is the quoted string (a
     * `Literal`), enabling an exact-match autofix, or null (template chunks).
     */
    function checkText(node, text, fixTarget) {
      if (typeof text !== "string") {
        return;
      }
      const matches = text.match(COLOR_RE);
      if (matches === null) {
        return;
      }
      const wholeIsColor = WHOLE_COLOR_RE.test(text.trim());
      for (const value of matches) {
        const token = colorTokenFor(value);
        const canFix = wholeIsColor && token !== null && fixTarget !== null;
        context.report({
          node,
          messageId: token
            ? "hardcodedColorWithToken"
            : "hardcodedColorNoToken",
          data: { value, token: token ?? "" },
          fix: canFix
            ? (fixer) => {
                const quote = context.sourceCode.getText(fixTarget).slice(0, 1);
                return fixer.replaceText(
                  fixTarget,
                  `${quote}var(${token})${quote}`,
                );
              }
            : undefined,
        });
        // Autofix rewrites the whole node, so one report per node suffices.
        if (canFix) {
          break;
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") {
          checkText(node, node.value, node);
        }
      },
      TemplateElement(node) {
        checkText(node, node.value.raw, null);
      },
    };
  },
};

export default rule;

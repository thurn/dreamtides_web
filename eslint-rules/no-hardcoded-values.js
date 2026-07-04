import path from "node:path";
import { colorTokenFor } from "./tango-token-index.js";

/**
 * Bans hardcoded COLOR literals in Tango's product-UI tier.
 *
 * The Tango token system exposes a semantic color layer (`--accent`,
 * `--surface-card`, `--text-primary`, …) that re-skins the whole app from one
 * place. Product UI must build from those tokens; a raw `#a855f7`, `rgb(...)`,
 * or `hsl(...)` literal hardcodes a value the design system can no longer
 * control. This rule flags such literals and — via the reverse index in
 * {@link colorTokenFor} — names the semantic token that already carries the
 * color, autofixing when the whole string is a single color.
 *
 * SCOPE. The rule fires only on the composition / product-UI tier: files under
 * `src/tango/` that are NOT in {@link EXEMPT_PREFIXES}. The exempt dirs are:
 *   - `src/tango/primitives/` and `src/tango/components/` — the primitive and
 *     leaf-component layers legitimately author raw values (a leaf occasionally
 *     needs a specific ramp step; the primitives sheet DEFINES the colors). This
 *     mirrors `no-primitive-tokens`.
 *   - `src/tango/docs/` — the design-system's own documentation site: demos and
 *     mockups intentionally show components against arbitrary sample colors and
 *     backdrops, and the doc chrome is tooling, not product UI.
 * Everywhere else under `src/tango/` — above all `src/tango/screens/`, the
 * migrated product screens — a hardcoded color is an error, and so is the
 * adapter/builder layer in `src/screens/tango_adapters/` (a color minted in an adapter
 * or view-model flows straight into the screen). All other files are a no-op.
 *
 * Only NUMERIC color literals (hex / `rgb(a)` / `hsl(a)`) are flagged: they are
 * unambiguous and each maps to a token. Named colors (`red`) and non-color
 * values (lengths, `zIndex`, opacity) are deliberately left alone — a length
 * like `12px` has no unambiguous single token and is better handled by choosing
 * a `--space-*`/`--radius-*` token in review.
 */

/** Repo-relative POSIX dir prefixes that may author raw color values. */
const EXEMPT_PREFIXES = [
  "src/tango/primitives/",
  "src/tango/components/",
  "src/tango/docs/",
];

/** Finds each hex / rgb(a) / hsl(a) color literal inside a string. */
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^()]*\)/g;

/** True when the whole trimmed text is exactly one color literal. */
const WHOLE_COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\([^()]*\))$/;

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Ban hardcoded color literals (hex/rgb/hsl) in Tango product UI; use semantic color tokens.",
    },
    schema: [],
    messages: {
      hardcodedColorWithToken:
        "'{{value}}' is a hardcoded color. Use the semantic token {{token}} (var({{token}})) — product UI builds from tokens, not raw color values.",
      hardcodedColorNoToken:
        "'{{value}}' is a hardcoded color with no matching Tango token. Add a semantic token for it in src/tango/primitives/tango-tokens.css, or use the nearest existing token — product UI builds from tokens, not raw color values.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    const inTango =
      fileRelative.startsWith("src/tango/") &&
      !EXEMPT_PREFIXES.some((prefix) => fileRelative.startsWith(prefix));
    if (!inTango && !fileRelative.startsWith("src/screens/tango_adapters/")) {
      return {};
    }

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

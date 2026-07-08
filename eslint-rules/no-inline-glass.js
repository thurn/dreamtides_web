import path from "node:path";

/**
 * Bans raw, numeric `blur()`/`saturate()` filter literals in Tango's
 * product-UI tier.
 *
 * The liquid-glass material is defined once, in
 * `src/tango/internal/glass-surface.ts`, as `glassSurfaceStyle()` (and its
 * sibling `control-treatment.ts` recipe). Components wear that material by
 * spreading the recipe (or rendering a component that already wears it) —
 * re-typing `blur(22px) saturate(1.5)` inline anywhere else forks the
 * material and lets it drift out of sync with the one true recipe.
 * Token-driven `blur(var(--…))` is not a fork — it still resolves through a
 * single design-token channel — so it is exempt.
 *
 * SCOPE. Files under `src/tango/` outside {@link EXEMPT_PREFIXES} and outside
 * `*.test.*`/`*.spec.*` files. `src/tango/internal/` is exempt because it is
 * the one legal home for the raw material recipe. `src/tango/docs/` is
 * exempt as tooling. `src/tango/primitives/` is exempt as the token mirror
 * layer.
 */

/** Repo-relative POSIX dir prefixes exempt from the check. */
const EXEMPT_PREFIXES = [
  "src/tango/internal/",
  "src/tango/docs/",
  "src/tango/primitives/",
];

/** Matches a raw numeric `blur(...)` filter value. */
const RAW_BLUR_RE = /blur\(\s*\.?\d/;
/** Matches a raw numeric `saturate(...)` filter value. */
const RAW_SATURATE_RE = /saturate\(\s*\.?\d/;
/** Matches a token-driven blur, e.g. CardView's `blur(var(--cv-textbox-blur))`. */
const TOKEN_BLUR_RE = /blur\(\s*var\(/;

/** True when the given CSS-filter-ish text inlines the raw glass material. */
function isRawGlass(text) {
  return (
    !TOKEN_BLUR_RE.test(text) &&
    (RAW_BLUR_RE.test(text) || RAW_SATURATE_RE.test(text))
  );
}

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule governs the given repo-relative POSIX path. */
export function isGovernedFile(fileRelative) {
  if (!fileRelative.startsWith("src/tango/")) {
    return false;
  }
  if (/\.(test|spec)\./.test(fileRelative)) {
    return false;
  }
  return !EXEMPT_PREFIXES.some((prefix) => fileRelative.startsWith(prefix));
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw blur()/saturate() glass-filter literals in Tango product UI; spread the glassSurfaceStyle() recipe instead.",
    },
    schema: [],
    messages: {
      inlineGlass:
        "Raw glass filter literal. The liquid-glass material is defined once in `src/tango/internal/glass-surface.ts` — spread `glassSurfaceStyle()` (or a component that already wears it) instead of inlining `blur()`/`saturate()`. Token-driven `blur(var(--…))` is fine.",
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

    return {
      Literal(node) {
        if (typeof node.value === "string" && isRawGlass(node.value)) {
          context.report({ node, messageId: "inlineGlass" });
        }
      },
      TemplateElement(node) {
        if (isRawGlass(node.value.raw)) {
          context.report({ node, messageId: "inlineGlass" });
        }
      },
    };
  },
};

export default rule;

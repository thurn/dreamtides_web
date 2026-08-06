import path from "node:path";
import { knownTokenNames } from "./cumulus-token-index.js";
import { isUniversalUiFile } from "./ui-boundary-roles.js";

/**
 * Every literal `var(--x)` reference in Cumulus product UI must name a token
 * that is actually declared in `src/cumulus/primitives/cumulus-tokens.css`.
 *
 * The typed `token()` helper already guarantees this for its own call sites —
 * its argument is a union of the real token names. But a plain string like
 * `"var(--spce-3)"` (typo) or `"var(--space-half)"` (invented) type-checks,
 * lints clean, and then silently resolves to nothing at runtime: the browser
 * treats the whole declaration as guaranteed-invalid and the style quietly
 * disappears. This rule turns that invisible failure into an error at
 * authoring time.
 *
 * SCOPE. All of the Cumulus tier: every file under `src/cumulus/` EXCEPT the
 * token-definition directory (`src/cumulus/primitives/`) and the
 * doc site (`src/cumulus/docs/`, whose specimens intentionally print token names
 * that may not all resolve), plus the adapter/builder layer in
 * `src/screens/cumulus_adapters/`. Component ownership is included: a `var(--x)`
 * inside `src/cumulus/components/` must resolve to a real token, catching the
 * `--cv-textbox-blur`-class of leak. See {@link isCumulusOwnedFile}.
 *
 * COMPONENT-LOCAL ALLOWLIST. Components legitimately reference JS-injected,
 * component-local runtime CSS custom properties that are not design tokens —
 * the `--cv-` (legacy card chrome), `--atlas-`, `--qsb-`, and `--info-card-`
 * families (see {@link COMPONENT_LOCAL_VAR_PREFIXES}). A `var(--x)` whose name
 * begins with one of those prefixes is skipped.
 *
 * If the stylesheet cannot be read the known-name set is empty and the rule
 * is a no-op (never flags everything).
 */

/** Repo-relative POSIX dir prefixes exempt from the {@link isProductUiFile} check. */
const EXEMPT_PREFIXES = [
  "src/cumulus/primitives/",
  "src/cumulus/components/",
  "src/cumulus/internal/",
  "src/cumulus/docs/",
];

/**
 * Repo-relative POSIX dir prefixes under `src/cumulus/` that {@link isCumulusOwnedFile}
 * excludes from token-ownership: the token-definition directory defines the tokens, and
 * the doc site prints specimen names that need not all resolve.
 */
const OWNERSHIP_EXEMPT_PREFIXES = ["src/cumulus/primitives/", "src/cumulus/docs/"];

/**
 * CSS custom-property name prefixes that are component-local, JS-injected
 * runtime vars rather than design tokens. A `var(--x)` whose name starts with
 * one of these is allowlisted (never flagged) inside owned component files.
 */
const COMPONENT_LOCAL_VAR_PREFIXES = ["--cv-", "--atlas-", "--qsb-", "--info-card-"];

/** Finds each `var(--name)` / `var(--name, fallback)` reference in a string. */
const VAR_RE = /var\(\s*(--[a-zA-Z0-9-]+)/g;

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule governs the given repo-relative POSIX path. */
export function isProductUiFile(fileRelative) {
  if (fileRelative.startsWith("src/screens/cumulus_adapters/")) {
    return true;
  }
  return (
    fileRelative.startsWith("src/cumulus/") &&
    !EXEMPT_PREFIXES.some((prefix) => fileRelative.startsWith(prefix))
  );
}

/**
 * True when this rule OWNS token references in the given repo-relative POSIX
 * path. Covers the adapter/builder layer plus all of `src/cumulus/` (component
 * ownership included), excluding only the token-definition and doc tiers
 * ({@link OWNERSHIP_EXEMPT_PREFIXES}).
 */
export function isCumulusOwnedFile(fileRelative) {
  return isUniversalUiFile(fileRelative, OWNERSHIP_EXEMPT_PREFIXES);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Every literal var(--x) reference across the Cumulus tier (all of src/cumulus/ — component ownership included — plus src/screens/cumulus_adapters/) must name a token declared in cumulus-tokens.css; a typo'd or invented token silently drops the whole declaration at runtime. Component-local runtime var families (--cv-, --atlas-, --qsb-, --info-card-) are allowlisted.",
    },
    schema: [],
    messages: {
      unknownToken:
        "var({{name}}) does not match any token in src/cumulus/primitives/cumulus-tokens.css — the browser will silently drop this declaration. Check the name against the token reference (or prefer the typed token() helper, which cannot misspell).",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!isCumulusOwnedFile(fileRelative)) {
      return {};
    }
    const known = knownTokenNames();
    if (known.size === 0) {
      return {};
    }

    function checkText(node, text) {
      if (typeof text !== "string") {
        return;
      }
      let match;
      VAR_RE.lastIndex = 0;
      while ((match = VAR_RE.exec(text)) !== null) {
        const name = match[1];
        const allowlisted = COMPONENT_LOCAL_VAR_PREFIXES.some((prefix) =>
          name.startsWith(prefix),
        );
        if (!known.has(name) && !allowlisted) {
          context.report({
            node,
            messageId: "unknownToken",
            data: { name },
          });
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") {
          checkText(node, node.value);
        }
      },
      TemplateElement(node) {
        checkText(node, node.value.raw);
      },
    };
  },
};

export default rule;

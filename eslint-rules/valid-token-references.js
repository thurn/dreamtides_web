import path from "node:path";
import { knownTokenNames } from "./tango-token-index.js";

/**
 * Every literal `var(--x)` reference in Tango product UI must name a token
 * that is actually declared in `src/tango/primitives/tango-tokens.css`.
 *
 * The typed `token()` helper already guarantees this for its own call sites —
 * its argument is a union of the real token names. But a plain string like
 * `"var(--spce-3)"` (typo) or `"var(--space-half)"` (invented) type-checks,
 * lints clean, and then silently resolves to nothing at runtime: the browser
 * treats the whole declaration as guaranteed-invalid and the style quietly
 * disappears. This rule turns that invisible failure into an error at
 * authoring time.
 *
 * SCOPE. The product-UI tier: files under `src/tango/` outside
 * {@link EXEMPT_PREFIXES}, plus the adapter/builder layer in
 * `src/screens/tango/`. The exempt dirs mirror `no-hardcoded-values`: the
 * primitive layer DEFINES the tokens, leaf components may bridge to
 * production token names, and the doc site's specimens intentionally print
 * token names that may not all resolve.
 *
 * If the stylesheet cannot be read the known-name set is empty and the rule
 * is a no-op (never flags everything).
 */

/** Repo-relative POSIX dir prefixes exempt from the check. */
const EXEMPT_PREFIXES = [
  "src/tango/primitives/",
  "src/tango/components/",
  "src/tango/docs/",
];

/** Finds each `var(--name)` / `var(--name, fallback)` reference in a string. */
const VAR_RE = /var\(\s*(--[a-zA-Z0-9-]+)/g;

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule governs the given repo-relative POSIX path. */
export function isProductUiFile(fileRelative) {
  if (fileRelative.startsWith("src/screens/tango/")) {
    return true;
  }
  return (
    fileRelative.startsWith("src/tango/") &&
    !EXEMPT_PREFIXES.some((prefix) => fileRelative.startsWith(prefix))
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Every literal var(--x) reference must name a token declared in tango-tokens.css; a typo'd or invented token silently drops the whole declaration at runtime.",
    },
    schema: [],
    messages: {
      unknownToken:
        "var({{name}}) does not match any token in src/tango/primitives/tango-tokens.css — the browser will silently drop this declaration. Check the name against the token reference (or prefer the typed token() helper, which cannot misspell).",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!isProductUiFile(fileRelative)) {
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
        if (!known.has(name)) {
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

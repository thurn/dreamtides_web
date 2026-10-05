import { knownTokenNames } from "./cumulus-token-index.js";

/**
 * Every literal `var(--x)` reference in UI code must name a token
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
 * COMPONENT-LOCAL ALLOWLIST. Components legitimately reference JS-injected,
 * component-local runtime CSS custom properties that are not design tokens —
 * the `--cv-` (legacy card chrome), `--atlas-`, `--qsb-`, and `--info-card-`
 * families (see {@link COMPONENT_LOCAL_VAR_PREFIXES}). A `var(--x)` whose name
 * begins with one of those prefixes is skipped.
 *
 * If the stylesheet cannot be read the known-name set is empty and the rule
 * is a no-op (never flags everything).
 */

/**
 * CSS custom-property name prefixes that are component-local, JS-injected
 * runtime vars rather than design tokens. A `var(--x)` whose name starts with
 * one of these is allowlisted (never flagged).
 */
const COMPONENT_LOCAL_VAR_PREFIXES = ["--cv-", "--atlas-", "--qsb-", "--info-card-"];

/** Finds each `var(--name)` / `var(--name, fallback)` reference in a string. */
const VAR_RE = /var\(\s*(--[a-zA-Z0-9-]+)/g;

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Every literal var(--x) reference must name a token declared in cumulus-tokens.css; a typo'd or invented token silently drops the whole declaration at runtime. Component-local runtime var families (--cv-, --atlas-, --qsb-, --info-card-) are allowlisted.",
    },
    schema: [],
    messages: {
      unknownToken:
        "var({{name}}) does not match any token in src/cumulus/primitives/cumulus-tokens.css — the browser will silently drop this declaration. Check the name against the token reference (or prefer the typed token() helper, which cannot misspell).",
    },
  },

  create(context) {
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

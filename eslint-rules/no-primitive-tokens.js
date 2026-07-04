import path from "node:path";

/**
 * Bans raw design PRIMITIVES from Tango UI code.
 *
 * The Tango token system has two tiers (see
 * src/tango/primitives/tango-tokens.css):
 *   - PRIMITIVES (`--primitive-*`) name a raw value — a color-ramp step, a
 *     radius step, a font face, a weight. They are the material the semantic
 *     layer is built from.
 *   - SEMANTIC tokens name a use (`--surface-card`, `--radius-control`,
 *     `--font-ui`). UI code writes against these.
 *
 * A `--primitive-*` token may be referenced ONLY inside the two directories
 * that legitimately handle raw values:
 *   - `src/tango/primitives/` — where the semantic layer is defined.
 *   - `src/tango/components/` — leaf components that occasionally need a raw
 *     ramp step with no semantic role (e.g. a specific tide-tone).
 * Everywhere else — doc pages, demos, mockups, product screens, and the
 * adapter/builder layer in `src/screens/tango_adapters/` — referencing a primitive is
 * an error. No exceptions.
 *
 * To avoid false positives on prose or on code that merely INSPECTS token
 * names (e.g. `name.startsWith("--primitive-")`), the rule flags only the two
 * shapes that actually APPLY a primitive as a value:
 *   1. `token("--primitive-…")` — a call to the typed token() helper.
 *   2. a string/template literal containing `var(--primitive-…)` — an inline
 *      style or CSS-in-JS reference.
 *
 * Files outside `src/tango/` are unaffected (the rule is a no-op there).
 */

/** Repo-relative POSIX dir prefixes allowed to reference `--primitive-*`. */
const ALLOWED_PREFIXES = ["src/tango/primitives/", "src/tango/components/"];

/** A `var(--primitive-…)` reference anywhere inside a string. */
const VAR_PRIMITIVE_RE = /var\(\s*--primitive-/;

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw --primitive-* design tokens outside src/tango/primitives and src/tango/components; UI code uses semantic tokens.",
    },
    schema: [],
    messages: {
      primitiveToken:
        "'{{token}}' is a raw primitive. UI code must use a semantic token (e.g. --surface-card, --radius-control, --font-ui) instead. Primitives may be referenced only in src/tango/primitives/ or src/tango/components/.",
      primitiveInString:
        "This value references a raw primitive ({{token}}). UI code must use a semantic token instead. Primitives may be referenced only in src/tango/primitives/ or src/tango/components/.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    // Act on files under src/tango/ (never the two allowed dirs) and on the
    // adapter/builder layer in src/screens/tango_adapters/.
    const inTango =
      fileRelative.startsWith("src/tango/") &&
      !ALLOWED_PREFIXES.some((prefix) => fileRelative.startsWith(prefix));
    if (!inTango && !fileRelative.startsWith("src/screens/tango_adapters/")) {
      return {};
    }

    /** Extract the first `--primitive-…` name out of a matched string, for the
     * message. Falls back to the generic label. */
    function primitiveNameIn(text) {
      const match = /--primitive-[a-zA-Z0-9-]+/.exec(text);
      return match ? match[0] : "--primitive-*";
    }

    /** Report a `var(--primitive-…)` reference embedded in a string value. */
    function checkStringValue(node, text) {
      if (typeof text === "string" && VAR_PRIMITIVE_RE.test(text)) {
        context.report({
          node,
          messageId: "primitiveInString",
          data: { token: primitiveNameIn(text) },
        });
      }
    }

    return {
      // 1. token("--primitive-…") — the typed helper applied to a primitive.
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "token" &&
          node.arguments.length > 0
        ) {
          const arg = node.arguments[0];
          if (
            arg.type === "Literal" &&
            typeof arg.value === "string" &&
            arg.value.startsWith("--primitive-")
          ) {
            context.report({
              node: arg,
              messageId: "primitiveToken",
              data: { token: arg.value },
            });
          }
        }
      },

      // 2. Any string literal that contains a var(--primitive-…) reference.
      Literal(node) {
        if (typeof node.value === "string") {
          checkStringValue(node, node.value);
        }
      },

      // 3. Template-literal chunks (CSS-in-JS) that contain var(--primitive-…).
      TemplateElement(node) {
        checkStringValue(node, node.value.raw);
      },
    };
  },
};

export default rule;

import path from "node:path";

/**
 * A `--t-*` type token is a COMPLETE `font` shorthand — it bundles weight,
 * size/line-height, and face (`--t-body: 500 15px/1.45 var(--font)`).
 * Composing one with extra parts, e.g.
 *
 *   font: `500 ${token("--t-caption")} ${token("--font-ui")}`
 *
 * substitutes to `font: 500 600 12px/1.35 Face Face` — an invalid shorthand
 * the browser drops at computed-value time, so the text silently renders in
 * the inherited font. Beyond the outright breakage, hand-tuning a voice's
 * weight or face is exactly the per-call-site drift the type scale exists to
 * prevent. A voice is applied with a single token:
 *
 *   font: token("--t-caption")
 *
 * (`fontStyle: "italic"` may be layered as its own property; a voice that
 * genuinely needs a different weight is a token-system conversation, not an
 * inline override.)
 *
 * This rule flags any string/template literal that combines a `--t-*`
 * reference — a `token("--t-…")` expression or a literal `var(--t-…)` — with
 * any other content.
 *
 * SCOPE. The product-UI tier: files under `src/tango/` outside
 * {@link EXEMPT_PREFIXES}, plus the adapter/builder layer in
 * `src/screens/tango/`, mirroring `no-hardcoded-values`.
 */

/** Repo-relative POSIX dir prefixes exempt from the check. */
const EXEMPT_PREFIXES = [
  "src/tango/primitives/",
  "src/tango/components/",
  "src/tango/docs/",
];

/** Matches a literal `var(--t-…)` reference inside text. */
const VAR_T_RE = /var\(\s*--t-[a-zA-Z0-9-]+\s*\)/g;

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

/** True when this template expression is a `token("--t-…")` call. */
function isTypeTokenCall(expression) {
  return (
    expression.type === "CallExpression" &&
    expression.callee.type === "Identifier" &&
    expression.callee.name === "token" &&
    expression.arguments.length > 0 &&
    expression.arguments[0].type === "Literal" &&
    typeof expression.arguments[0].value === "string" &&
    expression.arguments[0].value.startsWith("--t-")
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A --t-* token is a complete font shorthand; composing it with extra parts produces an invalid value the browser silently drops. Apply a voice with font: token('--t-x') alone.",
    },
    schema: [],
    messages: {
      composedVoice:
        "A --t-* token is a complete font shorthand (weight + size/line-height + face); combining it with other parts makes the value invalid and the browser silently drops the declaration. Write font: token(\"--t-…\") on its own — set fontStyle separately if needed, and treat a genuinely different weight as a token-system conversation.",
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

    return {
      Literal(node) {
        if (typeof node.value !== "string") {
          return;
        }
        const refCount = (node.value.match(VAR_T_RE) ?? []).length;
        if (refCount === 0) {
          return;
        }
        const withoutRefs = node.value.replace(VAR_T_RE, "");
        if (refCount > 1 || withoutRefs.trim() !== "") {
          context.report({ node, messageId: "composedVoice" });
        }
      },
      TemplateLiteral(node) {
        const hasTypeToken =
          node.expressions.some(isTypeTokenCall) ||
          node.quasis.some(
            (quasi) => (quasi.value.raw.match(VAR_T_RE) ?? []).length > 0,
          );
        if (!hasTypeToken) {
          return;
        }
        const otherExpressionCount = node.expressions.filter(
          (expression) => !isTypeTokenCall(expression),
        ).length;
        const typeTokenCount =
          node.expressions.filter(isTypeTokenCall).length +
          node.quasis.reduce(
            (count, quasi) =>
              count + (quasi.value.raw.match(VAR_T_RE) ?? []).length,
            0,
          );
        const literalText = node.quasis
          .map((quasi) => quasi.value.raw.replace(VAR_T_RE, ""))
          .join("");
        const composed =
          otherExpressionCount > 0 ||
          typeTokenCount > 1 ||
          literalText.trim() !== "";
        if (composed) {
          context.report({ node, messageId: "composedVoice" });
        }
      },
    };
  },
};

export default rule;

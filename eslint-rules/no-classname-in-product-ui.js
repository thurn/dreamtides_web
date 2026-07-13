import path from "node:path";

/**
 * Bans the `className` JSX attribute in Cumulus's product-UI tier.
 *
 * Tailwind is active in the build and global stylesheets are loadable, so a
 * single `className="p-3 text-purple-400"` (or a class hooked to a bespoke
 * .css file) silently routes around the entire token system — colors,
 * spacing, and type all escape at once, with zero diagnostics from the other
 * Cumulus rules, which check inline values. In the product tier, appearance
 * comes from Cumulus components and token-valued inline styles; utility classes
 * and ad-hoc stylesheets are not a sanctioned styling channel.
 *
 * The one legitimate class in product UI is the literal `"cumulus"` scope class
 * a screen's root element carries so the token custom properties resolve for
 * its subtree; that exact value is allowed.
 *
 * SCOPE. Files under `src/cumulus/` outside {@link EXEMPT_PREFIXES}, plus the
 * adapter layer in `src/screens/cumulus_adapters/` (an adapter renders no chrome of its
 * own, so it has no business classing anything). Components, primitives, and
 * the doc site legitimately author class-based styling and are exempt.
 */

/** Repo-relative POSIX dir prefixes exempt from the check. */
const EXEMPT_PREFIXES = [
  "src/cumulus/primitives/",
  "src/cumulus/components/",
  "src/cumulus/docs/",
];

/** The one class value product UI may apply: the token-scope root class. */
const ALLOWED_CLASS_VALUES = new Set(["cumulus"]);

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

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban className in Cumulus product UI (except the literal \"cumulus\" scope class): utility classes and ad-hoc stylesheets bypass the token system.",
    },
    schema: [],
    messages: {
      classNameProp:
        "className is not a styling channel in Cumulus product UI — utility classes and stylesheets bypass the token system entirely. Style with token-valued inline styles, or compose a Cumulus component. (The literal \"cumulus\" scope class on a screen root is the one exception.)",
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
      JSXAttribute(node) {
        if (
          node.name?.type !== "JSXIdentifier" ||
          node.name.name !== "className"
        ) {
          return;
        }
        if (
          node.value?.type === "Literal" &&
          typeof node.value.value === "string" &&
          ALLOWED_CLASS_VALUES.has(node.value.value)
        ) {
          return;
        }
        context.report({ node, messageId: "classNameProp" });
      },
    };
  },
};

export default rule;

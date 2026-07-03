import path from "node:path";

/**
 * Bans raw native interactive elements in Tango's product-UI tier.
 *
 * The design system already provides the interactive surfaces — `Button`,
 * `SegmentedControl`, and the `Pressable` primitive that owns press/hover
 * mechanics. A product screen that reaches for a bare `<button>`, `<input>`,
 * `<select>`, `<textarea>`, or an `<a href>` is re-implementing a component
 * instead of composing one, which is exactly how visual and interaction drift
 * creeps in. This rule flags those elements so the systematic path (use the
 * component) is the path of least resistance.
 *
 * SCOPE. Fires only on the composition / product-UI tier: files under
 * `src/tango/` that are NOT in {@link EXEMPT_PREFIXES}:
 *   - `src/tango/primitives/` and `src/tango/components/` — these are where a
 *     native element is legitimately wrapped (`Button` renders a `<button>`,
 *     `Pressable` renders the element it forwards to). They OWN the native tag.
 *   - `src/tango/docs/` — the documentation site is tooling: its control panel
 *     genuinely needs native `<input>`/`<select>`, and its chrome uses plain
 *     `<button>`s.
 * Everywhere else under `src/tango/` — above all `src/tango/screens/` — a raw
 * interactive element is an error: compose `Button` / `SegmentedControl` /
 * `Pressable` instead. Files outside `src/tango/` are a no-op.
 */

/** Repo-relative POSIX dir prefixes that may render native interactive tags. */
const EXEMPT_PREFIXES = [
  "src/tango/primitives/",
  "src/tango/components/",
  "src/tango/docs/",
];

/** Native interactive tag name -> the Tango surface to compose instead. */
const BANNED_ELEMENTS = new Map([
  ["button", "Button, SegmentedControl, or the Pressable primitive"],
  ["input", "a Tango control component"],
  ["select", "SegmentedControl or a Tango control component"],
  ["textarea", "a Tango control component"],
]);

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** The lowercase tag name of a JSX opening element, or null for a component. */
export function jsxTagName(node) {
  const name = node.name;
  if (name && name.type === "JSXIdentifier" && /^[a-z]/.test(name.name)) {
    return name.name;
  }
  return null;
}

/** True when a JSX opening element has an `href` attribute (a real link). */
function hasHrefAttribute(node) {
  return (node.attributes ?? []).some(
    (attr) =>
      attr.type === "JSXAttribute" &&
      attr.name?.type === "JSXIdentifier" &&
      attr.name.name === "href",
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw native interactive elements (button/input/select/textarea/a[href]) in Tango product UI; compose Button/SegmentedControl/Pressable instead.",
    },
    schema: [],
    messages: {
      rawInteractive:
        "`<{{tag}}>` is a raw interactive element. Compose {{use}} instead — the design system owns interactive surfaces so product UI doesn't re-implement them.",
      rawAnchor:
        "`<a href>` is a raw link/button. Use the Pressable primitive (or a Tango button) so press mechanics and styling stay in the design system.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!fileRelative.startsWith("src/tango/")) {
      return {};
    }
    if (EXEMPT_PREFIXES.some((prefix) => fileRelative.startsWith(prefix))) {
      return {};
    }

    return {
      JSXOpeningElement(node) {
        const tag = jsxTagName(node);
        if (tag === null) {
          return;
        }
        if (tag === "a" && hasHrefAttribute(node)) {
          context.report({ node: node.name, messageId: "rawAnchor" });
          return;
        }
        const use = BANNED_ELEMENTS.get(tag);
        if (use !== undefined) {
          context.report({
            node: node.name,
            messageId: "rawInteractive",
            data: { tag, use },
          });
        }
      },
    };
  },
};

export default rule;

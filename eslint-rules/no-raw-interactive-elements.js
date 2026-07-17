import path from "node:path";
import { isStrictCompositionFile } from "./ui-boundary-roles.js";

/**
 * Bans raw native interactive elements in Cumulus's product-UI tier.
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
 * `src/cumulus/` that are NOT in {@link EXEMPT_PREFIXES}:
 *   - `src/cumulus/primitives/`, `src/cumulus/components/`, and `src/cumulus/internal/`
 *     — these are where a native element is legitimately wrapped (`Button`
 *     renders a `<button>`, `Pressable` renders the element it forwards to) or
 *     where a material recipe returns style objects with no elements of its
 *     own. They OWN the native tag.
 *   - `src/cumulus/docs/` — the documentation site is tooling: its control panel
 *     genuinely needs native `<input>`/`<select>`, and its chrome uses plain
 *     `<button>`s.
 * Everywhere else under `src/cumulus/` — above all `src/cumulus/screens/` — a raw
 * interactive element is an error, and so is the adapter/builder layer in
 * `src/screens/cumulus_adapters/`: compose `Button` / `SegmentedControl` / `Pressable`
 * instead. All other files are a no-op.
 *
 * The rule also catches the hand-rolled button: a non-interactive intrinsic
 * element (`div`, `span`, …) given `onClick`/`onDoubleClick`, an interactive
 * `role`, or a `tabIndex`. That element re-implements Pressable minus its
 * press mechanics, focus handling, and reduced-motion behavior — the most
 * common way an interactive surface drifts out of the system. (Non-activating
 * pointer handlers — `onPointerEnter`, `onPointerMove`, drag/pan surfaces —
 * are deliberately not flagged.)
 */

/** Repo-relative POSIX dir prefixes that may render native interactive tags. */
const EXEMPT_PREFIXES = [
  "src/cumulus/primitives/",
  "src/cumulus/components/",
  "src/cumulus/internal/",
  "src/cumulus/docs/",
  "src/cumulus/screens/devtools/",
];

/** Native interactive tag name -> the Cumulus surface to compose instead. */
const BANNED_ELEMENTS = new Map([
  ["button", "Button, SegmentedControl, or the Pressable primitive"],
  ["input", "a Cumulus control component"],
  ["select", "SegmentedControl or a Cumulus control component"],
  ["textarea", "a Cumulus control component"],
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

/** Activation handlers that make a plain element a de-facto button. */
const ACTIVATION_ATTRIBUTES = new Set(["onClick", "onDoubleClick"]);

/** ARIA roles that declare an element interactive. */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "tab",
  "menuitem",
  "option",
  "checkbox",
  "radio",
  "switch",
  "slider",
]);

/**
 * The attribute that marks this intrinsic element as a hand-rolled control
 * (an activation handler, an interactive role, or tabIndex), or null when the
 * element carries none.
 */
function handRolledButtonMarker(node) {
  for (const attr of node.attributes ?? []) {
    if (attr.type !== "JSXAttribute" || attr.name?.type !== "JSXIdentifier") {
      continue;
    }
    const name = attr.name.name;
    if (ACTIVATION_ATTRIBUTES.has(name)) {
      return name;
    }
    if (name === "tabIndex") {
      return name;
    }
    if (
      name === "role" &&
      attr.value?.type === "Literal" &&
      typeof attr.value.value === "string" &&
      INTERACTIVE_ROLES.has(attr.value.value)
    ) {
      return `role="${attr.value.value}"`;
    }
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw native interactive elements (button/input/select/textarea/a[href]) in Cumulus product UI; compose Button/SegmentedControl/Pressable instead.",
    },
    schema: [],
    messages: {
      rawInteractive:
        "`<{{tag}}>` is a raw interactive element. Compose {{use}} instead — the design system owns interactive surfaces so product UI doesn't re-implement them.",
      rawAnchor:
        "`<a href>` is a raw link/button. Use the Pressable primitive (or a Cumulus button) so press mechanics and styling stay in the design system.",
      handRolledButton:
        "`<{{tag}} {{marker}}>` hand-rolls an interactive control. Use the Pressable primitive (or a Cumulus button) instead — it owns press feedback, keyboard focus, and reduced-motion behavior that a bare element silently lacks.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!isStrictCompositionFile(fileRelative, EXEMPT_PREFIXES)) {
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
          return;
        }
        const marker = handRolledButtonMarker(node);
        if (marker !== null) {
          context.report({
            node: node.name,
            messageId: "handRolledButton",
            data: { tag, marker },
          });
        }
      },
    };
  },
};

export default rule;

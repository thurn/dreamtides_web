import path from "node:path";
import { isStrictCompositionFile } from "./ui-boundary-roles.js";
import { spaceTokenFor } from "./cumulus-token-index.js";

/**
 * Spacing in Cumulus product UI comes from the `--space-*` scale, and corner
 * rounding from the `--radius-*` roles — never from raw pixel literals.
 *
 * A raw `gap: 12` or `padding: "16px 18px 20px"` hardcodes a rhythm step the
 * design system can no longer control (re-skinning the scale silently skips
 * it), and off-scale values (an 18px that is neither `--space-6` nor
 * `--space-7`) are exactly how spacing drifts one screen at a time. This rule
 * flags raw lengths on spacing/radius CSS properties in inline style objects
 * and — via {@link spaceTokenFor} — names the `--space-*` step that already
 * carries the value, autofixing when the whole value is a single on-scale
 * length.
 *
 * WHAT COUNTS AS SPACING. Only properties whose role is rhythm: the padding
 * and margin families, gap/rowGap/columnGap, the inset family plus
 * top/right/bottom/left, and the borderRadius family (which must use the
 * `--radius-*` roles). Box MEASURES — the width/height/minWidth/maxWidth
 * families — are content-driven layout and deliberately not flagged; neither
 * are hairline border widths, type metrics (the `--t-*` voices own those),
 * zIndex, opacity, or flex factors.
 *
 * SCOPE. The product-UI tier: files under `src/cumulus/` outside
 * {@link EXEMPT_PREFIXES}, plus the adapter/builder layer in
 * `src/screens/cumulus_adapters/`, mirroring `no-hardcoded-values` (the primitive,
 * component, and internal/ material-recipe tiers legitimately author raw
 * values; the doc site is tooling).
 */

/** Repo-relative POSIX dir prefixes exempt from the check. */
const EXEMPT_PREFIXES = [
  "src/cumulus/primitives/",
  "src/cumulus/components/",
  "src/cumulus/internal/",
  "src/cumulus/docs/",
  "src/cumulus/screens/devtools/",
];

/** Style-object property names whose values are rhythm steps. */
const SPACING_PROPS = new Set([
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "paddingInline",
  "paddingInlineStart",
  "paddingInlineEnd",
  "paddingBlock",
  "paddingBlockStart",
  "paddingBlockEnd",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "marginInline",
  "marginInlineStart",
  "marginInlineEnd",
  "marginBlock",
  "marginBlockStart",
  "marginBlockEnd",
  "gap",
  "rowGap",
  "columnGap",
  "inset",
  "insetInline",
  "insetInlineStart",
  "insetInlineEnd",
  "insetBlock",
  "insetBlockStart",
  "insetBlockEnd",
  "top",
  "right",
  "bottom",
  "left",
]);

/** Radius properties, which take the `--radius-*` role tokens. */
const RADIUS_PROPS = new Set([
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderStartStartRadius",
  "borderStartEndRadius",
  "borderEndStartRadius",
  "borderEndEndRadius",
]);

/** Finds each `<number>px` length inside a string value. */
const PX_RE = /(\d+(?:\.\d+)?)px\b/g;

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule governs the given repo-relative POSIX path. */
export function isProductUiFile(fileRelative) {
  return isStrictCompositionFile(fileRelative, EXEMPT_PREFIXES);
}

/**
 * The raw pixel number a value node hardcodes, or null when the node carries
 * no literal length: a nonzero numeric literal (React treats bare numbers on
 * these properties as px), its negation, or a string that is exactly one
 * `<n>px` length.
 */
function wholeLengthOf(node) {
  if (node.type === "Literal" && typeof node.value === "number") {
    return node.value === 0 ? null : node.value;
  }
  if (
    node.type === "UnaryExpression" &&
    node.operator === "-" &&
    node.argument.type === "Literal" &&
    typeof node.argument.value === "number"
  ) {
    return node.argument.value === 0 ? null : -node.argument.value;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    const whole = /^(\d+(?:\.\d+)?)px$/.exec(node.value.trim());
    if (whole) {
      const px = Number(whole[1]);
      return px === 0 ? null : px;
    }
  }
  return null;
}

/** Every nonzero `<n>px` length inside a string, as numbers. */
function pxLengthsIn(text) {
  const out = [];
  let match;
  PX_RE.lastIndex = 0;
  while ((match = PX_RE.exec(text)) !== null) {
    const px = Number(match[1]);
    if (px !== 0) {
      out.push(px);
    }
  }
  return out;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Spacing and radius values in Cumulus product UI come from the --space-*/--radius-* tokens, never raw pixel literals.",
    },
    schema: [],
    messages: {
      rawSpacingWithToken:
        "'{{value}}' hardcodes a spacing step. Use var({{token}}) — rhythm comes from the --space-* scale so the whole app re-spaces from one place.",
      rawSpacingOffScale:
        "'{{value}}' is a raw length off the --space-* scale. Snap it to the nearest step (see the Space section of the token reference) — off-scale one-off spacing is exactly the drift the scale exists to prevent.",
      rawRadius:
        "'{{value}}' hardcodes a corner radius. Use one of the five --radius-* tokens (--radius-compact, --radius-control, --radius-panel, --radius-large, --radius-pill) so surfaces round consistently.",
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

    /** Report one spacing length, autofixing a whole single on-scale value. */
    function reportSpacing(valueNode, px, isWholeValue) {
      const token = px > 0 ? spaceTokenFor(px) : null;
      if (token === null) {
        context.report({
          node: valueNode,
          messageId: "rawSpacingOffScale",
          data: { value: `${px}px` },
        });
        return;
      }
      const canFix = isWholeValue;
      context.report({
        node: valueNode,
        messageId: "rawSpacingWithToken",
        data: { value: `${px}px`, token },
        fix: canFix
          ? (fixer) => fixer.replaceText(valueNode, `"var(${token})"`)
          : undefined,
      });
    }

    /**
     * True when this object property lives in a STYLE context: inside a JSX
     * `style={...}` attribute, or in an object bound to a name ending in
     * "style"/"Style"/"styles"/"Styles". Restricting to style contexts keeps
     * the rule off view-model data that happens to use CSS-ish field names
     * (an atlas node's `top`/`left` stage coordinates are domain data, not
     * spacing).
     */
    function inStyleContext(node) {
      const ancestors = context.sourceCode.getAncestors(node);
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestor = ancestors[i];
        if (
          ancestor.type === "JSXAttribute" &&
          ancestor.name?.type === "JSXIdentifier" &&
          ancestor.name.name === "style"
        ) {
          return true;
        }
        if (
          ancestor.type === "VariableDeclarator" &&
          ancestor.id.type === "Identifier" &&
          /styles?$/i.test(ancestor.id.name)
        ) {
          return true;
        }
        if (
          ancestor.type === "Property" &&
          !ancestor.computed &&
          ancestor.key.type === "Identifier" &&
          /styles?$/i.test(ancestor.key.name)
        ) {
          return true;
        }
      }
      return false;
    }

    /**
     * Check one `key: value` style-object property. Values this rule cannot
     * see through (identifiers, calls like token(), conditionals, templates
     * with expressions) are left alone — token() calls and computed values
     * are the sanctioned shapes.
     */
    function checkProperty(node) {
      if (node.computed || node.value === null || node.value === undefined) {
        return;
      }
      const key =
        node.key.type === "Identifier"
          ? node.key.name
          : node.key.type === "Literal" && typeof node.key.value === "string"
            ? node.key.value
            : null;
      if (key === null) {
        return;
      }

      const isRadius = RADIUS_PROPS.has(key);
      if (!SPACING_PROPS.has(key) && !isRadius) {
        return;
      }
      if (!inStyleContext(node)) {
        return;
      }

      const value = node.value;
      const whole = wholeLengthOf(value);
      if (whole !== null) {
        if (isRadius) {
          context.report({
            node: value,
            messageId: "rawRadius",
            data: { value: `${whole}px` },
          });
        } else {
          reportSpacing(value, whole, true);
        }
        return;
      }
      // A multi-part string shorthand: report each px length inside it.
      if (value.type === "Literal" && typeof value.value === "string") {
        for (const px of pxLengthsIn(value.value)) {
          if (isRadius) {
            context.report({
              node: value,
              messageId: "rawRadius",
              data: { value: `${px}px` },
            });
          } else {
            reportSpacing(value, px, false);
          }
        }
        return;
      }
      // Template chunks: `${token("--space-6")} 18px` — flag the raw parts.
      if (value.type === "TemplateLiteral") {
        for (const quasi of value.quasis) {
          for (const px of pxLengthsIn(quasi.value.raw)) {
            if (isRadius) {
              context.report({
                node: quasi,
                messageId: "rawRadius",
                data: { value: `${px}px` },
              });
            } else {
              reportSpacing(quasi, px, false);
            }
          }
        }
      }
    }

    return {
      Property: checkProperty,
    };
  },
};

export default rule;

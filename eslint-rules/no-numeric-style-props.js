import path from "node:path";

/**
 * Keeps Cumulus component APIs strict (see the "Strict, Controlled APIs" principle
 * in the /cumulus Design Philosophy), the numeric-knob half of the escape-hatch
 * bans that `no-escape-hatch-props.js` enforces on node/style passthroughs.
 *
 * A number-typed visual knob — `size?: number`, `gap?: number`, `scale?: number`
 * — is an arbitrary-customization escape hatch: it lets a caller dial any pixel
 * value they like instead of choosing from the design system's enumerated
 * scale. This rule flags such members on an EXPORTED `*Props`, `*View`, or
 * `*Model` type in
 * `src/cumulus/components/`. The strict form is an enumerated string variant
 * (`size?: "sm" | "md" | "lg"`); the component maps the token to its own fixed
 * measure.
 *
 * A member is a numeric knob when BOTH hold:
 *   1. its name is a knob word — exactly one of
 *      `{size, gap, scale, padding, radius, blur, opacity}`, or a camelCase name
 *      beginning or ending with a capitalized knob-word boundary (`sizePx`,
 *      `badgeScale`, `pipScale`); and
 *   2. its type is `number` (or a union that includes `number`).
 *
 * Some production measures genuinely have no enumerable form — a computed
 * stage-pixel diameter, a px offset between an anchor and a popover, a fixed
 * box width that is a measure rather than a style knob. Those are exempted by
 * name through the `allow` option (`{ allow: ["TypeName.member", …] }`) so the
 * exception is a deliberate, commented decision in the config rather than a
 * silent skip.
 *
 * Scope: only EXPORTED `*Props`, `*View`, and `*Model` declarations (an internal, co-located
 * spec type keeps its numeric fields — rename it away from a knob word if it is
 * genuinely private) under `src/cumulus/components/`. `__*__` fixture files and
 * files outside that surface are a no-op. Only a member whose OWN type is a
 * number is flagged — a numeric knob nested inside an inline object member
 * (`art: { scale: number }`) is a private layout detail, not a public knob.
 */

/** Repo-relative POSIX dir prefixes whose exported public types this rule guards. */
const SURFACE_PREFIXES = ["src/cumulus/components/"];

/** The visual-knob words. A member named exactly one of these, or using one at
 * a capitalized camelCase boundary, is a style knob rather than a data value. */
const KNOB_WORDS = [
  "size",
  "gap",
  "scale",
  "padding",
  "radius",
  "blur",
  "opacity",
];

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/**
 * True when a property name is a visual-knob word: an exact match for a knob
 * word, or a camelCase name beginning or ending at a capitalized knob-word
 * boundary (`sizePx`, `badgeScale`, `pipScale`). Genuine computed measures use
 * the rule's explicit allowlist instead of escaping through their spelling.
 */
export function isKnobName(name) {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }
  if (KNOB_WORDS.includes(name)) {
    return true;
  }
  return KNOB_WORDS.some((word) => {
    const suffix = word.charAt(0).toUpperCase() + word.slice(1);
    return (
      (name.length > word.length &&
        name.startsWith(word) &&
        /[A-Z]/.test(name.charAt(word.length))) ||
      (name.length > suffix.length && name.endsWith(suffix))
    );
  });
}

/** True when a type node is `number` or a union that includes `number`. */
export function isNumberType(typeNode) {
  if (!typeNode) {
    return false;
  }
  if (typeNode.type === "TSNumberKeyword") {
    return true;
  }
  if (typeNode.type === "TSUnionType") {
    return typeNode.types.some(isNumberType);
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban number-typed visual knobs (size/gap/scale/…) on exported Cumulus *Props/*View/*Model types; use an enumerated string variant instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      numericKnob:
        'Prop `{{name}}` on `{{type}}` is a number-typed visual knob — an arbitrary-customization escape hatch. Use an enumerated string variant (e.g. `size?: "sm" | "md"`) that the component maps to its own measure. If this is a genuine production measure with no enumerable form, add `{{type}}.{{name}}` to the rule\'s `allow` option with a comment.',
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!SURFACE_PREFIXES.some((prefix) => fileRelative.startsWith(prefix))) {
      return {};
    }
    // Skip `__*__` fixtures / internal helpers (e.g. __docgen_fixture__.tsx) —
    // they are not the public surface and deliberately exercise shapes the real
    // components must never expose.
    const basename = fileRelative.slice(fileRelative.lastIndexOf("/") + 1);
    if (/^__.*__/.test(basename)) {
      return {};
    }

    const options = context.options?.[0] ?? {};
    const allow = new Set(Array.isArray(options.allow) ? options.allow : []);

    /** A type declaration is a public component surface model or prop shape. */
    function isSurfaceName(name) {
      return typeof name === "string" && /(?:Props|View|Model)$/.test(name);
    }

    /** True when a declaration node is directly exported (`export interface …`). */
    function isExported(node) {
      const parentType = node.parent?.type;
      return (
        parentType === "ExportNamedDeclaration" ||
        parentType === "ExportDefaultDeclaration"
      );
    }

    /** Report any numeric-knob property signatures in a member list. */
    function checkMembers(members, typeName) {
      for (const member of members ?? []) {
        if (member.type !== "TSPropertySignature") {
          continue;
        }
        const key = member.key;
        const keyName =
          key && key.type === "Identifier"
            ? key.name
            : key && key.type === "Literal"
              ? key.value
              : null;
        if (typeof keyName !== "string" || !isKnobName(keyName)) {
          continue;
        }
        if (!isNumberType(member.typeAnnotation?.typeAnnotation)) {
          continue;
        }
        if (allow.has(`${typeName}.${keyName}`)) {
          continue;
        }
        context.report({
          node: member,
          messageId: "numericKnob",
          data: { name: keyName, type: typeName },
        });
      }
    }

    return {
      TSInterfaceDeclaration(node) {
        if (!isSurfaceName(node.id?.name) || !isExported(node)) {
          return;
        }
        checkMembers(node.body?.body, node.id.name);
      },

      TSTypeAliasDeclaration(node) {
        if (!isSurfaceName(node.id?.name) || !isExported(node)) {
          return;
        }
        const t = node.typeAnnotation;
        if (t?.type === "TSTypeLiteral") {
          checkMembers(t.members, node.id.name);
        }
      },
    };
  },
};

export default rule;

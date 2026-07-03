import path from "node:path";

/**
 * Keeps Tango component APIs strict (see commit a7cd8d76 and the "Strict,
 * Controlled APIs" principle in the /tango Design Philosophy).
 *
 * A Tango component exposes only a small, strongly-typed surface — enumerated
 * variants/sizes and named content slots. Props that let a caller bypass the
 * design system with arbitrary, uncontrolled customization are banned. This
 * rule flags the shapes that re-open that escape hatch on a `*Props` type:
 *
 *   1. a `style` or `className` member — appearance is the design system's;
 *      layout is the caller's, expressed by wrapping the component.
 *   2. any member typed `CSSProperties` / `React.CSSProperties` — an arbitrary
 *      inline-style passthrough under a different name (e.g. `discStyle`).
 *   3. `extends` / intersection with a DOM-attribute type (`HTMLAttributes`,
 *      `ButtonHTMLAttributes`, `ComponentPropsWithoutRef`, `JSX.Intrinsic
 *      Elements[...]`, …) — that spreads every HTML attribute back into the API.
 *   4. an index signature (`[k: string]: …`) — accepts arbitrary keys.
 *
 * The rule fires only on TYPE DECLARATIONS whose name ends in `Props`, so it
 * never touches the many internal `const s: CSSProperties = {…}` locals or
 * module-scope style helpers a component uses to build its own fixed
 * appearance. It is scoped to `src/tango/components/` — the styled public
 * component surface. `src/tango/primitives/` is deliberately excluded: a
 * primitive like `Pressable` is a transparent interaction MECHANISM whose whole
 * job is to forward every DOM prop (`...rest`: onClick, aria-*, style, …) onto
 * the element it wraps, so it legitimately extends `HTMLAttributes`. Primitives
 * are instead guarded by `scripts/tango-strict-api.contract.test.mjs`, which
 * asserts on the react-docgen surface (inherited DOM props are filtered out, so
 * only an OWN escape-hatch prop on a primitive would fail).
 *
 * Adding a NEW strict prop (an enumerated variant or a single named data value
 * like an accent color) is always fine; only these arbitrary-customization
 * shapes are banned. Files outside `src/tango/components/` are a no-op.
 */

/** Repo-relative POSIX dir prefix that holds the styled public component APIs. */
const SURFACE_PREFIXES = ["src/tango/components/"];

/** Member names that are an arbitrary-style/appearance passthrough. */
const BANNED_MEMBER_NAMES = new Set(["style", "className"]);

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when a type-reference name is a React DOM-attribute grab-bag. */
export function isDomAttributeTypeName(name) {
  if (typeof name !== "string") {
    return false;
  }
  // *HTMLAttributes (ButtonHTMLAttributes, AnchorHTMLAttributes, …), *HTMLProps,
  // and the ComponentProps* / DetailedHTMLProps / IntrinsicElements families.
  if (/HTMLAttributes$/.test(name) || /HTMLProps$/.test(name)) {
    return true;
  }
  return (
    name === "SVGAttributes" ||
    name === "SVGProps" ||
    name === "DOMAttributes" ||
    name === "AriaAttributes" ||
    name === "AllHTMLAttributes" ||
    name === "ComponentProps" ||
    name === "ComponentPropsWithoutRef" ||
    name === "ComponentPropsWithRef" ||
    name === "DetailedHTMLProps" ||
    name === "IntrinsicElements"
  );
}

/** Rightmost identifier of a TS entity name (`React.CSSProperties` -> "CSSProperties"). */
function entityRightName(entity) {
  if (!entity) {
    return null;
  }
  if (entity.type === "Identifier") {
    return entity.name;
  }
  // Type position: `React.CSSProperties` -> TSQualifiedName.
  if (entity.type === "TSQualifiedName") {
    return entity.right.name;
  }
  // Interface-heritage expression position: `React.HTMLAttributes` -> a
  // MemberExpression whose `.property` is the rightmost identifier.
  if (entity.type === "MemberExpression" && entity.property?.type === "Identifier") {
    return entity.property.name;
  }
  return null;
}

/** True when a type node ultimately references `CSSProperties`. */
function isCssPropertiesType(typeNode) {
  if (!typeNode) {
    return false;
  }
  if (typeNode.type === "TSTypeReference") {
    return entityRightName(typeNode.typeName) === "CSSProperties";
  }
  // `CSSProperties | undefined`, `Partial<CSSProperties>`, etc.
  if (typeNode.type === "TSUnionType") {
    return typeNode.types.some(isCssPropertiesType);
  }
  if (typeNode.type === "TSTypeReference" && typeNode.typeParameters) {
    return typeNode.typeParameters.params.some(isCssPropertiesType);
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep Tango component *Props APIs strict: no style/className/CSSProperties passthrough, no DOM-attribute extension, no index signatures.",
    },
    schema: [],
    messages: {
      styleMember:
        "Tango components don't take a `{{name}}` prop — that re-opens the arbitrary-customization escape hatch. Appearance is the design system's; wrap the component in your own element for layout.",
      cssPropertiesMember:
        "Prop `{{name}}` is typed CSSProperties — an arbitrary inline-style passthrough. Expose a strict prop instead (an enumerated variant/role, or a single named data value like an accent color), or move the styling inside the component.",
      domAttributesHeritage:
        "A Tango *Props type must not extend or intersect the DOM-attribute type `{{type}}` — that spreads every HTML attribute back into the API. Enumerate the exact props you support.",
      indexSignature:
        "An index signature lets a Tango *Props type accept arbitrary keys. List the exact props instead.",
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
    // Skip `__*__` fixtures / internal helpers (e.g. __docgen_fixture__.tsx),
    // matching generate-tango-metadata.mjs — they are not the public surface and
    // deliberately exercise shapes the real components must never expose.
    const basename = fileRelative.slice(fileRelative.lastIndexOf("/") + 1);
    if (/^__.*__/.test(basename)) {
      return {};
    }

    /** A type declaration is part of a public API surface when its name ends in `Props`. */
    function isPropsName(name) {
      return typeof name === "string" && /Props$/.test(name);
    }

    /** Report banned property signatures / index signatures in a member list. */
    function checkMembers(members) {
      for (const member of members ?? []) {
        if (member.type === "TSIndexSignature") {
          context.report({ node: member, messageId: "indexSignature" });
          continue;
        }
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
        if (typeof keyName === "string" && BANNED_MEMBER_NAMES.has(keyName)) {
          context.report({
            node: member,
            messageId: "styleMember",
            data: { name: keyName },
          });
          continue;
        }
        if (isCssPropertiesType(member.typeAnnotation?.typeAnnotation)) {
          context.report({
            node: member,
            messageId: "cssPropertiesMember",
            data: { name: typeof keyName === "string" ? keyName : "?" },
          });
        }
      }
    }

    /** Report a type reference used as heritage/intersection when it's a DOM grab-bag. */
    function checkHeritageTypeRef(typeNode) {
      if (!typeNode) {
        return;
      }
      // `React.HTMLAttributes<…>` heritage.
      if (typeNode.type === "TSTypeReference") {
        const name = entityRightName(typeNode.typeName);
        if (isDomAttributeTypeName(name)) {
          context.report({
            node: typeNode,
            messageId: "domAttributesHeritage",
            data: { type: name },
          });
        }
        return;
      }
      // `JSX.IntrinsicElements["button"]` heritage.
      if (
        typeNode.type === "TSIndexedAccessType" &&
        typeNode.objectType?.type === "TSTypeReference" &&
        entityRightName(typeNode.objectType.typeName) === "IntrinsicElements"
      ) {
        context.report({
          node: typeNode,
          messageId: "domAttributesHeritage",
          data: { type: "JSX.IntrinsicElements" },
        });
      }
    }

    return {
      TSInterfaceDeclaration(node) {
        if (!isPropsName(node.id?.name)) {
          return;
        }
        for (const heritage of node.extends ?? []) {
          // An interface `extends` clause: `expression` is the type name,
          // heritage may also surface as `TSInterfaceHeritage`/`TSTypeReference`.
          const expr = heritage.expression ?? heritage;
          const name = entityRightName(
            expr.type === "TSTypeReference" ? expr.typeName : expr,
          );
          if (isDomAttributeTypeName(name)) {
            context.report({
              node: heritage,
              messageId: "domAttributesHeritage",
              data: { type: name },
            });
          }
        }
        checkMembers(node.body?.body);
      },

      TSTypeAliasDeclaration(node) {
        if (!isPropsName(node.id?.name)) {
          return;
        }
        const t = node.typeAnnotation;
        if (!t) {
          return;
        }
        if (t.type === "TSTypeLiteral") {
          checkMembers(t.members);
          return;
        }
        if (t.type === "TSIntersectionType") {
          for (const part of t.types) {
            if (part.type === "TSTypeLiteral") {
              checkMembers(part.members);
            } else {
              checkHeritageTypeRef(part);
            }
          }
          return;
        }
        // `type FooProps = React.HTMLAttributes<…>` — a bare grab-bag alias.
        checkHeritageTypeRef(t);
      },
    };
  },
};

export default rule;

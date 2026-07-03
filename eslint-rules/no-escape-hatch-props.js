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
 *   5. a `children` member — an open slot for arbitrary caller markup.
 *   6. any member typed with a React-node family type (`ReactNode`,
 *      `ReactElement`, `ReactChild`, `JSX.Element`, and their unions/arrays) —
 *      a raw node content slot (e.g. `value: ReactNode`, `card: ReactNode`).
 *
 * Cases 5 and 6 are the exception to "every escape hatch is banned": a small
 * allowlist of CONTAINER components — a card / pressable / panel wrapper whose
 * whole job is to hold and frame caller-supplied content — legitimately take
 * `children` and node slots. That allowlist is `CONTAINER_PROPS_TYPES` below,
 * keyed by the exact `*Props` type name. Every other component must render its
 * copy from strict, typed props (a `string` it resolves before display, a
 * `RichText` model, an enumerated variant) rather than swallowing a node. A
 * function-typed prop that RETURNS a node (a render prop, `(ctx) => ReactNode`)
 * is not a raw node slot and is never flagged. Cases 1–4 are banned even on a
 * container (a wrapper still owns its own appearance).
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

/**
 * `*Props` type names for the CONTAINER components — a card / pressable / panel
 * wrapper — that are allowed to take `children` and raw node slots because their
 * whole job is to hold and frame caller-supplied content. Everything else must
 * render its copy from strict, typed props. Keyed by the exact type name so a
 * file that declares both a container and a leaf `*Props` (e.g. InfoCard.tsx,
 * which owns both the leaf `InfoCardProps` and the wrapper `PressPopoverProps` /
 * `PressInfoProps`) is judged per-declaration. Add a NEW entry only for a
 * genuine wrapper — the point is to force that to be a deliberate decision.
 * `src/tango/primitives/` (e.g. `Pressable`) is out of this rule's scope
 * entirely; primitives are transparent DOM-forwarding mechanisms and are guarded
 * by scripts/tango-strict-api.contract.test.mjs instead.
 */
const CONTAINER_PROPS_TYPES = new Set([
  "GroupPanelProps",
  "HoverPopoverProps",
  "HoverZoomCardProps",
  "PressPopoverProps",
  "PressInfoProps",
]);

/** True when a bare type-reference name is a React-node family type. */
function isReactNodeTypeName(name) {
  return (
    name === "ReactNode" ||
    name === "ReactElement" ||
    name === "ReactChild" ||
    name === "ReactChildren" ||
    name === "ReactNodeArray" ||
    name === "ReactPortal"
  );
}

/**
 * True when a member's OWN type is a raw React-node content slot — a node
 * family type, or a union / array whose members are. Does NOT descend into
 * function types, so a render prop (`(ctx) => ReactNode`) is not flagged.
 */
export function isReactNodeType(typeNode) {
  if (!typeNode) {
    return false;
  }
  if (typeNode.type === "TSTypeReference") {
    const tn = typeNode.typeName;
    // `JSX.Element` — a TSQualifiedName with a `JSX` namespace.
    if (
      tn?.type === "TSQualifiedName" &&
      tn.left?.type === "Identifier" &&
      tn.left.name === "JSX" &&
      tn.right?.name === "Element"
    ) {
      return true;
    }
    // `ReactNode`, `React.ReactNode`, `ReactElement`, …
    return isReactNodeTypeName(entityRightName(tn));
  }
  // `ReactNode | undefined`, `ReactNode | ((ctx) => ReactNode)`, …
  if (typeNode.type === "TSUnionType") {
    return typeNode.types.some(isReactNodeType);
  }
  // `ReactNode[]`.
  if (typeNode.type === "TSArrayType") {
    return isReactNodeType(typeNode.elementType);
  }
  return false;
}

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
      childrenProp:
        "Only container components (a card / pressable / panel wrapper) may take `children`. `{{type}}` isn't in the container allowlist — render its content from strict, typed props (a resolved string, a RichText model, an enumerated variant), or add `{{type}}` to CONTAINER_PROPS_TYPES if it really is a wrapper.",
      reactNodeProp:
        "Prop `{{name}}` on `{{type}}` is a raw ReactNode content slot — an arbitrary-markup escape hatch. Take a strict model instead (a string you resolve before display, a RichText model, or an enumerated variant). Only container components in the allowlist may hold caller nodes.",
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

    /**
     * Report banned property signatures / index signatures in a member list.
     * `propsName` is the enclosing `*Props` type name; when it names a container
     * in CONTAINER_PROPS_TYPES the `children` / raw-node-slot bans are lifted
     * (the style/CSS bans are not — a wrapper still owns its own appearance).
     */
    function checkMembers(members, propsName) {
      const isContainer = CONTAINER_PROPS_TYPES.has(propsName);
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
          continue;
        }
        if (isContainer) {
          // A whitelisted wrapper may hold `children` and node slots.
          continue;
        }
        if (keyName === "children") {
          context.report({
            node: member,
            messageId: "childrenProp",
            data: { type: propsName },
          });
          continue;
        }
        if (isReactNodeType(member.typeAnnotation?.typeAnnotation)) {
          context.report({
            node: member,
            messageId: "reactNodeProp",
            data: { name: typeof keyName === "string" ? keyName : "?", type: propsName },
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
        checkMembers(node.body?.body, node.id.name);
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
          checkMembers(t.members, node.id.name);
          return;
        }
        if (t.type === "TSIntersectionType") {
          for (const part of t.types) {
            if (part.type === "TSTypeLiteral") {
              checkMembers(part.members, node.id.name);
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

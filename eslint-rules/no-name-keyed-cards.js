/**
 * Bans using card and Avatar display names as identity.
 *
 * Card and Avatar names are display text and are not unique. Code may resolve
 * a name right before rendering, but Maps, Sets, object indexes, membership
 * checks, and equality comparisons must use the UUID instead, including
 * comparisons of a case-folded or trimmed name such as
 * `avatar.name.toLowerCase() === other`.
 *
 * The rule follows a name through `const` locals in scope: an alias such as
 * `const name = card.name`, a destructured `const { name } = avatar` (also
 * nested, `const { card: { name } } = offer`, and in `for...of` over
 * card-like collections), and chains of such aliases.
 */

const MAP_KEY_METHODS = new Set(["get", "has", "set", "delete"]);
const SET_KEY_METHODS = new Set(["add", "has", "delete"]);
const EQUALITY_OPERATORS = new Set(["===", "!==", "==", "!="]);
const NAME_NORMALIZING_METHODS = new Set([
  "toLowerCase",
  "toLocaleLowerCase",
  "toUpperCase",
  "toLocaleUpperCase",
  "trim",
  "normalize",
]);
const TRANSPARENT_WRAPPERS = new Set([
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
]);
const MAX_ALIAS_DEPTH = 8;

/** Strips optional-chain and type-only wrappers that do not change a value. */
function unwrapExpression(node) {
  let current = node;
  while (current != null && TRANSPARENT_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}

function identifierName(node) {
  return node?.type === "Identifier" ? node.name : null;
}

function isCardishIdentifier(name) {
  return typeof name === "string" && /card|avatar/i.test(name);
}

function isCardNameIdentifier(name) {
  return typeof name === "string" && /cardName|avatarName/i.test(name);
}

function containsCardishReference(maybeWrapped) {
  const node = unwrapExpression(maybeWrapped);
  if (node?.type === "Identifier") {
    return isCardishIdentifier(node.name);
  }
  if (node?.type === "MemberExpression") {
    return (
      containsCardishReference(node.object) ||
      (!node.computed && isCardishIdentifier(identifierName(node.property)))
    );
  }
  return false;
}

/**
 * True for `card.name`, `offer.card.name`, `cardName`, `avatar.name`, etc.,
 * and for any of them case-folded or trimmed (`avatar.name.toLowerCase()`).
 *
 * `isCardNameAlias`, when given, decides whether any other identifier is a
 * local alias of a card name; without it only the identifier's spelling
 * counts.
 */
export function isCardNameExpression(
  maybeWrapped,
  isCardNameAlias = () => false,
) {
  const node = unwrapExpression(maybeWrapped);
  if (
    node?.type === "CallExpression" &&
    NAME_NORMALIZING_METHODS.has(staticMethodName(node.callee))
  ) {
    return isCardNameExpression(node.callee.object, isCardNameAlias);
  }
  if (node?.type === "Identifier") {
    return isCardNameIdentifier(node.name) || isCardNameAlias(node);
  }
  if (node?.type !== "MemberExpression") {
    return false;
  }
  if (node.computed) {
    return false;
  }
  if (identifierName(node.property) !== "name") {
    return false;
  }
  return containsCardishReference(node.object);
}

function findVariable(sourceCode, identifier) {
  for (
    let scope = sourceCode.getScope(identifier);
    scope != null;
    scope = scope.upper
  ) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return null;
}

/**
 * The value a `const` declarator binds: its initializer, or for
 * `for (const x of items)` the iterated collection.
 */
function declaratorSource(declarator) {
  if (declarator.init != null) {
    return declarator.init;
  }
  const declaration = declarator.parent;
  const loop = declaration?.parent;
  if (loop?.type === "ForOfStatement" && loop.left === declaration) {
    return loop.right;
  }
  return null;
}

/** Skips a destructuring default, `{ name = "" }`, up to the bound pattern. */
function patternSlot(node) {
  return node.parent?.type === "AssignmentPattern" && node.parent.left === node
    ? node.parent
    : node;
}

/**
 * True when an object pattern destructures a card-like value: the pattern of
 * `const {...} = card`, of `for (const {...} of cards)`, or nested under a
 * card-like key as in `const { card: {...} } = offer`.
 */
function destructuresCardishValue(pattern) {
  const slot = patternSlot(pattern);
  const parent = slot.parent;
  if (parent?.type === "VariableDeclarator" && parent.id === slot) {
    return containsCardishReference(declaratorSource(parent));
  }
  if (
    parent?.type === "Property" &&
    parent.value === slot &&
    !parent.computed &&
    parent.parent?.type === "ObjectPattern"
  ) {
    return (
      isCardishIdentifier(identifierName(parent.key)) ||
      destructuresCardishValue(parent.parent)
    );
  }
  return false;
}

/** True for the `name` binding of `{ name }` or `{ name: label }`. */
function isDestructuredCardName(binding) {
  const property = patternSlot(binding).parent;
  return (
    property?.type === "Property" &&
    property.value === patternSlot(binding) &&
    !property.computed &&
    identifierName(property.key) === "name" &&
    property.parent?.type === "ObjectPattern" &&
    destructuresCardishValue(property.parent)
  );
}

/** True for `null` and `undefined`, whose comparisons are presence checks. */
function isNullish(node) {
  return (
    (node?.type === "Literal" && node.value === null) ||
    (node?.type === "Identifier" && node.name === "undefined")
  );
}

function staticMethodName(callee) {
  if (callee?.type !== "MemberExpression" || callee.computed) {
    return null;
  }
  return identifierName(callee.property);
}

function isNewNamed(node, name) {
  return node?.type === "NewExpression" && identifierName(node.callee) === name;
}

function arrayMapCallbackReturn(node) {
  if (node?.type !== "CallExpression") {
    return null;
  }
  if (staticMethodName(node.callee) !== "map") {
    return null;
  }
  const callback = node.arguments[0];
  if (
    callback?.type === "ArrowFunctionExpression" ||
    callback?.type === "FunctionExpression"
  ) {
    return callback.body;
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban Map/Set/object lookup identity and equality comparisons keyed by card or Avatar display names.",
    },
    schema: [],
    messages: {
      nameKey:
        "Card and Avatar display names are not stable identity. Key this lookup by UUID/id and resolve the name only for display.",
      nameEquality:
        "Card and Avatar display names are not unique. Compare UUIDs/ids and resolve the name only for display.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    function isCardNameAlias(identifier, depth = 0) {
      if (depth >= MAX_ALIAS_DEPTH) {
        return false;
      }
      const variable = findVariable(sourceCode, identifier);
      const definition =
        variable?.defs.length === 1 ? variable.defs[0] : undefined;
      if (
        definition?.type !== "Variable" ||
        definition.parent?.kind !== "const"
      ) {
        return false;
      }
      if (definition.node.id === definition.name) {
        // Only the initializer: `for (const x of cardNames)` binds an
        // element, not the collection.
        return isCardNameExpression(definition.node.init, (next) =>
          isCardNameAlias(next, depth + 1),
        );
      }
      return isDestructuredCardName(definition.name);
    }

    function isName(node) {
      return isCardNameExpression(node, isCardNameAlias);
    }

    function reportIfCardName(node) {
      if (isName(node)) {
        context.report({ node, messageId: "nameKey" });
        return true;
      }
      return false;
    }

    function reportMapEntryKey(node) {
      const key = node?.type === "ArrayExpression" ? node.elements[0] : null;
      if (key !== null) {
        reportIfCardName(key);
      }
    }

    return {
      BinaryExpression(node) {
        if (
          EQUALITY_OPERATORS.has(node.operator) &&
          !isNullish(node.left) &&
          !isNullish(node.right) &&
          (isName(node.left) || isName(node.right))
        ) {
          context.report({ node, messageId: "nameEquality" });
        }
      },

      CallExpression(node) {
        const method = staticMethodName(node.callee);
        if (
          (MAP_KEY_METHODS.has(method) || SET_KEY_METHODS.has(method)) &&
          node.arguments.length > 0
        ) {
          reportIfCardName(node.arguments[0]);
        }
      },

      MemberExpression(node) {
        if (node.computed) {
          reportIfCardName(node.property);
        }
      },

      NewExpression(node) {
        if (isNewNamed(node, "Set")) {
          const firstArg = node.arguments[0];
          const mapped = arrayMapCallbackReturn(firstArg);
          if (mapped !== null) {
            reportIfCardName(mapped);
          }
          return;
        }

        if (isNewNamed(node, "Map")) {
          const firstArg = node.arguments[0];
          if (firstArg?.type === "ArrayExpression") {
            for (const element of firstArg.elements) {
              reportMapEntryKey(element);
            }
          }
          const mapped = arrayMapCallbackReturn(firstArg);
          if (mapped?.type === "ArrayExpression") {
            reportMapEntryKey(mapped);
          }
        }
      },
    };
  },
};

export default rule;

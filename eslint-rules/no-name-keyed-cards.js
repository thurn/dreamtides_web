/**
 * Bans using card and Avatar display names as identity.
 *
 * Card and Avatar names are display text and are not unique. Code may resolve
 * a name right before rendering, but Maps, Sets, object indexes, membership
 * checks, and equality comparisons must use the UUID instead, including
 * comparisons of a case-folded or trimmed name such as
 * `avatar.name.toLowerCase() === other`.
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

function identifierName(node) {
  return node?.type === "Identifier" ? node.name : null;
}

function isCardishIdentifier(name) {
  return typeof name === "string" && /card|avatar/i.test(name);
}

function isCardNameIdentifier(name) {
  return typeof name === "string" && /cardName|avatarName/i.test(name);
}

function containsCardishReference(node) {
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
 */
export function isCardNameExpression(node) {
  if (
    node?.type === "CallExpression" &&
    NAME_NORMALIZING_METHODS.has(staticMethodName(node.callee))
  ) {
    return isCardNameExpression(node.callee.object);
  }
  if (node?.type === "Identifier") {
    return isCardNameIdentifier(node.name);
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
    function reportIfCardName(node) {
      if (isCardNameExpression(node)) {
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
          (isCardNameExpression(node.left) || isCardNameExpression(node.right))
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

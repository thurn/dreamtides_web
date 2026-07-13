import path from "node:path";

/**
 * Bans using card display names as lookup identity in Cumulus product surfaces.
 *
 * Card names are display text and are not unique. A migrated Cumulus screen may
 * resolve a card name right before rendering, but Maps, Sets, object indexes,
 * and membership checks must be keyed by UUID/card id instead.
 */

const TARGET_PREFIXES = ["src/cumulus/screens/", "src/screens/cumulus_adapters/"];
const MAP_KEY_METHODS = new Set(["get", "has", "set", "delete"]);
const SET_KEY_METHODS = new Set(["add", "has", "delete"]);

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

function identifierName(node) {
  return node?.type === "Identifier" ? node.name : null;
}

function isCardishIdentifier(name) {
  return typeof name === "string" && /card/i.test(name);
}

function isCardNameIdentifier(name) {
  return typeof name === "string" && /cardName/i.test(name);
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

/** True for `card.name`, `offer.card.name`, `cardName`, etc. */
export function isCardNameExpression(node) {
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
        "Ban Map/Set/object lookup identity keyed by card display names in Cumulus product UI.",
    },
    schema: [],
    messages: {
      nameKey:
        "Card display names are not stable identity. Key this lookup by card UUID/id and resolve the name only for display.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!TARGET_PREFIXES.some((prefix) => fileRelative.startsWith(prefix))) {
      return {};
    }

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

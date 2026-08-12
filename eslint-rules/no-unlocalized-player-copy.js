import {
  isPlayerLocalizationFile,
  toRepoRelativePosix,
} from "./ui-boundary-roles.js";

const COPY_PROPERTIES = new Set([
  "label",
  "title",
  "subtitle",
  "message",
  "description",
  "detail",
  "placeholder",
  "alt",
  "emptyLabel",
  "busyLabel",
  "effectText",
  "headline",
  "aria-label",
  "ariaLabel",
  "closeLabel",
  "commitLabel",
  "supportingText",
]);

function isHumanText(value) {
  return /\p{L}/u.test(value) && !/^https?:\/\//u.test(value);
}

function staticText(node) {
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node?.type === "TemplateLiteral") {
    return node.quasis.map((quasi) => quasi.value.raw).join("…");
  }
  return null;
}

function propertyName(node) {
  if (node?.type !== "Property") return null;
  if (node.computed) return null;
  if (node.key.type === "Identifier") return node.key.name;
  if (node.key.type === "Literal" && typeof node.key.value === "string") {
    return node.key.value;
  }
  return null;
}

function hasLocalizationSuppression(node, sourceCode) {
  const related = [];
  const allComments = sourceCode.getAllComments();
  let current = node;
  while (current !== undefined && current !== null) {
    related.push(
      ...sourceCode.getCommentsBefore(current),
      ...sourceCode.getCommentsAfter(current),
    );
    if (current.range !== undefined) {
      related.push(
        ...allComments.filter(
          (comment) =>
            comment.range[0] >= current.range[0] &&
            comment.range[1] <= current.range[1],
        ),
      );
    }
    current = current.parent;
  }
  return related.some((comment) => /localization-ignore:\s*\S/u.test(comment.value));
}

function isLocalizationCall(node) {
  let current = node.parent;
  while (current !== undefined && current !== null) {
    if (
      current.type === "CallExpression" &&
      ((current.callee.type === "Identifier" &&
        (current.callee.name === "tx" || current.callee.name === "txa")))
    ) {
      return true;
    }
    if (
      current.type === "JSXAttribute" ||
      current.type === "Property" ||
      current.type === "VariableDeclarator"
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function isLocalizedExpression(node) {
  if (node?.type === "CallExpression") {
    return (
      node.callee.type === "Identifier" &&
      (node.callee.name === "tx" || node.callee.name === "txa")
    );
  }
  if (node?.type === "ConditionalExpression") {
    return isLocalizedExpression(node.consequent) && isLocalizedExpression(node.alternate);
  }
  return false;
}

function copyProperty(node) {
  const name = propertyName(node);
  return name !== null && COPY_PROPERTIES.has(name);
}

function copyJsxAttribute(node) {
  const name = node.name;
  return (
    name.type === "JSXIdentifier" &&
    (COPY_PROPERTIES.has(name.name) ||
      name.name === "aria-label" ||
      name.name === "ariaLabel")
  );
}

function isCopyBearingNode(node) {
  if (node.type === "JSXText") return true;
  if (node.type === "JSXAttribute") return copyJsxAttribute(node);
  if (node.type === "Literal" && node.parent?.type === "Property" && node.parent.key === node) {
    return false;
  }
  if (node.type === "Property") return copyProperty(node);
  if (node.parent?.type === "Property") return copyProperty(node.parent);
  if (node.parent?.type === "JSXExpressionContainer") {
    return node.parent.parent?.type === "JSXElement";
  }
  return false;
}

function reportTarget(node) {
  if (node.type === "BinaryExpression" || node.type === "ConditionalExpression") {
    return node;
  }
  return node;
}

function isCopyBearingExpression(node) {
  const parent = node.parent;
  if (parent?.type === "Property") {
    return copyProperty(parent) &&
      (node.type !== "ConditionalExpression" || isTextExpression(node));
  }
  if (parent?.type !== "JSXExpressionContainer") return false;
  const owner = parent.parent;
  if (owner?.type === "JSXAttribute") {
    return copyJsxAttribute(owner) &&
      (node.type !== "ConditionalExpression" || isTextExpression(node));
  }
  if (owner?.type !== "JSXElement") return false;
  if (node.type === "ConditionalExpression") {
    return isTextExpression(node.consequent) && isTextExpression(node.alternate);
  }
  return true;
}

function isTextExpression(node) {
  if (node?.type === "Literal") return typeof node.value === "string";
  if (node?.type === "TemplateLiteral") return true;
  if (node?.type === "BinaryExpression") {
    return node.operator === "+" && isTextExpression(node.left) && isTextExpression(node.right);
  }
  if (node?.type === "ConditionalExpression") {
    return isTextExpression(node.consequent) && isTextExpression(node.alternate);
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require player-facing runtime copy to cross the Trox localization boundary.",
    },
    schema: [],
    messages: {
      unlocalized:
        "Player-facing copy must be a Trox message; preserve authored data and add a localization-ignore reason for an intentional developer-only value.",
    },
  },

  create(context) {
    const filename = context.getFilename();
    const cwd = context.cwd ?? process.cwd();
    const fileRelative = toRepoRelativePosix(filename, cwd);
    if (!isPlayerLocalizationFile(fileRelative)) return {};
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const seen = new WeakSet();
    const inspect = (node) => {
      if (seen.has(node) || hasLocalizationSuppression(node, sourceCode)) return;
      seen.add(node);
      if (isLocalizationCall(node)) return;
      const text = staticText(node);
      if (text !== null && isHumanText(text)) {
        if (isCopyBearingNode(node)) {
          context.report({ node: reportTarget(node), messageId: "unlocalized" });
        }
        return;
      }
      if (node.type === "JSXText" && isHumanText(node.value.trim())) {
        context.report({ node, messageId: "unlocalized" });
      }
    };

    return {
      Literal: inspect,
      TemplateLiteral: inspect,
      JSXText: inspect,
      JSXAttribute(node) {
        if (!copyJsxAttribute(node) || node.value === null) return;
        const text = staticText(node.value);
        if (text !== null && isHumanText(text) && !hasLocalizationSuppression(node, sourceCode)) {
          context.report({ node, messageId: "unlocalized" });
        }
        if (node.value.type === "JSXExpressionContainer") {
          const expressionText = staticText(node.value.expression);
          if (
            expressionText !== null &&
            isHumanText(expressionText) &&
            !hasLocalizationSuppression(node, sourceCode)
          ) {
            context.report({ node, messageId: "unlocalized" });
          }
        }
      },
      BinaryExpression(node) {
      if (
        (node.operator === "+" || node.operator === "??") &&
          isCopyBearingExpression(node) &&
          !isLocalizedExpression(node) &&
          !hasLocalizationSuppression(node, sourceCode)
        ) {
          context.report({ node, messageId: "unlocalized" });
        }
      },
      ConditionalExpression(node) {
        if (
          isCopyBearingExpression(node) &&
          !isLocalizedExpression(node) &&
          !hasLocalizationSuppression(node, sourceCode)
        ) {
          context.report({ node, messageId: "unlocalized" });
        }
      },
    };
  },
};

export { COPY_PROPERTIES };
export default rule;

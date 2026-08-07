import path from "node:path";

const EXCLUDED_PREFIXES = [
  "src/cumulus/docs/",
  "src/cumulus/screens/devtools/",
];

const EXCLUDED_FILES = new Set([
  "src/cumulus/screens/JourneyDebugEditorScreen.tsx",
  "src/cumulus/screens/TutorialEditorRail.tsx",
]);

/** Convert an ESLint filename to a repository-relative POSIX path. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** Player presentation and its pure view-model builders. */
export function isCountCopyScope(fileRelative) {
  if (EXCLUDED_FILES.has(fileRelative)) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => fileRelative.startsWith(prefix))) {
    return false;
  }
  return (
    fileRelative.startsWith("src/cumulus/components/") ||
    fileRelative.startsWith("src/cumulus/screens/") ||
    fileRelative.startsWith("src/screens/cumulus_adapters/")
  );
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

function isPluralPair(left, right) {
  const normalizedLeft = left.toLocaleLowerCase();
  const normalizedRight = right.toLocaleLowerCase();
  return (
    normalizedLeft === `${normalizedRight}s` ||
    normalizedRight === `${normalizedLeft}s` ||
    normalizedLeft === `${normalizedRight}es` ||
    normalizedRight === `${normalizedLeft}es` ||
    (/[^aeiou]y$/u.test(normalizedLeft) &&
      normalizedRight === `${normalizedLeft.slice(0, -1)}ies`) ||
    (/[^aeiou]y$/u.test(normalizedRight) &&
      normalizedLeft === `${normalizedRight.slice(0, -1)}ies`) ||
    (normalizedLeft === "" && normalizedRight === "s") ||
    (normalizedRight === "" && normalizedLeft === "s")
  );
}

function looksLikeCssValue(text) {
  return /(?:\b(?:calc|min|max|clamp|var)\(|\d(?:px|vw|vh|rem|em|%))/u.test(text);
}

/** True when a count test selects text that reads as player-facing English. */
export function isManualCountCopy(node, sourceCode) {
  if (node?.type !== "ConditionalExpression") return false;
  const test = sourceCode.getText(node.test);
  if (
    !/(?:\bcount\b|\blength\b|copies|turnNumber|storedTime)/u.test(test) ||
    !/(?:===|!==)\s*1\b/u.test(test)
  ) {
    return false;
  }
  const consequent = staticText(node.consequent);
  const alternate = staticText(node.alternate);
  if (consequent === null && alternate === null) return false;
  if (consequent !== null && alternate !== null && isPluralPair(consequent, alternate)) {
    return true;
  }
  return [consequent, alternate].some(
    (text) =>
      text !== null &&
      !looksLikeCssValue(text) &&
      /\p{L}.*\s|\s.*\p{L}/u.test(text),
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require complete Fluent messages for count-dependent player copy.",
    },
    schema: [],
    messages: {
      manualCountCopy:
        "Count-dependent player copy must be a complete Fluent message with a numeric selector; pass the count as semantic data.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);
    if (!isCountCopyScope(fileRelative)) return {};
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      ConditionalExpression(node) {
        if (isManualCountCopy(node, sourceCode)) {
          context.report({ node, messageId: "manualCountCopy" });
        }
      },
    };
  },
};

export default rule;

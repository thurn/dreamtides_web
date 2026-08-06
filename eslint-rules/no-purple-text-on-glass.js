import path from "node:path";

/**
 * Bans purple/accent/resource text colors inside Cumulus files that import the
 * shared blurred-glass material recipes.
 *
 * The glass surface samples whatever scene art sits behind it, so purple text
 * fails on bright painterly backdrops. Glass text must resolve through
 * --text-on-glass / --text-on-glass-muted (or another high-contrast text token),
 * never the accent or essence roles.
 */

const GLASS_RECIPE_IMPORTS = new Set([
  "glassSurfaceStyle",
  "glassTrack",
  "glassIconButtonChrome",
]);

const BANNED_TEXT_TOKENS = new Set([
  "--accent",
  "--accent-bright",
  "--accent-strong",
  "--essence",
]);

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule can govern the given repo-relative POSIX path. */
export function isGovernedFile(fileRelative) {
  if (!fileRelative.startsWith("src/cumulus/")) {
    return false;
  }
  if (/\.(test|spec)\./.test(fileRelative)) {
    return false;
  }
  if (fileRelative.startsWith("src/cumulus/docs/")) {
    return false;
  }
  return !fileRelative.startsWith("src/cumulus/primitives/");
}

function propertyName(node) {
  const key = node.key;
  if (key.type === "Identifier") {
    return key.name;
  }
  if (key.type === "Literal" && typeof key.value === "string") {
    return key.value;
  }
  return null;
}

function tokenArgument(node) {
  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "Identifier" ||
    node.callee.name !== "token" ||
    node.arguments.length === 0
  ) {
    return null;
  }
  const first = node.arguments[0];
  if (first.type !== "Literal" || typeof first.value !== "string") {
    return null;
  }
  return first.value;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban accent and essence text tokens in Cumulus files that use blurred glass recipes; use --text-on-glass instead.",
    },
    schema: [],
    messages: {
      purpleTextOnGlass:
        "{{token}} is a purple/resource text color in a blurred-glass file. Text on glass must use --text-on-glass / --text-on-glass-muted or another high-contrast text token.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!isGovernedFile(fileRelative)) {
      return {};
    }

    let importsGlassRecipe = false;

    return {
      ImportSpecifier(node) {
        if (GLASS_RECIPE_IMPORTS.has(node.imported.name)) {
          importsGlassRecipe = true;
        }
      },
      Property(node) {
        if (!importsGlassRecipe || propertyName(node) !== "color") {
          return;
        }
        const tokenName = tokenArgument(node.value);
        if (tokenName !== null && BANNED_TEXT_TOKENS.has(tokenName)) {
          context.report({
            node: node.value,
            messageId: "purpleTextOnGlass",
            data: { token: tokenName },
          });
        }
      },
    };
  },
};

export default rule;

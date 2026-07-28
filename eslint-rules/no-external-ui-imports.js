import path from "node:path";

/**
 * Enforces Cumulus's isolation boundary. `src/cumulus/**` is the self-contained home
 * of the shared UI library, so code under it may import ONLY:
 *   - other code under `src/cumulus/`,
 *   - bare `node_modules` packages (specifiers that do not start with `.`),
 *   - an explicit allowlist of non-UI infrastructure (see {@link ALLOWED_PREFIXES}
 *     and {@link ALLOWED_FILES}).
 *
 * Any other import target under the repo (e.g. `src/components/`, `src/screens/`,
 * `src/atlas/`) is denied. The rule is FAIL-CLOSED: anything not explicitly
 * allowed is an error, so a future UI directory can never silently leak in.
 *
 * Files outside `src/cumulus/` are unaffected (the rule is a no-op there).
 */

/**
 * Repo-relative POSIX directory prefixes Cumulus may import from. Easy to extend:
 * add another `"src/<dir>/"` entry here.
 */
const ALLOWED_PREFIXES = [
  "src/cumulus/",
  "src/data/",
  "src/types/",
  "src/runtime/",
];

/**
 * Repo-relative POSIX file paths Cumulus may import, ignoring any extension. To
 * extend: add the EXTENSIONLESS repo-relative path (e.g. `"src/logging"`, NOT
 * `"src/logging.ts"`). Matched exactly (not as a prefix). The single non-UI
 * infrastructure file allowed is `src/logging.ts`.
 */
const ALLOWED_FILES = ["src/logging"];

/** Strip a trailing recognized module extension so `foo.ts`/`foo.tsx`/... == `foo`. */
function stripExtension(relativePath) {
  return relativePath.replace(/\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, "");
}

/**
 * Convert an OS file path to a repo-relative POSIX path, using ESLint's project
 * root (`cwd`) as the base. Pure and exported so it can be unit-tested directly.
 *
 * Deriving the root from `cwd` (rather than a substring heuristic like
 * `indexOf("/src/")`) is critical: a checkout under a path that itself contains
 * a `src` segment (e.g. `~/src/journey_prototype`) would otherwise resolve to the
 * wrong `src/` and silently disable this fail-closed rule.
 */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True if a resolved repo-relative POSIX path is permitted for a Cumulus file. */
function isAllowed(resolvedRelative) {
  if (ALLOWED_PREFIXES.some((prefix) => resolvedRelative.startsWith(prefix))) {
    return true;
  }
  const withoutExtension = stripExtension(resolvedRelative);
  return ALLOWED_FILES.includes(withoutExtension);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce Cumulus's isolation boundary: src/cumulus may import only from itself, bare modules, and the infrastructure allowlist.",
    },
    schema: [],
    messages: {
      externalImport:
        "Cumulus may not import '{{source}}' (resolves to '{{resolved}}'). src/cumulus/** may only import from itself, bare node_modules packages, or the allowlist (src/data/, src/types/, src/runtime/, src/logging.ts).",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    // In flat config ESLint runs from the repo root and exposes it as
    // `context.cwd`; fall back to `process.cwd()` for older ESLint.
    const cwd =
      typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    // Only act on files under src/cumulus/. Elsewhere the rule is inert.
    if (!fileRelative.startsWith("src/cumulus/")) {
      return {};
    }

    const fileDir = path.posix.dirname(fileRelative);

    function checkSource(node) {
      if (node === null || node === undefined || typeof node.value !== "string") {
        return;
      }
      const source = node.value;

      // Bare modules (node_modules packages) are always allowed.
      if (!source.startsWith(".")) {
        return;
      }

      const resolved = path.posix.normalize(path.posix.join(fileDir, source));

      if (isAllowed(resolved)) {
        return;
      }

      context.report({
        node,
        messageId: "externalImport",
        data: { source, resolved },
      });
    }

    return {
      ImportDeclaration(node) {
        checkSource(node.source);
      },
      ExportNamedDeclaration(node) {
        checkSource(node.source);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source);
      },
      ImportExpression(node) {
        checkSource(node.source);
      },
    };
  },
};

export default rule;

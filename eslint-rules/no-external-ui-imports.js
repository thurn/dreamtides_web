import path from "node:path";

/**
 * Enforces Tango's isolation boundary. `src/tango/**` is the self-contained home
 * of the shared UI library, so code under it may import ONLY:
 *   - other code under `src/tango/`,
 *   - bare `node_modules` packages (specifiers that do not start with `.`),
 *   - an explicit allowlist of non-UI infrastructure (see {@link ALLOWED_PREFIXES}
 *     and {@link ALLOWED_FILES}).
 *
 * Any other import target under the repo (e.g. `src/components/`, `src/screens/`,
 * `src/atlas/`) is denied. The rule is FAIL-CLOSED: anything not explicitly
 * allowed is an error, so a future UI directory can never silently leak in.
 *
 * Files outside `src/tango/` are unaffected (the rule is a no-op there).
 */

/**
 * Repo-relative POSIX directory prefixes Tango may import from. Easy to extend:
 * add another `"src/<dir>/"` entry here.
 */
const ALLOWED_PREFIXES = [
  "src/tango/",
  "src/data/",
  "src/types/",
  "src/runtime/",
];

/**
 * Repo-relative POSIX file paths Tango may import, ignoring any extension.
 * The single non-UI infrastructure file is `src/logging.ts`.
 */
const ALLOWED_FILES = ["src/logging"];

/** Strip a trailing recognized module extension so `foo.ts`/`foo.tsx`/... == `foo`. */
function stripExtension(relativePath) {
  return relativePath.replace(/\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, "");
}

/**
 * Convert an OS path to a repo-relative POSIX path. The repo root is derived by
 * finding the first `src/` segment in the (already absolute or resolved) path.
 */
function toRepoRelativePosix(absolutePath) {
  const posix = absolutePath.split(path.sep).join("/");
  const marker = "/src/";
  const index = posix.indexOf(marker);
  if (index !== -1) {
    return posix.slice(index + 1);
  }
  // Already repo-relative (e.g. "src/tango/..."), or no src/ segment at all.
  return posix.startsWith("src/") ? posix : posix.replace(/^\.?\//, "");
}

/** True if a resolved repo-relative POSIX path is permitted for a Tango file. */
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
        "Enforce Tango's isolation boundary: src/tango may import only from itself, bare modules, and the infrastructure allowlist.",
    },
    schema: [],
    messages: {
      externalImport:
        "Tango may not import '{{source}}' (resolves to '{{resolved}}'). src/tango/** may only import from itself, bare node_modules packages, or the allowlist (src/data/, src/types/, src/runtime/, src/logging.ts).",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const fileRelative = toRepoRelativePosix(rawFilename);

    // Only act on files under src/tango/. Elsewhere the rule is inert.
    if (!fileRelative.startsWith("src/tango/")) {
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

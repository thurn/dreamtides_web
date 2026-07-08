import path from "node:path";

/**
 * Bans raw `env(safe-area-inset-*)` reads in Tango's product-UI tier.
 *
 * The device-frame screenshot iframe (used for QA and design review) cannot
 * simulate the browser's native safe-area insets — a raw `env()` read
 * resolves to 0 inside it, silently ignoring the simulated notch/home-
 * indicator inset the harness injects. App code must read the injected
 * `var(--safe-area-inset-top)` (or `--safe-area-inset-bottom`/`-left`/
 * `-right`) channel instead, or a `--safe-*` design floor built on top of
 * it — see the safe-area chapter of the Tango token docs.
 *
 * SCOPE. Files under `src/tango/` outside {@link EXEMPT_PREFIXES} and outside
 * `*.test.*`/`*.spec.*` files. `src/tango/primitives/` is exempt because the
 * primitives token mirror is the one legitimate declarer of the `env()`
 * fallback (it is what the injected `--safe-area-inset-*` custom properties
 * fall back to outside the harness). `src/tango/docs/` is exempt as tooling.
 */

/** Repo-relative POSIX dir prefixes exempt from the check. */
const EXEMPT_PREFIXES = ["src/tango/primitives/", "src/tango/docs/"];

/** Matches a raw `env(safe-area-inset-*)` read. */
const RAW_SAFE_AREA_ENV_RE = /env\(\s*safe-area-inset-/;

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule governs the given repo-relative POSIX path. */
export function isGovernedFile(fileRelative) {
  if (!fileRelative.startsWith("src/tango/")) {
    return false;
  }
  if (/\.(test|spec)\./.test(fileRelative)) {
    return false;
  }
  return !EXEMPT_PREFIXES.some((prefix) => fileRelative.startsWith(prefix));
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw env(safe-area-inset-*) reads in Tango product UI; read the injected var(--safe-area-inset-*) channel instead.",
    },
    schema: [],
    messages: {
      rawSafeAreaEnv:
        "Raw `env(safe-area-inset-*)` reads as 0 inside the device-frame screenshot iframe, silently ignoring the simulated inset. Read the injected `var(--safe-area-inset-top)` (or the matching bottom/left/right channel) — or a `--safe-*` design floor built on it — instead. See the safe-area chapter of the Tango token docs.",
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

    return {
      Literal(node) {
        if (
          typeof node.value === "string" &&
          RAW_SAFE_AREA_ENV_RE.test(node.value)
        ) {
          context.report({ node, messageId: "rawSafeAreaEnv" });
        }
      },
      TemplateElement(node) {
        if (RAW_SAFE_AREA_ENV_RE.test(node.value.raw)) {
          context.report({ node, messageId: "rawSafeAreaEnv" });
        }
      },
    };
  },
};

export default rule;

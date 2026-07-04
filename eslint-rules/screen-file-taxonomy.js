import path from "node:path";

/**
 * Every file in `src/screens/tango/` must be one of the roles the migrated
 * screen architecture defines, because the OTHER rules select their targets
 * by filename: `thin-adapters` + `max-lines` fire on `*Adapter.tsx`, and the
 * builder-purity import block fires on `*-view-model.ts`. Without this rule
 * the whole architecture is opt-in — a `foo-helpers.ts` or `SharedPanel.tsx`
 * dropped beside the adapters gets no constraints at all, and that is exactly
 * where drift accumulates once screens are mass-produced.
 *
 * Allowed roles:
 *   - `registry.tsx` (+ `registry.test.tsx`) — the screen registry.
 *   - `FooScreenAdapter.tsx` (+ `.test.tsx`) — one thin adapter per screen.
 *   - `foo-view-model.ts` (+ `.test.ts`) — the pure builder module. `.ts`
 *     only: a builder is React-free by rule, so it can never need `.tsx`.
 *
 * Anything else errors. Code that seems to need a new home here belongs in
 * the view-model module (pure mapping), the Tango screen (presentation), or
 * `src/data/` (domain rules).
 */

/** Basename patterns for the sanctioned file roles. */
const ALLOWED_BASENAMES = [
  /^registry\.tsx$/,
  /^registry\.test\.tsx$/,
  /Adapter\.tsx$/,
  /Adapter\.test\.tsx$/,
  /-view-model\.ts$/,
  /-view-model\.test\.ts$/,
];

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when the basename matches a sanctioned role. */
export function isAllowedBasename(basename) {
  return ALLOWED_BASENAMES.some((pattern) => pattern.test(basename));
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "src/screens/tango/ holds only registry, *Adapter.tsx, and *-view-model.ts files (plus their tests); the screen architecture's rules select targets by filename, so any other file escapes them.",
    },
    schema: [],
    messages: {
      unknownRole:
        "'{{basename}}' is not a sanctioned file role in src/screens/tango/ (registry.tsx, *Adapter.tsx, *-view-model.ts, or their tests). Pure mapping belongs in a *-view-model.ts module, presentation in the Tango screen (src/tango/screens/), and domain rules in src/data/.",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!fileRelative.startsWith("src/screens/tango/")) {
      return {};
    }
    const basename = path.posix.basename(fileRelative);
    if (isAllowedBasename(basename)) {
      return {};
    }

    return {
      Program(node) {
        context.report({
          node,
          messageId: "unknownRole",
          data: { basename },
        });
      },
    };
  },
};

export default rule;

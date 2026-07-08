import path from "node:path";

/**
 * Bans ad-hoc numeric `scale()` factors in Tango's `transform` values.
 *
 * Dreamtides has ONE press/hover feedback rule (Pressable.tsx): a control
 * scales DOWN on press by `PRESS_SCALE` (the `--press-scale` token) and UP on
 * hover by `HOVER_SCALE` (the `--hover-scale` token); the atlas/site node uses
 * the shared `--node-hover-scale` token. A hand-typed `scale(1.08)` re-hardcodes
 * a factor the design system already owns, so the same gesture drifts out of
 * sync across call sites (and JS drifts from the CSS `:active` / `:hover` rules
 * that read the very same token). Any bespoke sizing scale (an image crop, a
 * showcase zoom) is likewise a magic number that belongs behind a NAMED
 * constant, not inlined into a `scale()` string.
 *
 * SCOPE. Every file under `src/tango/`, EXCEPT
 *   - {@link EXEMPT_FILE} `src/tango/primitives/Pressable.tsx` — the ONE place
 *     the `PRESS_SCALE` / `HOVER_SCALE` numeric literals are DEFINED; and
 *   - test files (`*.test.ts` / `*.test.tsx`) — a render test legitimately
 *     asserts against a CONCRETE rendered transform string
 *     (`expect(style.transform).toBe("scale(1.03)")`).
 * All other files are a no-op.
 *
 * DETECTION. Any string {@link Literal} or {@link TemplateElement} whose text
 * contains a `scale(` / `scaleX(` / `scaleY(` call (see {@link SCALE_CALL_RE})
 * with a BARE NUMERIC-LITERAL argument other than the identity `scale(1)` reset
 * is flagged. A negative lookbehind keeps `grayscale(0.5)` (a `filter`) from
 * matching. A reference argument — an identifier (`scale(${HOVER_SCALE})`) or a
 * token/var (`scale(${token("--node-hover-scale")})`, `scale(var(--…))`) —
 * lives in the template's `${…}` expression, not the quasi text, so it never
 * matches and is allowed.
 */

/** Repo-relative POSIX path of the one file that DEFINES the press/hover factors. */
const EXEMPT_FILE = "src/tango/primitives/Pressable.tsx";

/**
 * Matches a `scale(` / `scaleX(` / `scaleY(` call whose argument is a single
 * bare number (integer or decimal, optional sign). The lookbehind rejects a
 * `scale` that is the tail of another CSS function name (`grayscale(`,
 * `upscale(`) so an unrelated filter is never flagged. Global — a single string
 * may hold more than one `scale()` (e.g. a ternary is authored as separate
 * literals, but a multi-transform value like `translate(...) scale(...)` is
 * one string).
 */
const SCALE_CALL_RE = /(?<![A-Za-z-])scale[XY]?\(\s*(-?[0-9]*\.?[0-9]+)\s*\)/g;

/** True when the repo-relative POSIX path is a test file. */
export function isTestFile(fileRelative) {
  return /\.test\.[cm]?[jt]sx?$/.test(fileRelative);
}

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule governs the given repo-relative POSIX path. */
export function isGovernedFile(fileRelative) {
  if (fileRelative === EXEMPT_FILE || isTestFile(fileRelative)) {
    return false;
  }
  return fileRelative.startsWith("src/tango/");
}

/**
 * The bare numeric `scale()` factors in `text` that are NOT the identity
 * `scale(1)` reset, as an array of the matched call substrings (e.g.
 * `["scale(1.08)"]`). Empty when every `scale()` is `scale(1)` or references a
 * constant/token via a `${…}` expression (which is not part of a quasi's text).
 */
export function adhocScaleCalls(text) {
  if (typeof text !== "string") {
    return [];
  }
  const offenders = [];
  for (const match of text.matchAll(SCALE_CALL_RE)) {
    if (Number(match[1]) !== 1) {
      offenders.push(match[0]);
    }
  }
  return offenders;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban ad-hoc numeric scale() factors in Tango transform values (all of src/tango/ except the Pressable.tsx definition file and test files). A press/hover scale must reference PRESS_SCALE / HOVER_SCALE or the --node-hover-scale token; any other bespoke scale must reference a named constant, so the factor never drifts and JS stays in lock-step with the CSS :active / :hover rules.",
    },
    schema: [],
    messages: {
      adhocScale:
        "`{{text}}` hardcodes a scale factor. Route a press/hover feedback scale through `PRESS_SCALE` / `HOVER_SCALE` (or the `--node-hover-scale` token / a `var(--…)`), and any other bespoke scale through a NAMED constant — the design system owns the one press/hover factor so a gesture does not drift and JS stays in lock-step with the CSS `:active` / `:hover` rules.",
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

    function report(node, text) {
      for (const call of adhocScaleCalls(text)) {
        context.report({
          node,
          messageId: "adhocScale",
          data: { text: call },
        });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") {
          return;
        }
        report(node, node.value);
      },
      TemplateElement(node) {
        report(node, node.value.raw);
      },
    };
  },
};

export default rule;

// @vitest-environment node
//
// CSS companion to the `tango/no-adhoc-press-scale` ESLint rule.
//
// Dreamtides has ONE press/hover feedback rule: a control scales DOWN on press
// by `--press-scale` and UP on hover by `--hover-scale`; the atlas/site node
// uses `--node-hover-scale`. The ESLint rule keeps the JS transforms honest; a
// `:hover` / `:active` CSS rule that hand-types `transform: scale(1.03)` instead
// of `scale(var(--hover-scale))` drifts from the very token the JS reads. This
// test scans every src/tango CSS file's `transform:` declarations and fails on a
// numeric `scale()` factor that is neither the identity `scale(1)` reset nor a
// `var(--…)` reference.
//
// SCOPE. `@keyframes` blocks are excluded: an animation keyframe (a battle-pulse
// ring, an entrance sweep) carries bespoke, one-shot scale values that are NOT
// press/hover feedback and do not belong behind a feedback token. The scan
// targets the resting / `:hover` / `:active` state rules where feedback lives.
//
// BASELINE is the known, already-reviewed set of transitional offenders — a
// feedback `transform: scale(<number>)` that a later migration will route
// through `var(--…)`. It is expected EMPTY; an entry surviving with no live
// offender to match it (caught by the "no stale BASELINE entry" test) means the
// migration already happened and the entry should be removed.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TANGO_ROOT = resolve(ROOT, "src/tango");

/**
 * Known, already-reviewed transitional CSS offenders, as
 * `[scaleCall, fileRelative]` (e.g. `["scale(1.03)", "src/tango/…/foo.css"]`).
 * Expected EMPTY: after the press-scale migration, every feedback scale reads a
 * `var(--…)` token.
 */
export const BASELINE = [];

/** A `scale(` / `scaleX(` / `scaleY(` call, capturing its raw argument text.
 * The lookbehind rejects `grayscale(` so a `filter` is never matched. */
const SCALE_CALL_RE = /(?<![A-Za-z-])scale[XY]?\(\s*([^)]+?)\s*\)/g;

/** Every `transform:` declaration value in a CSS body. */
const TRANSFORM_DECL_RE = /transform\s*:\s*([^;{}]+)/g;

/** Strip `/* … *\/` comments. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Strip `@keyframes name { … }` blocks (one level of nested step-blocks). Their
 * scale values are bespoke animation frames, not press/hover feedback.
 */
function stripKeyframes(css) {
  return css.replace(/@keyframes[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
}

/** True when a `scale()` argument is a compliant reference or identity reset. */
function isAllowedScaleArg(arg) {
  const trimmed = arg.trim();
  if (trimmed.startsWith("var(")) return true;
  return Number(trimmed) === 1;
}

/** Recursively collect every `.css` file under `dir`. */
function collectCssFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * PURE core: scan every src/tango CSS file and return every non-compliant
 * feedback scale as `{ call, file }` — a numeric `scale()` in a `transform:`
 * declaration (outside `@keyframes`) that is neither `scale(1)` nor a
 * `var(--…)` reference. Sorted by `file` then `call`.
 */
export function findAdhocCssScales() {
  const offenders = [];
  for (const full of collectCssFiles(TANGO_ROOT)) {
    const relFile = relative(ROOT, full).split(sep).join("/");
    const body = stripKeyframes(stripComments(readFileSync(full, "utf8")));
    for (const decl of body.matchAll(TRANSFORM_DECL_RE)) {
      const value = decl[1];
      for (const call of value.matchAll(SCALE_CALL_RE)) {
        if (!isAllowedScaleArg(call[1])) {
          offenders.push({ call: call[0], file: relFile });
        }
      }
    }
  }
  offenders.sort(
    (a, b) => a.file.localeCompare(b.file) || a.call.localeCompare(b.call),
  );
  return offenders;
}

/** Whether a live offender matches a BASELINE entry (exact call + file). */
function isBaselined(offender) {
  return BASELINE.some(
    ([call, file]) => offender.call === call && offender.file === file,
  );
}

describe("src/tango CSS has no ad-hoc press/hover scale literals", () => {
  it("every transform: scale() is scale(1), a var(--…), or baselined", () => {
    const unexpected = findAdhocCssScales().filter((o) => !isBaselined(o));
    const message = unexpected
      .map(
        (o) =>
          `ADHOC CSS SCALE ${JSON.stringify(o.call)} in ${o.file} — use scale(var(--hover-scale)) / scale(var(--press-scale)) / scale(var(--node-hover-scale)), or add it to BASELINE in scripts/tango-css-press-scale.test.mjs`,
      )
      .join("\n");
    expect(unexpected, message).toEqual([]);
  });

  it("no stale BASELINE entry", () => {
    const offenders = findAdhocCssScales();
    const stale = BASELINE.filter(
      ([call, file]) =>
        !offenders.some((o) => o.call === call && o.file === file),
    );
    const message = stale
      .map(
        ([call, file]) =>
          `STALE BASELINE ENTRY ${JSON.stringify(call)} (${file}) — has no live offender, remove it from BASELINE`,
      )
      .join("\n");
    expect(stale, message).toEqual([]);
  });
});

// @vitest-environment node
//
// Orphan-token integrity check for src/tango's design tokens.
//
// tango-tokens.css defines the design system's semantic tokens (the
// --primitive-* tier that feeds them is intentionally excluded — primitives
// are consumed exclusively by other tokens, never read directly by
// components). A semantic token with no live reader anywhere under src/ is
// dead weight: it silently drifts from the values components actually use,
// and it's easy to miss during review because grepping component code alone
// never surfaces it. This test scans every non-excluded TS/TSX/CSS file
// under src/ for a `var(--x)` or `token("--x")`/`readLengthToken("--x")` read
// and fails the build the moment a NEW orphan appears, so it has to be
// either wired up or deliberately baselined.
//
// BASELINE is the known, already-reviewed set of orphans that predate this
// test. The design-system revisions program's Phase 1 prunes the audit's §4
// dead-token set (--card-aspect, the --cat-* family, --space-0,
// --tide-earthy, --control-h/-sm, the four dead --glow-*, ...) from both
// tango-tokens.css and this list as it verifies each one is truly unused.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = resolve(ROOT, "src");
const CSS_PATH = resolve(ROOT, "src/tango/primitives/tango-tokens.css");

// The generated mirror of tango-tokens.css: every `token()` entry it carries
// is a deliberate, mechanical re-typing of the CSS source, not a genuine read
// site.
const TOKENS_MIRROR_PATH = resolve(ROOT, "src/tango/primitives/tokens.ts");

// The doc-site chrome (demos, ComponentPage, PropsTable, etc.) legitimately
// re-types component values to show them off; it isn't the design-system
// material itself.
const DOCS_PREFIX = "src/tango/docs/";

/**
 * Known, already-reviewed orphan token names — tokens with no live reader
 * anywhere under src/ (other than the CSS file itself, the generated
 * tokens.ts mirror, docs/, and test/spec files). Produced by running
 * findOrphanTokens() on the tree at authoring (2026-07-07).
 *
 * "--space-11" was added after authoring: its last reader
 * (src/tango/screens/DraftScreen.tsx's pick-counter band) was rewritten to
 * use --space-6/--space-9 instead in the same-day commit
 * 5d28cfa2 ("subtle pick counter under the pack + touch term reveals"),
 * freeing the token to become genuinely orphaned.
 */
export const BASELINE = [
  "--accent-tint",
  "--bg-band",
  "--card-aspect",
  "--cat-dreamsign",
  "--cat-grant",
  "--cat-improve",
  "--cat-remove",
  "--color-essence-glow-strong",
  "--color-primary",
  "--control-h",
  "--control-h-sm",
  "--cv-selection-color",
  "--device-h",
  "--device-w",
  "--display-cutout-right",
  "--dt-bg-0",
  "--dt-bg-1",
  "--dt-bg-2",
  "--dt-border",
  "--dt-enemy",
  "--dt-energy",
  "--dt-energy-border",
  "--dt-line",
  "--dt-player",
  "--dt-primary",
  "--dt-primary-light",
  "--dt-spark",
  "--dt-spark-border",
  "--dt-surface-light",
  "--ease-dream",
  "--font-logo",
  "--font-mono-canon",
  "--font-numeral",
  "--font-rules-canon",
  "--font-sans-canon",
  "--font-serif-canon",
  "--glow-accent",
  "--glow-accent-strong",
  "--glow-gold",
  "--glow-text",
  "--gradient-accent",
  "--gradient-energy",
  "--gradient-gold",
  "--gutter-tight",
  "--inset-press",
  "--motion-container-transform",
  "--motion-object-travel",
  "--radius-sheet",
  "--scrim-strong",
  "--shadow-sheet",
  "--shadow-sm",
  "--sheet-grab",
  "--space-0",
  "--space-11",
  "--space-12",
  "--stagger-travel",
  "--surface-chip",
  "--t-button",
  "--t-button-sm",
  "--t-display",
  "--t-lead",
  "--t-numeral",
  "--t-popover-body",
  "--t-popover-epithet",
  "--t-popover-headline",
  "--t-popover-meta",
  "--t-serif-body",
  "--text-on-card",
  "--tide-earthy",
  "--touch-min",
  "--tracking-wordmark",
];

/** Whether `fullPath` is walked at all: TS/TSX/CSS source under src/. */
function isCandidateFile(name) {
  return /\.(ts|tsx|css)$/.test(name);
}

/**
 * Whether a candidate file is excluded from the scan: test/spec files, the
 * token CSS source itself, the generated tokens.ts mirror, and anything
 * under the doc-site's docs/ dir.
 */
function isExcludedFile(fullPath) {
  const base = fullPath.slice(fullPath.lastIndexOf(sep) + 1);
  if (/\.(test|spec)\./.test(base)) return true;
  if (fullPath === CSS_PATH) return true;
  if (fullPath === TOKENS_MIRROR_PATH) return true;
  const relPath = relative(ROOT, fullPath).split(sep).join("/");
  if (relPath.startsWith(DOCS_PREFIX)) return true;
  return false;
}

/** Recursively collect every non-excluded ts/tsx/css file under `dir`. */
function collectFiles(dir) {
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
      files.push(...collectFiles(full));
    } else if (entry.isFile() && isCandidateFile(entry.name)) {
      if (!isExcludedFile(full)) files.push(full);
    }
  }
  return files;
}

/**
 * Every semantic (non-`--primitive-*`) token name declared in
 * tango-tokens.css, in declaration order with duplicates removed.
 */
function parseTokenNames(cssText) {
  const names = [];
  const seen = new Set();
  const declarationRe = /^\s*(--[a-zA-Z0-9_-]+)\s*:/gm;
  for (const match of cssText.matchAll(declarationRe)) {
    const name = match[1];
    if (name.startsWith("--primitive-")) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** Escape `name` for safe interpolation into a RegExp source string. */
function escapeForRegExp(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `text` contains a live read of token `name`: `var(--x)` /
 * `var(--x, ...)`, or `token("--x")` / `readLengthToken("--x")`. Writes
 * (e.g. `right: "--display-cutout-right"` assigning a token *name* as a
 * string, as in device-frame.ts) do not match either pattern.
 */
function isRead(name, text) {
  const q = escapeForRegExp(name);
  const varRe = new RegExp(`var\\(\\s*${q}\\s*[,)]`);
  const tokenCallRe = new RegExp(`(token|readLengthToken)\\(\\s*["']${q}["']`);
  return varRe.test(text) || tokenCallRe.test(text);
}

/**
 * PURE core: scan every non-excluded TS/TSX/CSS file under src/ and return
 * the sorted list of semantic token names (declared in tango-tokens.css)
 * that have no read anywhere in that file set.
 */
export function findOrphanTokens() {
  const cssText = readFileSync(CSS_PATH, "utf8");
  const tokenNames = parseTokenNames(cssText);
  const files = collectFiles(SRC_ROOT);
  const fileTexts = files.map((fullPath) => readFileSync(fullPath, "utf8"));

  const orphans = tokenNames.filter(
    (name) => !fileTexts.some((text) => isRead(name, text)),
  );
  orphans.sort();
  return orphans;
}

describe("src/tango has no unreviewed orphan design tokens", () => {
  it("every orphan token is in BASELINE", () => {
    const baseline = new Set(BASELINE);
    const unexpected = findOrphanTokens().filter((t) => !baseline.has(t));
    const message = unexpected
      .map(
        (t) =>
          `ORPHAN TOKEN ${t} has no reader under src/ — wire it up, delete it from tango-tokens.css, or add it to BASELINE in scripts/tango-orphan-tokens.test.mjs`,
      )
      .join("\n");
    expect(unexpected, message).toEqual([]);
  });

  it("no stale BASELINE entry", () => {
    const orphans = new Set(findOrphanTokens());
    const stale = BASELINE.filter((t) => !orphans.has(t));
    const message = stale
      .map(
        (t) =>
          `STALE BASELINE ENTRY ${t} — is now read (or was deleted) under src/, remove it from BASELINE in scripts/tango-orphan-tokens.test.mjs`,
      )
      .join("\n");
    expect(stale, message).toEqual([]);
  });
});

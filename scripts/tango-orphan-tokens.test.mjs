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
 */
// Every entry below is an orphan with NO static reader (a `var()`/`token()`
// site outside this source pair) AND no dynamically-constructed reader — the
// tree builds no token names via template literals, so the only `token()`
// argument that is not a plain string literal (DesktopDeckViewer.tsx line ~302)
// resolves to `--text-on-accent`/`--text-secondary`, neither of which is here.
// Each remaining entry is therefore RETAINED on one of two grounds, stated
// inline: (a) it is a member of a sanctioned, deliberately-complete design
// scale (spacing / type / radius / elevation / motion / gradient / surface /
// device-frame), reserved so UI code can pick a step by role; or (b) it is a
// PRODUCTION-BRIDGE re-export (--dt-* / --color-* / --cv-*) that pins a shared
// production token name so an element (above all the game card) resolves
// identically in the desktop/production system.
export const BASELINE = [
  // Semantic roles — reserved for a specific use, no current Tango reader.
  "--accent-tint", // reserved low-alpha fill behind accents
  "--bg-band", // reserved surface: raised background band
  "--surface-raised", // reserved surface: raised card fill (one step above --surface-card)
  "--surface-chip", // reserved surface: chip fill
  "--text-on-card", // reserved text role: card name on card chrome
  // Production bridge (--color-* global re-exports).
  "--color-essence-glow-strong",
  "--color-primary",
  // Production bridge (--cv-* card-chrome re-export).
  "--cv-selection-color",
  // Device-frame layout constants (the iPhone canvas the kit designs against).
  "--device-h",
  "--device-w",
  "--sheet-grab", // reserved layout constant: bottom-sheet drag-handle width
  "--touch-min", // reserved layout floor: Apple HIG 44pt minimum touch target
  "--gutter-tight", // reserved screen gutter for dense grids
  // Production bridge (--dt-* atlas/shared re-exports). --dt-line additionally
  // feeds the live canonical --line token inside tango-tokens.css.
  "--dt-bg-0",
  "--dt-bg-1",
  "--dt-bg-2",
  "--dt-border",
  "--dt-enemy",
  "--dt-energy",
  "--dt-energy-border",
  "--dt-line", // consumed by --line (a live-read canonical token) in the CSS
  "--dt-player",
  "--dt-primary",
  "--dt-primary-light",
  "--dt-spark",
  "--dt-spark-border",
  "--dt-surface-light",
  // Motion scale members. --ease-dream additionally feeds
  // --motion-container-transform inside tango-tokens.css.
  "--ease-dream",
  "--motion-container-transform",
  "--motion-object-travel",
  "--stagger-travel",
  // Font roles / canonical face layer (the sanctioned type-face vocabulary).
  "--font-logo",
  "--font-numeral",
  "--font-mono-canon",
  "--font-rules-canon",
  "--font-sans-canon",
  "--font-serif-canon",
  // Object-material gradients (energy orb, wordmark, reward gold).
  "--gradient-accent",
  "--gradient-energy",
  "--gradient-gold",
  // Elevation / inset shadow scale members.
  "--inset-press",
  "--shadow-sheet",
  "--shadow-sm",
  // Radius scale member.
  "--radius-sheet",
  // Scrim scale member (full-screen focus darkening).
  "--scrim-strong",
  // Type scale (--t-*) members — sanctioned complete scale; each bundles
  // weight + size + face for a voice UI code applies by role.
  "--t-button",
  "--t-button-sm",
  "--t-display",
  "--t-numeral",
  "--t-popover-body",
  "--t-popover-epithet",
  "--t-popover-headline",
  "--tracking-wordmark", // reserved wordmark letter-spacing token
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
 * (e.g. `top: "--display-cutout-top"` assigning a token *name* as a
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

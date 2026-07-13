// @vitest-environment node
//
// Generation-time companion to the `no-raw-icon-classes` ESLint rule.
//
// The rule funnels every icon into the typed `GLYPHS` vocabulary
// (`src/cumulus/primitives/glyph.ts`), but a `GLYPHS` entry is still just a
// branded class string — nothing checks that the class it names actually ships
// in the vendored Boxicons stylesheets. A typo'd or retired class
// (`bx-refresh`, which Boxicons v3 renamed to `bx-refresh-cw`) type-checks,
// lints clean, and then renders a blank box at runtime. This test resolves each
// Boxicons class referenced by `GLYPHS` against the vendored CSS so that
// blank-icon failure surfaces under `npm test` instead of in production.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const GLYPH_FILE = join(REPO_ROOT, "src/cumulus/primitives/glyph.ts");
const CSS_FILES = [
  join(REPO_ROOT, "src/vendor/boxicons/boxicons.css"),
  join(REPO_ROOT, "src/vendor/boxicons/boxicons-filled.css"),
];

/** Every `.bx-<name>` icon class that the vendored stylesheets define. */
function definedBoxiconClasses() {
  const defined = new Set();
  const selectorRe = /\.(bx-[a-z0-9-]+)::?before/g;
  for (const file of CSS_FILES) {
    const css = readFileSync(file, "utf8");
    let match;
    while ((match = selectorRe.exec(css)) !== null) {
      defined.add(match[1]);
    }
  }
  return defined;
}

/**
 * Each Boxicons class token (`bx-<name>`) referenced by a `GLYPHS` entry, paired
 * with the full class string it came from for diagnostics. Non-Boxicons glyphs
 * (Font-Awesome `fa-*`) and the base classes (`bx` / `bxf`) are ignored — only
 * `bx-*` icon classes resolve against the Boxicons stylesheets.
 */
function referencedBoxiconClasses() {
  const source = readFileSync(GLYPH_FILE, "utf8");
  const brandRe = /\bg\(\s*"([^"]+)"\s*\)/g;
  const refs = [];
  let match;
  while ((match = brandRe.exec(source)) !== null) {
    const classString = match[1];
    for (const token of classString.split(/\s+/)) {
      if (token.startsWith("bx-")) {
        refs.push({ token, classString });
      }
    }
  }
  return refs;
}

describe("GLYPHS icon classes resolve to real Boxicons rules", () => {
  it("parses at least the resource-mark glyphs from glyph.ts", () => {
    const refs = referencedBoxiconClasses();
    // Guard against a parser regression silently matching nothing.
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((r) => r.token === "bx-crypto")).toBe(true);
  });

  it("finds a populated set of icon rules in the vendored CSS", () => {
    expect(definedBoxiconClasses().size).toBeGreaterThan(0);
  });

  it("every bx-* class in GLYPHS exists in the vendored stylesheets", () => {
    const defined = definedBoxiconClasses();
    const missing = referencedBoxiconClasses().filter(
      (ref) => !defined.has(ref.token),
    );
    expect(
      missing,
      `GLYPHS references Boxicons classes with no rule in the vendored CSS ` +
        `(they render as blank boxes): ` +
        missing.map((m) => `${m.token} (in "${m.classString}")`).join(", "),
    ).toEqual([]);
  });
});

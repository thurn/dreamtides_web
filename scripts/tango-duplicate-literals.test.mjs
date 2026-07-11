// @vitest-environment node
//
// Cross-file duplicate-literal integrity check for src/tango.
//
// Bespoke visual literals — gradients, rgba()/hsla() colors, hex colors,
// blur()/saturate() filters, box-shadow offsets, `inset` shadows — are copied
// by hand between components far more easily than they're refactored into a
// shared token or helper. Once the same visual literal is pasted into two
// files, the two copies silently drift the moment either one is edited alone.
// This test scans every Tango source file for such literals and fails the
// build the moment a NEW cross-file duplicate appears, so a copy-paste has to
// be either deliberately baselined (with a comment explaining why the value
// is bespoke) or deduped into a shared source of truth.
//
// BASELINE is the known, already-reviewed set of duplicates that predate this
// test: the design-system revisions program's later phases consolidate each
// pair's shared material (e.g. into a helper like `glassSurfaceStyle`) and
// delete the corresponding BASELINE entry as they do. An entry surviving with
// no live duplicate to match it (caught by the "no stale BASELINE entry"
// test) means the dedupe already happened and the entry should be removed.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TANGO_ROOT = resolve(ROOT, "src/tango");

// The generated mirror of tango-tokens.css: every token value it carries is a
// deliberate, mechanical re-typing of the CSS source, not a copy-paste.
const TOKENS_MIRROR_PATH = resolve(ROOT, "src/tango/primitives/tokens.ts");

// The doc-site chrome (demos, ComponentPage, PropsTable, etc.) legitimately
// re-types component values to show them off; it isn't the design-system
// material itself.
const DOCS_PREFIX = "src/tango/docs/";

const MIN_LENGTH = 24;
const VISUAL =
  /(gradient\(|rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b|blur\(|saturate\(|\binset\b|box-shadow|\d+px\s+\d+px)/;

/**
 * Known, already-reviewed cross-file duplicate visual literals, as
 * `[literalPrefix, fileA, fileB]` with `fileA < fileB` (repo-relative paths,
 * sorted). A live duplicate is baselined when its sorted file pair matches an
 * entry's `[fileA, fileB]` and its literal starts with that entry's
 * `literalPrefix`.
 */
export const BASELINE = [
  // The full-bleed overlay's safe-area top padding, so a mobile header clears
  // the device cutout. GlassDialog is the shell the deck viewers migrate onto
  // in Phase 3; that migration deletes MobileDeckViewer's own copy and this
  // entry with it.
  [
    "max(var(--safe-area-inset-top), ${token(\"--gutter\")})",
    "src/tango/components/overlay/GlassDialog.tsx",
    "src/tango/screens/MobileDeckViewer.tsx",
  ],
];

/** Whether `fullPath` is walked at all: TS/TSX/CSS source under src/tango. */
function isCandidateFile(name) {
  return /\.(ts|tsx|css)$/.test(name);
}

/**
 * Whether a candidate file is excluded from the scan: test/spec files, the
 * generated tokens.ts mirror, and anything under the doc-site's docs/ dir.
 */
function isExcludedFile(fullPath) {
  const base = fullPath.slice(fullPath.lastIndexOf(sep) + 1);
  if (/\.(test|spec)\./.test(base)) return true;
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
 * Every string literal, no-substitution template literal (decoded), and
 * template-expression (raw source text, backticks stripped, `${...}`
 * substitutions left in place) appearing anywhere in a TS/TSX source file.
 */
function extractTsLiterals(sourceText, fileName) {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const literals = [];
  function visit(node) {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      literals.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      const raw = node.getText(source);
      literals.push(raw.slice(1, -1)); // strip surrounding backticks
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return literals;
}

/** Every `property: value;` declaration's value text in a CSS file. */
function extractCssLiterals(cssText) {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const literals = [];
  const declarationRe = /:\s*([^;{}]+);/g;
  for (const match of withoutComments.matchAll(declarationRe)) {
    literals.push(match[1]);
  }
  return literals;
}

/**
 * PURE core: scan `src/tango` and return every trimmed visual literal
 * (length >= MIN_LENGTH, matching VISUAL) that appears in >= 2 distinct
 * files, as `{ literal, files }` with `files` the sorted distinct file list.
 * Same-file repeats of a literal are ignored (a file contributes at most one
 * membership per literal).
 */
export function findCrossFileDuplicates() {
  const literalToFiles = new Map();
  for (const fullPath of collectFiles(TANGO_ROOT)) {
    const text = readFileSync(fullPath, "utf8");
    const relFile = relative(ROOT, fullPath).split(sep).join("/");
    const rawLiterals = fullPath.endsWith(".css")
      ? extractCssLiterals(text)
      : extractTsLiterals(text, fullPath);
    for (const raw of rawLiterals) {
      const trimmed = raw.trim();
      if (trimmed.length < MIN_LENGTH) continue;
      if (!VISUAL.test(trimmed)) continue;
      let fileSet = literalToFiles.get(trimmed);
      if (!fileSet) {
        fileSet = new Set();
        literalToFiles.set(trimmed, fileSet);
      }
      fileSet.add(relFile);
    }
  }
  const duplicates = [];
  for (const [literal, fileSet] of literalToFiles) {
    if (fileSet.size >= 2) {
      duplicates.push({ literal, files: [...fileSet].sort() });
    }
  }
  duplicates.sort((a, b) => a.literal.localeCompare(b.literal));
  return duplicates;
}

/** Whether `files` (sorted) is exactly the pair `[fileA, fileB]`. */
function isFilePair(files, fileA, fileB) {
  return files.length === 2 && files[0] === fileA && files[1] === fileB;
}

/** Whether a live duplicate matches a BASELINE entry (file pair + prefix). */
function isBaselined(dup) {
  return BASELINE.some(
    ([literalPrefix, fileA, fileB]) =>
      isFilePair(dup.files, fileA, fileB) &&
      dup.literal.startsWith(literalPrefix),
  );
}

describe("src/tango has no unreviewed cross-file duplicate visual literals", () => {
  it("every cross-file duplicate is baselined", () => {
    const unexpected = findCrossFileDuplicates().filter(
      (dup) => !isBaselined(dup),
    );
    const message = unexpected
      .map(
        (dup) =>
          `DUPLICATE ${JSON.stringify(dup.literal)} in [${dup.files.join(", ")}] — either dedupe it into a shared source of truth or add it to BASELINE in scripts/tango-duplicate-literals.test.mjs`,
      )
      .join("\n");
    expect(unexpected, message).toEqual([]);
  });

  it("no stale BASELINE entry", () => {
    const duplicates = findCrossFileDuplicates();
    const stale = BASELINE.filter(
      ([literalPrefix, fileA, fileB]) =>
        !duplicates.some(
          (dup) =>
            isFilePair(dup.files, fileA, fileB) &&
            dup.literal.startsWith(literalPrefix),
        ),
    );
    const message = stale
      .map(
        ([literalPrefix, fileA, fileB]) =>
          `STALE BASELINE ENTRY ${JSON.stringify(literalPrefix)} (${fileA}, ${fileB}) — has no live duplicate, remove it from BASELINE`,
      )
      .join("\n");
    expect(stale, message).toEqual([]);
  });
});

// @vitest-environment node
//
// Legacy-tier ratchet for src/tango's migration.
//
// The design-system revisions program moves UI into the Tango tier
// (src/tango/ + src/screens/tango_adapters/) in place of the legacy
// src/components/ tier, and closes off src/tango/internal as an
// implementation detail that only src/tango itself may reach into. Two
// invariants keep that migration from silently backsliding:
//
// 1. No file outside src/tango may import from tango/internal. A NEW reach-in
//    fails this test the moment it lands.
// 2. The direct children of src/components/*.tsx are pinned to the known
//    set. New UI work should land in the Tango tier instead of growing this
//    legacy directory; an intentional add/remove updates COMPONENTS_TSX.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = resolve(ROOT, "src");
const TANGO_PREFIX = "src/tango/";

/**
 * Known, already-reviewed files outside src/tango that import from
 * tango/internal. Empty: every screen consumes the public Tango API, so any
 * hit here is a new reach-in to reject.
 */
export const INTERNAL_IMPORTERS = [];

/**
 * Pinned direct children of src/components/*.tsx. Build new UI in the
 * Tango tier (src/tango/ + src/screens/tango_adapters/); update this list
 * only for an intentional add/remove.
 */
export const COMPONENTS_TSX = [
  "BattleSiteRoute.test.tsx",
  "BattleSiteRoute.tsx",
  "CardDisplay.test.tsx",
  "CardDisplay.tsx",
  "CardHoverPreview.test.tsx",
  "CardHoverPreview.tsx",
  "CardOverlay.tsx",
  "DeckViewer.test.tsx",
  "DeckViewer.tsx",
  "DreamcallerPopover.test.tsx",
  "DreamcallerPopover.tsx",
  "DreamscapeQuestMenu.test.tsx",
  "DreamscapeQuestMenu.tsx",
  "DreamwellCardView.tsx",
  "ErrorBoundary.test.tsx",
  "ErrorBoundary.tsx",
  "GlossaryPopup.test.tsx",
  "GlossaryPopup.tsx",
  "HUD.test.tsx",
  "HUD.tsx",
  "HudDreamsignLayoutDemo.tsx",
  "HudDreamsignRow.test.tsx",
  "HudDreamsignRow.tsx",
  "OfferingScreen.tsx",
  "PoolViewer.test.tsx",
  "PoolViewer.tsx",
  "QuestUtilityMenu.tsx",
  "ScreenRouter.test.tsx",
  "ScreenRouter.tsx",
  "SiteGuide.tsx",
  "SiteSceneBackdrop.tsx",
  "TransfigurationCardDemo.tsx",
];

const INTERNAL_SPECIFIER_RE = /tango\/internal(\/|$)/;

/** Whether `fullPath` is walked at all: TS/TSX source under src/. */
function isCandidateFile(name) {
  return /\.(ts|tsx)$/.test(name);
}

/** Recursively collect every ts/tsx file under `dir`, skipping src/tango. */
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
      const relDir = relative(ROOT, full).split(sep).join("/") + "/";
      if (relDir.startsWith(TANGO_PREFIX)) continue;
      files.push(...collectFiles(full));
    } else if (entry.isFile() && isCandidateFile(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Every import/export specifier string literal in a TS/TSX source file. */
function extractImportSpecifiers(sourceText, fileName) {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specifiers;
}

/**
 * PURE core: walk src/ (excluding src/tango/) for every *.ts/*.tsx file
 * with an import whose specifier matches /tango\/internal(\/|$)/, returned
 * sorted and posix-normalized relative to the repo root.
 */
export function findInternalImporters() {
  const importers = [];
  for (const fullPath of collectFiles(SRC_ROOT)) {
    const text = readFileSync(fullPath, "utf8");
    const specifiers = extractImportSpecifiers(text, fullPath);
    if (specifiers.some((spec) => INTERNAL_SPECIFIER_RE.test(spec))) {
      importers.push(relative(ROOT, fullPath).split(sep).join("/"));
    }
  }
  importers.sort();
  return importers;
}

/**
 * PURE core: direct *.tsx children of src/components, sorted.
 */
export function directComponentsTsx() {
  return readdirSync(resolve(ROOT, "src/components"))
    .filter((name) => name.endsWith(".tsx"))
    .sort();
}

describe("src/tango legacy-tier ratchet", () => {
  it("no new file outside src/tango imports from tango/internal", () => {
    const expected = [...INTERNAL_IMPORTERS].sort();
    expect(
      findInternalImporters(),
      "A file outside src/tango is importing from tango/internal. " +
        "tango/internal is a private implementation detail of the Tango " +
        "design system; only src/tango itself may reach into it. Use the " +
        "public src/tango API instead, or migrate this screen onto the Tango " +
        "tier — see the tango-migrate skill.",
    ).toEqual(expected);
  });

  it("no new direct src/components/*.tsx file", () => {
    const expected = [...COMPONENTS_TSX].sort();
    expect(
      directComponentsTsx(),
      "src/components/*.tsx gained or lost a file. Build new UI in the " +
        "Tango tier (src/tango/ + src/screens/tango_adapters/) instead of " +
        "growing the legacy src/components/ directory. If this is an " +
        "intentional add/remove, update COMPONENTS_TSX in " +
        "scripts/tango-legacy-ratchet.test.mjs.",
    ).toEqual(expected);
  });
});

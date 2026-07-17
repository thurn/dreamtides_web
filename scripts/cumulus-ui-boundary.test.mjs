// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = resolve(ROOT, "src");
const CUMULUS_PREFIX = "src/cumulus/";

export const APP_SHELL_COMPONENTS = [
  "BattleSiteRoute.test.tsx",
  "BattleSiteRoute.tsx",
  "CardDisplay.test.tsx",
  "CardDisplay.tsx",
  "CardOverlay.tsx",
  "CumulusQuestChrome.test.tsx",
  "CumulusQuestChrome.tsx",
  "DeckViewer.test.tsx",
  "DeckViewer.tsx",
  "DreamcallerPopover.test.tsx",
  "DreamcallerPopover.tsx",
  "DreamscapeQuestMenu.test.tsx",
  "DreamscapeQuestMenu.tsx",
  "DreamwellCardView.tsx",
  "ErrorBoundary.test.tsx",
  "ErrorBoundary.tsx",
  "PoolViewer.test.tsx",
  "PoolViewer.tsx",
  "QuestUtilityMenu.tsx",
  "ScreenRouter.test.tsx",
  "ScreenRouter.tsx",
];

const SCREEN_TYPES = [
  "questStart",
  "atlas",
  "dreamscape",
  "questComplete",
  "questFailed",
];

const SITE_TYPES = [
  "Battle",
  "Draft",
  "Shop",
  "Purge",
  "Essence",
  "Transfiguration",
  "Duplication",
  "Reward",
  "DreamAugury",
  "DreamsignMarket",
  "DreamsignRevelation",
  "TemptingOffer",
  "Gamble",
  "TemporalFork",
];

const ROUTER_FILES = [
  "src/App.tsx",
  "src/components/ScreenRouter.tsx",
  "src/components/BattleSiteRoute.tsx",
  "src/battle/components/PlayableBattleScreen.tsx",
];

const DELETED_PLAYER_UI = /\/(?:AtlasScreen|QuestStartScreen|QuestCompleteScreen|QuestFailedScreen|DreamscapeScreen|DraftSiteScreen|ShopScreen|EssenceSiteScreen|DreamsignRevelationScreen|PurgeSiteScreen|TransfigurationSiteScreen|DuplicationSiteScreen|RewardSiteScreen|StubSiteScreen|HUD|BattleStartScreen)$/;

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function extractImportSpecifiers(sourceText, fileName) {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
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
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specifiers;
}

function casesForFunction(source, name) {
  const start = source.indexOf(`export function ${name}`);
  if (start < 0) return [];
  const nextExport = source.indexOf("\nexport function ", start + 1);
  const body = source.slice(start, nextExport < 0 ? source.length : nextExport);
  return [...body.matchAll(/case\s+"([^"]+)"/g)].map((match) => match[1]);
}

describe("Cumulus UI boundary", () => {
  it("keeps Cumulus internals private", () => {
    const importers = collectFiles(SRC_ROOT)
      .filter((file) => !relative(ROOT, file).split(sep).join("/").startsWith(CUMULUS_PREFIX))
      .filter((file) =>
        extractImportSpecifiers(readFileSync(file, "utf8"), file).some((specifier) =>
          /cumulus\/internal(?:\/|$)/.test(specifier),
        ),
      )
      .map((file) => relative(ROOT, file).split(sep).join("/"))
      .sort();
    expect(importers).toEqual([]);
  });

  it("pins the app-shell and operator component boundary", () => {
    const actual = readdirSync(resolve(ROOT, "src/components"))
      .filter((name) => name.endsWith(".tsx"))
      .sort();
    expect(actual).toEqual([...APP_SHELL_COMPONENTS].sort());
  });

  it("keeps deleted player UI out of gameplay routing", () => {
    for (const relativePath of ROUTER_FILES) {
      const fullPath = resolve(ROOT, relativePath);
      const source = readFileSync(fullPath, "utf8");
      const imports = extractImportSpecifiers(source, fullPath);
      expect(imports.filter((specifier) => DELETED_PLAYER_UI.test(specifier))).toEqual([]);
      expect(source).not.toMatch(/\b(?:UiVariant|uiVariant|servedByCumulus)\b/);
    }
  });

  it("gives every Screen and SiteType an explicit production disposition", () => {
    const registry = readFileSync(
      resolve(ROOT, "src/screens/cumulus_adapters/registry.tsx"),
      "utf8",
    );
    expect(casesForFunction(registry, "screenFor").sort()).toEqual(
      [...SCREEN_TYPES].sort(),
    );
    expect(casesForFunction(registry, "siteDispositionFor").sort()).toEqual(
      [...SITE_TYPES].sort(),
    );
  });
});

// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  OUTER_UI_FILE_ROLES,
  OUTER_UI_ROLE_VALUES,
  isStrictCompositionFile,
  isUniversalUiFile,
} from "../eslint-rules/ui-boundary-roles.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = resolve(ROOT, "src");
const CUMULUS_PREFIX = "src/cumulus/";

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

const GENERIC_COMPONENT_SOURCES = [
  "src/components/BattleSiteRoute.tsx",
  "src/components/CumulusQuestChrome.tsx",
  "src/components/DreamAuguryQuestMenu.ts",
  "src/components/DreamscapeQuestMenu.tsx",
  "src/components/ErrorBoundary.tsx",
  "src/components/FrontDoorRouter.tsx",
  "src/components/QuestUtilityMenuController.ts",
  "src/components/ScreenRouter.tsx",
];

const DELETED_PLAYER_UI = /\/(?:AtlasScreen|QuestStartScreen|QuestCompleteScreen|QuestFailedScreen|DreamscapeScreen|DraftSiteScreen|ShopScreen|EssenceSiteScreen|DreamsignRevelationScreen|PurgeSiteScreen|TransfigurationSiteScreen|DuplicationSiteScreen|RewardSiteScreen|StubSiteScreen|HUD|BattleStartScreen)$/;

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Production TSX and CSS outside the Cumulus ownership boundary. */
export function collectOuterUiFiles(srcRoot = SRC_ROOT) {
  return collectFiles(srcRoot)
    .filter((file) => !relative(ROOT, file).split(sep).join("/").startsWith(CUMULUS_PREFIX))
    .filter((file) => /\.(tsx|css)$/.test(file))
    .filter((file) => !/\.(test|spec)\.(tsx|css)$/.test(file))
    .map((file) => relative(ROOT, file).split(sep).join("/"))
    .sort();
}

function collectGenericComponentSources() {
  return collectFiles(resolve(SRC_ROOT, "components"))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file))
    .map((file) => relative(ROOT, file).split(sep).join("/"))
    .sort();
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
      .filter((file) => /\.(ts|tsx)$/.test(file))
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

  it("classifies every outer production UI file recursively", () => {
    expect(Object.keys(OUTER_UI_FILE_ROLES).sort()).toEqual(collectOuterUiFiles());
    for (const [file, role] of Object.entries(OUTER_UI_FILE_ROLES)) {
      expect(OUTER_UI_ROLE_VALUES).toContain(role);
      expect(file).toMatch(/^src\//);
    }
  });

  it("reserves generic components for the app shell and emergency fallback", () => {
    expect(
      collectGenericComponentSources(),
      "Reusable presentation belongs in src/cumulus/; standalone tool UI belongs under its named owner.",
    ).toEqual([...GENERIC_COMPONENT_SOURCES].sort());
  });

  it("keeps bootstrap and coop controllers outside strict presentation scope", () => {
    expect(isStrictCompositionFile("src/coop/BounceToast.tsx", [])).toBe(false);
    expect(isStrictCompositionFile("src/editor/CardEditorApp.tsx", [])).toBe(false);
    expect(isUniversalUiFile("src/editor/CardEditorApp.tsx")).toBe(true);
    expect(isUniversalUiFile("src/vendor/boxicons/boxicons.css")).toBe(false);
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

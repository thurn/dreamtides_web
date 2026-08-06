import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  regenerateAtlasData,
  regenerateConfigData,
} from "./config-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_TABULA_FILES = [
  "affiliations.toml",
  "atlas.toml",
  "dream_guides.toml",
  "dreamscapes.toml",
  "glossary.toml",
];

let tempRoot = null;

function makeFixtureRoot() {
  tempRoot = mkdtempSync(join(tmpdir(), "atlas-config-data-"));
  const tabulaDir = join(tempRoot, "data", "tabula");
  mkdirSync(tabulaDir, { recursive: true });
  mkdirSync(join(tempRoot, "public"), { recursive: true });
  for (const filename of REQUIRED_TABULA_FILES) {
    copyFileSync(
      join(ROOT, "data", "tabula", filename),
      join(tabulaDir, filename),
    );
  }
  return tempRoot;
}

function missingAssetSourceDirs(rootDir) {
  return {
    bossSceneDir: join(rootDir, "missing-scenes"),
    bossIconDir: join(rootDir, "missing-icons"),
    bossFigureDir: join(rootDir, "missing-figures"),
  };
}

function readAtlasData(rootDir) {
  return JSON.parse(
    readFileSync(join(rootDir, "public", "atlas-data.json"), "utf8"),
  );
}

afterEach(() => {
  if (tempRoot !== null) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

describe("regenerateConfigData Atlas dependencies", () => {
  it("compiles without external art and refreshes the fold hash after a dreamscape edit", () => {
    const rootDir = makeFixtureRoot();
    const options = {
      rootDir,
      atlasAssetSourceDirs: missingAssetSourceDirs(rootDir),
    };

    regenerateConfigData("atlas.toml", options);
    const before = readAtlasData(rootDir);
    expect(before.randomSite.guideId).toBe("maddox");

    const dreamscapesPath = join(rootDir, "data", "tabula", "dreamscapes.toml");
    const dreamscapes = readFileSync(dreamscapesPath, "utf8");
    const changed = dreamscapes.replace(
      'guide-id = "maddox"\nsignature-site = "RandomSite"',
      'guide-id = "gravok"\nsignature-site = "RandomSite"',
    );
    expect(changed).not.toBe(dreamscapes);
    writeFileSync(dreamscapesPath, changed);

    regenerateConfigData("dreamscapes.toml", options);
    const after = readAtlasData(rootDir);
    expect(after.randomSite.guideId).toBe("gravok");
    expect(after.foldHash).not.toBe(before.foldHash);
  });

  it("validates Atlas glossary references during a glossary-only refresh", () => {
    const rootDir = makeFixtureRoot();
    const glossaryPath = join(rootDir, "data", "tabula", "glossary.toml");
    const glossary = readFileSync(glossaryPath, "utf8");
    const changed = glossary.replace(
      'id = "site-battle"',
      'id = "removed-site-battle"',
    );
    expect(changed).not.toBe(glossary);
    writeFileSync(glossaryPath, changed);

    expect(() =>
      regenerateAtlasData({
        rootDir,
        atlasAssetSourceDirs: missingAssetSourceDirs(rootDir),
      }),
    ).toThrow(/unresolved glossary id site-battle/);
  });
});

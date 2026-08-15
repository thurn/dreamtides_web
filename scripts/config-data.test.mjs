import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  refreshGuidePortraitLinks,
  regenerateConfigData,
} from "./config-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_DATA_FILES = [
  "affiliations.toml",
  "atlas.toml",
  "dream_guides.toml",
  "dreamscapes.toml",
  "journey.toml",
  "shop_site.toml",
  "battle.toml",
  "glossary.toml",
  "sites.toml",
];

let tempRoot = null;

function makeFixtureRoot() {
  tempRoot = mkdtempSync(join(tmpdir(), "atlas-config-data-"));
  const dataDir = join(tempRoot, "data");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(tempRoot, "public"), { recursive: true });
  for (const filename of REQUIRED_DATA_FILES) {
    copyFileSync(
      join(ROOT, "data", filename),
      join(dataDir, filename),
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

function readSitesData(rootDir) {
  return JSON.parse(
    readFileSync(join(rootDir, "public", "sites-data.json"), "utf8"),
  );
}

afterEach(() => {
  if (tempRoot !== null) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

describe("regenerateConfigData Atlas dependencies", () => {
  it("relinks guide portraits from the TOML-authored source filename", () => {
    const rootDir = makeFixtureRoot();
    const sourceDir = join(rootDir, "fixture-guide-art");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "new-source.png"), "fixture image bytes");
    refreshGuidePortraitLinks(
      rootDir,
      {
        guides: [{ id: "fixture-guide", portraitSource: "new-source.png" }],
      },
      sourceDir,
    );
    expect(
      readlinkSync(
        join(rootDir, "public", "dream-guides", "fixture-guide.png"),
      ),
    ).toBe(join(sourceDir, "new-source.png"));
  });

  it("hot-regenerates economy JSON and changes its fold hash after an edit", () => {
    const rootDir = makeFixtureRoot();
    regenerateConfigData("shop_site.toml", { rootDir });
    const jsonPath = join(rootDir, "public", "economy-data.json");
    const before = JSON.parse(readFileSync(jsonPath, "utf8"));
    const sourcePath = join(rootDir, "data", "shop_site.toml");
    const source = readFileSync(sourcePath, "utf8");
    writeFileSync(
      sourcePath,
      source.replace("standard-card = 100", "standard-card = 101"),
    );
    regenerateConfigData("shop_site.toml", { rootDir });
    const after = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(after.shop.prices.standardCard).toBe(101);
    expect(after.foldHash).not.toBe(before.foldHash);
  });

  it("compiles without external art and refreshes Sites after a guide specialty swap", () => {
    const rootDir = makeFixtureRoot();
    const options = {
      rootDir,
      atlasAssetSourceDirs: missingAssetSourceDirs(rootDir),
    };

    regenerateConfigData("dream_guides.toml", options);
    const before = readSitesData(rootDir);
    const guidesPath = join(rootDir, "data", "dream_guides.toml");
    const guides = readFileSync(guidesPath, "utf8");
    const changed = guides
      .replace('site-type = "Shop"', 'site-type = "__swap__"')
      .replace('site-type = "Purge"', 'site-type = "Shop"')
      .replace('site-type = "__swap__"', 'site-type = "Purge"');
    expect(changed).not.toBe(guides);
    writeFileSync(guidesPath, changed);

    regenerateConfigData("dream_guides.toml", options);
    const after = readSitesData(rootDir);
    expect(after.guideAssignments.Shop.guideId).not.toBe(
      before.guideAssignments.Shop.guideId,
    );
    expect(after.foldHash).not.toBe(before.foldHash);
  });

  it("validates Atlas glossary references during a glossary-only refresh", () => {
    const rootDir = makeFixtureRoot();
    const glossaryPath = join(rootDir, "data", "glossary.toml");
    const glossary = readFileSync(glossaryPath, "utf8");
    const changed = glossary.replace(
      'id = "85ffab8d-f972-4340-9b45-99f6aff6ccec"',
      'id = "00000000-0000-4000-8000-000000000099"',
    );
    expect(changed).not.toBe(glossary);
    writeFileSync(glossaryPath, changed);

    expect(() => regenerateConfigData("glossary.toml", { rootDir })).toThrow(
      /unresolved glossary id 85ffab8d-f972-4340-9b45-99f6aff6ccec/,
    );
  });
});

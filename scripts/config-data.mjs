import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  transformAffiliation,
  transformDreamsignProfile,
  transformIncarnation,
  DREAMSCAPE_SCENE_ART_DIR,
  DREAMSCAPE_ICON_ART_DIR,
  DREAM_GUIDE_ART_DIR,
} from "./setup-assets.mjs";
import { collectAtlasAssetSources, compileAtlasData } from "./atlas-data.mjs";
import { compileEconomyData } from "./economy-data.mjs";
import { compileDraftData } from "./draft-data.mjs";
import { compileJourneyData } from "./journey-data.mjs";
import { compileRewardSelectionData } from "./reward-selection-data.mjs";
import { compileAuguryData } from "./augury-data.mjs";
import {
  compileGambleData,
  compileTideAlignmentsData,
  compileTransfigurationData,
} from "./data-driven-catalogs.mjs";
import {
  collectGuidePortraitSources,
  compileDreamGuidesData,
  compileSitesData,
  deriveDreamscapesData,
} from "./guide-sites-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ATLAS_DEPENDENCY_TOMLS = new Set([
  "dreamscapes.toml",
  "dream_guides.toml",
  "affiliations.toml",
]);
const GUIDE_SITE_DEPENDENCY_TOMLS = new Set([
  "dreamscapes.toml",
  "dream_guides.toml",
  "sites.toml",
  "glossary.toml",
  "economy.toml",
]);

const DEFAULT_ATLAS_ASSET_SOURCE_DIRS = {
  bossSceneDir: DREAMSCAPE_SCENE_ART_DIR,
  bossIconDir: DREAMSCAPE_ICON_ART_DIR,
  bossFigureDir: DREAM_GUIDE_ART_DIR,
};

function parsedArray(dataDir, filename, key) {
  const value = parse(readFileSync(join(dataDir, filename), "utf8"))[key];
  if (!Array.isArray(value)) {
    throw new Error(`Expected [[${key}]] array in ${filename}`);
  }
  return value;
}

function compileAtlasAtRoot(rootDir, atlasAssetSourceDirs) {
  const dataDir = join(rootDir, "data");
  const atlasSource = parse(readFileSync(join(dataDir, "atlas.toml"), "utf8"));
  const assetSources = collectAtlasAssetSources(atlasAssetSourceDirs);
  return compileAtlasData(atlasSource, {
    dreamscapes: compileGuideSiteCatalogsAtRoot(rootDir).dreamscapes,
    affiliations: parsedArray(dataDir, "affiliations.toml", "affiliations"),
    ...(assetSources === undefined ? {} : { assetSources }),
  });
}

function compileGuideSiteCatalogsAtRoot(rootDir) {
  const dataDir = join(rootDir, "data");
  const rawDreamscapes = parsedArray(
    dataDir,
    "dreamscapes.toml",
    "dreamscapes",
  );
  const guides = compileDreamGuidesData(
    parse(readFileSync(join(dataDir, "dream_guides.toml"), "utf8")),
    {
      dreamscapes: rawDreamscapes,
      portraitSources: collectGuidePortraitSources(DREAM_GUIDE_ART_DIR),
    },
  );
  const dreamscapes = deriveDreamscapesData(rawDreamscapes, guides);
  const economy = compileEconomyData(
    parse(readFileSync(join(dataDir, "economy.toml"), "utf8")),
  );
  const sites = compileSitesData(
    parse(readFileSync(join(dataDir, "sites.toml"), "utf8")),
    {
      guides,
      dreamscapes,
      economy,
      glossaryIds: parsedArray(dataDir, "glossary.toml", "entries").map(
        (entry) => entry.id,
      ),
    },
  );
  return { guides, dreamscapes, sites, economy };
}

export function refreshGuidePortraitLinks(
  rootDir,
  guides,
  sourceDir = DREAM_GUIDE_ART_DIR,
) {
  const destinationDir = join(rootDir, "public", "dream-guides");
  mkdirSync(destinationDir, { recursive: true });
  for (const guide of guides.guides) {
    const source = join(sourceDir, guide.portraitSource);
    if (!existsSync(source)) continue;
    const destination = join(destinationDir, `${guide.id}.png`);
    rmSync(destination, { force: true });
    symlinkSync(source, destination);
  }
}

/**
 * The hot-reloadable journey configuration TOMLs: each one parses to a single JSON
 * catalog the runtime fetches, with no image work, card-id cross-validation, or
 * other build steps in between. `setup-assets.mjs` regenerates these as part of
 * the full asset build; this registry lets the dev server regenerate one of them
 * on its own when only that TOML is edited (see `configDataHotReloadPlugin` in
 * vite.config.ts), so a config edit reaches the running app without a server
 * restart or a full `setup-assets` run. Atlas and economy use their shared
 * strict compilers while the smaller catalogs use their exported transforms.
 *
 * Each entry transforms with the same exported function `setup-assets.mjs` uses,
 * and writes with the same `JSON.stringify(x, null, 2) + "\n"` formatting, so the
 * file a hot-reload regenerate produces is byte-identical to the one the full
 * build produces. Changes to catalogs referenced by Atlas compilation also
 * refresh atlas-data.json before the app reloads.
 *
 * `arrayKey` names the top-level TOML array to map over; `null` means the whole
 * parsed table is transformed as a single object.
 */
export const SIMPLE_CONFIGS = [
  {
    tomlFile: "gamble.toml",
    jsonFile: "gamble-data.json",
    arrayKey: null,
    transform: compileGambleData,
  },
  {
    tomlFile: "transfiguration.toml",
    jsonFile: "transfiguration-data.json",
    arrayKey: null,
    transform: compileTransfigurationData,
  },
  {
    tomlFile: "tide_alignments.toml",
    jsonFile: "tide-alignments-data.json",
    arrayKey: null,
    transform: compileTideAlignmentsData,
  },
  {
    tomlFile: "dreamscapes.toml",
    jsonFile: "dreamscapes-data.json",
    arrayKey: "dreamscapes",
    transform: null,
  },
  {
    tomlFile: "dream_guides.toml",
    jsonFile: "dream-guides-data.json",
    arrayKey: null,
    transform: null,
  },
  {
    tomlFile: "sites.toml",
    jsonFile: "sites-data.json",
    arrayKey: null,
    transform: null,
  },
  {
    tomlFile: "affiliations.toml",
    jsonFile: "affiliations-data.json",
    arrayKey: "affiliations",
    transform: transformAffiliation,
  },
  {
    tomlFile: "atlas.toml",
    jsonFile: "atlas-data.json",
    arrayKey: null,
    transform: null,
  },
  {
    tomlFile: "economy.toml",
    jsonFile: "economy-data.json",
    arrayKey: null,
    transform: compileEconomyData,
  },
  {
    tomlFile: "draft.toml",
    jsonFile: "draft-data.json",
    arrayKey: null,
    transform: compileDraftData,
  },
  {
    tomlFile: "journey.toml",
    jsonFile: "journey-data.json",
    arrayKey: null,
    transform: compileJourneyData,
  },
  {
    tomlFile: "reward_selection.toml",
    jsonFile: "reward-selection-data.json",
    arrayKey: null,
    transform: compileRewardSelectionData,
  },
  {
    tomlFile: "augury.toml",
    jsonFile: "augury-data.json",
    arrayKey: null,
    transform: compileAuguryData,
  },
  {
    tomlFile: "apollyon_incarnations.toml",
    jsonFile: "apollyon-incarnations-data.json",
    arrayKey: "incarnations",
    transform: transformIncarnation,
  },
  {
    tomlFile: "dreamsign_profiles.toml",
    jsonFile: "dreamsign-profiles-data.json",
    arrayKey: "dreamsigns",
    transform: transformDreamsignProfile,
  },
  {
    tomlFile: "dreamsign_signatures.toml",
    jsonFile: "dreamsign-signatures-data.json",
    arrayKey: "dreamsigns",
    transform: transformDreamsignProfile,
  },
];

const CONFIG_BY_TOML = new Map(
  SIMPLE_CONFIGS.map((config) => [config.tomlFile, config]),
);

/** The TOML basenames that {@link regenerateConfigData} knows how to rebuild. */
export const SIMPLE_CONFIG_TOML_BASENAMES = SIMPLE_CONFIGS.map(
  (config) => config.tomlFile,
);

/**
 * The generated JSON paths these configs produce. The dev watcher ignores them
 * so regenerating one does not trigger Vite's own full-page reload on top of the
 * targeted `config-data:changed` event.
 */
export function generatedConfigDataWatchPaths({ rootDir = ROOT } = {}) {
  return SIMPLE_CONFIGS.map((config) =>
    join(rootDir, "public", config.jsonFile),
  );
}

/** Recompile Atlas JSON after a referenced catalog changes. */
export function regenerateAtlasData({
  rootDir = ROOT,
  atlasAssetSourceDirs = DEFAULT_ATLAS_ASSET_SOURCE_DIRS,
} = {}) {
  const jsonPath = join(rootDir, "public", "atlas-data.json");
  const result = compileAtlasAtRoot(rootDir, atlasAssetSourceDirs);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + "\n");
  return jsonPath;
}

/** Recompile sites.json and every canonical guide-derived artifact. */
export function regenerateSitesData({ rootDir = ROOT } = {}) {
  const compiled = compileGuideSiteCatalogsAtRoot(rootDir);
  const publicDir = join(rootDir, "public");
  writeFileSync(
    join(publicDir, "dream-guides-data.json"),
    JSON.stringify(compiled.guides, null, 2) + "\n",
  );
  writeFileSync(
    join(publicDir, "dreamscapes-data.json"),
    JSON.stringify(compiled.dreamscapes, null, 2) + "\n",
  );
  writeFileSync(
    join(publicDir, "sites-data.json"),
    JSON.stringify(compiled.sites, null, 2) + "\n",
  );
  return join(publicDir, "sites-data.json");
}

/**
 * Regenerate the runtime JSON catalog for one config TOML and return its written
 * path. Atlas dependencies also refresh atlas-data.json. Throws if
 * `tomlBasename` is unknown or its expected top-level array is missing.
 */
export function regenerateConfigData(
  tomlBasename,
  {
    rootDir = ROOT,
    atlasAssetSourceDirs = DEFAULT_ATLAS_ASSET_SOURCE_DIRS,
  } = {},
) {
  if (tomlBasename === "glossary.toml") {
    return regenerateSitesData({ rootDir });
  }
  const config = CONFIG_BY_TOML.get(tomlBasename);
  if (config === undefined) {
    throw new Error(`No simple config registered for ${tomlBasename}`);
  }

  const tomlPath = join(rootDir, "data", config.tomlFile);
  const jsonPath = join(rootDir, "public", config.jsonFile);
  const parsed = parse(readFileSync(tomlPath, "utf8"));

  let result;
  if (GUIDE_SITE_DEPENDENCY_TOMLS.has(config.tomlFile)) {
    const compiled = compileGuideSiteCatalogsAtRoot(rootDir);
    const publicDir = join(rootDir, "public");
    writeFileSync(
      join(publicDir, "dream-guides-data.json"),
      JSON.stringify(compiled.guides, null, 2) + "\n",
    );
    writeFileSync(
      join(publicDir, "dreamscapes-data.json"),
      JSON.stringify(compiled.dreamscapes, null, 2) + "\n",
    );
    writeFileSync(
      join(publicDir, "sites-data.json"),
      JSON.stringify(compiled.sites, null, 2) + "\n",
    );
    if (config.tomlFile === "economy.toml") {
      result = compiled.economy;
    } else if (config.tomlFile === "dream_guides.toml") {
      result = compiled.guides;
      refreshGuidePortraitLinks(rootDir, compiled.guides);
    } else if (config.tomlFile === "dreamscapes.toml") {
      result = compiled.dreamscapes;
    } else {
      result = compiled.sites;
    }
  } else if (config.tomlFile === "atlas.toml") {
    result = compileAtlasAtRoot(rootDir, atlasAssetSourceDirs);
  } else if (config.arrayKey === null) {
    result = config.transform(parsed);
  } else {
    const records = parsed[config.arrayKey];
    if (!Array.isArray(records)) {
      throw new Error(
        `Expected [[${config.arrayKey}]] array in ${config.tomlFile}`,
      );
    }
    result = records.map((record) => config.transform(record));
  }

  const dependentAtlasData = ATLAS_DEPENDENCY_TOMLS.has(tomlBasename)
    ? compileAtlasAtRoot(rootDir, atlasAssetSourceDirs)
    : null;
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + "\n");
  if (dependentAtlasData !== null) {
    writeFileSync(
      join(rootDir, "public", "atlas-data.json"),
      JSON.stringify(dependentAtlasData, null, 2) + "\n",
    );
  }
  return jsonPath;
}

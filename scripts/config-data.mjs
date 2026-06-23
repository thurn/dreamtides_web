import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  transformAffiliation,
  transformAtlasConfig,
  transformDreamscape,
  transformDreamsignProfile,
  transformGuide,
  transformIncarnation,
} from "./setup-assets.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The "simple" Dream Atlas config TOMLs: each one parses to a single JSON
 * catalog the runtime fetches, with no image work, card-id cross-validation, or
 * other build steps in between. `setup-assets.mjs` regenerates these as part of
 * the full asset build; this registry lets the dev server regenerate one of them
 * on its own when only that TOML is edited (see `configDataHotReloadPlugin` in
 * vite.config.ts), so a config edit reaches the running app without a server
 * restart or a full `setup-assets` run.
 *
 * Each entry transforms with the same exported function `setup-assets.mjs` uses,
 * and writes with the same `JSON.stringify(x, null, 2) + "\n"` formatting, so the
 * file a hot-reload regenerate produces is byte-identical to the one the full
 * build produces.
 *
 * `arrayKey` names the top-level TOML array to map over; `null` means the whole
 * parsed table is transformed as a single object.
 */
export const SIMPLE_CONFIGS = [
  {
    tomlFile: "dreamscapes.toml",
    jsonFile: "dreamscapes-data.json",
    arrayKey: "dreamscapes",
    transform: transformDreamscape,
  },
  {
    tomlFile: "dream_guides.toml",
    jsonFile: "dream-guides-data.json",
    arrayKey: "guides",
    transform: transformGuide,
  },
  {
    tomlFile: "affiliations.toml",
    jsonFile: "affiliations-data.json",
    arrayKey: "affiliations",
    transform: transformAffiliation,
  },
  {
    tomlFile: "atlas_config.toml",
    jsonFile: "atlas-config-data.json",
    arrayKey: null,
    transform: transformAtlasConfig,
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

/**
 * Regenerate the single runtime JSON catalog for one simple config TOML and
 * return the written path. Throws if `tomlBasename` is not a known simple config
 * or its expected top-level array is missing.
 */
export function regenerateConfigData(tomlBasename, { rootDir = ROOT } = {}) {
  const config = CONFIG_BY_TOML.get(tomlBasename);
  if (config === undefined) {
    throw new Error(`No simple config registered for ${tomlBasename}`);
  }

  const tomlPath = join(rootDir, "data", "tabula", config.tomlFile);
  const jsonPath = join(rootDir, "public", config.jsonFile);
  const parsed = parse(readFileSync(tomlPath, "utf8"));

  let result;
  if (config.arrayKey === null) {
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

  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + "\n");
  return jsonPath;
}

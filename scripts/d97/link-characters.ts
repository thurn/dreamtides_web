// Resolves every D97 character sprite recipe (src/content/d97/characters/,
// the development recipes included)
// against the local Universal LPC Spritesheet Character Generator, links
// exactly the sheets they use into gitignored `public/d97/characters/sheets/`
// and writes `public/d97/characters/manifest.json`, at workspace preparation
// and on demand (`npm run d97:characters`). The generator's other sheets stay
// unserved. A missing library or sheet is recorded in the manifest and warned
// about; the overworld draws those characters as capsules. It also folds the
// generator's CREDITS.csv into `public/d97/characters/credits.json`: the
// authors, licenses and pages of exactly the used sheets
// (./character-credits.ts), which the credits screen lists (P23). Without the
// library or its CREDITS.csv no credits file is written.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { D97_CHARACTER_SPRITES } from "../../src/content/d97/characters/index.ts";
import { DEV_KNIGHT, DEV_VILLAGER } from "../../src/content/d97/characters/development.ts";
import {
  CHARACTER_MANIFEST_FORMAT,
  CHARACTER_SHEETS_PATH,
  type CharacterManifest,
  type ManifestCharacter,
} from "../../src/d97/overworld/characters/manifest.ts";
import { CHARACTER_GENERATOR_DIRECTORY } from "../../src/d97/overworld/characters/credits.ts";
import { resolveCharacterSprite, type LpcLibrary } from "../../src/d97/overworld/characters/resolve-recipe.ts";
import type { D97CharacterId, LpcSheetKey } from "../../src/types/identifiers.ts";
import type { CharacterSprite } from "../../src/content/d97/characters/schema.ts";
import { defaultArtPaths } from "../setup-assets.ts";
import { creditsForSheets, parseCreditsCsv } from "./character-credits.ts";

/** The catalog's recipes and the development recipes development builds draw. */
const RECIPES = [...D97_CHARACTER_SPRITES, DEV_KNIGHT, DEV_VILLAGER];

function definitionsIndex(root: string): Map<string, string> {
  const index = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".json") && !entry.name.startsWith("meta_")) {
        index.set(entry.name.slice(0, -".json".length), path);
      }
    }
  };
  walk(root);
  return index;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function generatorLibrary(generator: string): LpcLibrary {
  const definitions = definitionsIndex(join(generator, "sheet_definitions"));
  const palettes = new Map<string, Readonly<Record<string, readonly string[]>> | null>();
  return {
    definition: (key: LpcSheetKey) => {
      const path = definitions.get(key);
      return path === undefined ? null : readJson(path);
    },
    palettes: (material, set) => {
      const key = `${material}/${material}_${set}`;
      if (!palettes.has(key)) {
        const json = readJson(join(generator, "palette_definitions", `${key}.json`));
        palettes.set(key, typeof json === "object" && json !== null ? (json as Record<string, readonly string[]>) : null);
      }
      return palettes.get(key) ?? null;
    },
    material: (material) => {
      const json = readJson(join(generator, "palette_definitions", material, `meta_${material}.json`));
      if (typeof json !== "object" || json === null) return null;
      const meta = json as { default?: unknown; base?: unknown };
      return typeof meta.default === "string" && typeof meta.base === "string"
        ? { default: meta.default, base: meta.base }
        : null;
    },
    sheetExists: (path) => existsSync(join(generator, "spritesheets", path)),
  };
}

function writeJson(outDir: string, name: string, value: unknown): void {
  const temporary = join(outDir, `.${name}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value)}\n`);
  renameSync(temporary, join(outDir, name));
}

/** What one linking pass did, for its report. */
export interface LinkCharactersResult {
  readonly linked: number;
  /** Null when no credits were written (no library or no CREDITS.csv). */
  readonly credits: { readonly sheets: number; readonly unmatched: readonly string[]; readonly authors: number } | null;
}

/**
 * Resolve `recipes` against the generator checkout at `generator`, link their
 * sheets under `outDir/sheets/` and write `outDir/manifest.json` and, when
 * the generator has its CREDITS.csv, `outDir/credits.json`.
 */
export function linkCharacters(generator: string, outDir: string, recipes: readonly CharacterSprite[]): LinkCharactersResult {
  const sheetsDir = join(outDir, "sheets");
  const characters: Partial<Record<D97CharacterId, ManifestCharacter>> = {};
  if (!existsSync(join(generator, "sheet_definitions"))) {
    // A pass without the library (a review's empty asset cache) keeps the
    // last pass's sheets, manifest and credits; only a workspace that has
    // none gets the capsule manifest.
    console.warn(`  Warning: LPC character generator not found at ${generator}; D97 characters keep their last linked sheets, or draw as capsules`);
    if (!existsSync(join(outDir, "manifest.json"))) {
      mkdirSync(outDir, { recursive: true });
      for (const recipe of recipes) characters[recipe.id] = { layers: [], missing: ["no character generator library"] };
      writeJson(outDir, "manifest.json", { format: CHARACTER_MANIFEST_FORMAT, characters } satisfies CharacterManifest);
    }
    return { linked: 0, credits: null };
  }
  rmSync(sheetsDir, { recursive: true, force: true });
  rmSync(join(outDir, "credits.json"), { force: true });
  mkdirSync(sheetsDir, { recursive: true });
  const library = generatorLibrary(generator);
  let linked = 0;
  const used = new Set<string>();
  /** Link `sheet` (spritesheets-relative) and return its served URL. */
  const link = (sheet: string): string => {
    used.add(sheet);
    const target = join(sheetsDir, sheet);
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(join(generator, "spritesheets", sheet), target);
      linked += 1;
    }
    return `${CHARACTER_SHEETS_PATH}${relative(sheetsDir, target).split("\\").join("/")}`;
  };
  for (const recipe of recipes) {
    const resolved = resolveCharacterSprite(recipe, library);
    for (const reason of resolved.missing) console.warn(`  Warning: D97 character ${recipe.id}: ${reason}`);
    characters[recipe.id] = {
      missing: resolved.missing,
      layers: resolved.layers.map((layer) => ({
        zPos: layer.zPos,
        recolor: layer.recolor,
        sheets: { walk: link(layer.sheets.walk), idle: layer.sheets.idle === null ? null : link(layer.sheets.idle) },
      })),
    };
  }
  const manifest: CharacterManifest = { format: CHARACTER_MANIFEST_FORMAT, characters };
  writeJson(outDir, "manifest.json", manifest);

  const csvPath = join(generator, "CREDITS.csv");
  if (!existsSync(csvPath)) {
    console.warn(`  Warning: ${csvPath} not found; the D97 credits list the generator's contributors in summary`);
    return { linked, credits: null };
  }
  const credits = creditsForSheets(parseCreditsCsv(readFileSync(csvPath, "utf8")), used);
  for (const sheet of credits.unmatched) console.warn(`  Warning: no CREDITS.csv row credits D97 character sheet ${sheet}`);
  writeJson(outDir, "credits.json", credits);
  return { linked, credits: { sheets: credits.sheets, unmatched: credits.unmatched, authors: credits.authors.length } };
}

function main(): void {
  const root = resolve(import.meta.dirname, "../..");
  const home = resolve(process.env.DREAMTIDES_LOCAL_ASSET_HOME ?? homedir());
  const paths = defaultArtPaths(root, home);
  const result = linkCharacters(join(paths.d97ArtLibraryDir, CHARACTER_GENERATOR_DIRECTORY), paths.d97CharactersDir, RECIPES);
  console.log(`Resolved ${String(RECIPES.length)} D97 character recipes; linked ${String(result.linked)} sheets`);
  if (result.credits !== null) {
    const { sheets, unmatched, authors } = result.credits;
    console.log(
      `Credited ${String(sheets - unmatched.length)} of ${String(sheets)} D97 character sheets (${String(unmatched.length)} without a CREDITS.csv row) to ${String(authors)} authors`,
    );
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

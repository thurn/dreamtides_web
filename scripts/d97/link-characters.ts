// Resolves every D97 character sprite recipe (src/content/d97/characters/,
// the development recipes included)
// against the local Universal LPC Spritesheet Character Generator, links
// exactly the sheets they use into gitignored `public/d97/characters/sheets/`
// and writes `public/d97/characters/manifest.json`, at workspace preparation
// and on demand (`npm run d97:characters`). The generator's other sheets stay
// unserved. A missing library or sheet is recorded in the manifest and warned
// about; the overworld draws those characters as capsules.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { D97_CHARACTER_SPRITES } from "../../src/content/d97/characters/index.ts";
import { DEV_KNIGHT, DEV_VILLAGER } from "../../src/content/d97/characters/development.ts";
import {
  CHARACTER_MANIFEST_FORMAT,
  CHARACTER_SHEETS_PATH,
  type CharacterManifest,
  type ManifestCharacter,
} from "../../src/d97/overworld/characters/manifest.ts";
import { resolveCharacterSprite, type LpcLibrary } from "../../src/d97/overworld/characters/resolve-recipe.ts";
import type { D97CharacterId, LpcSheetKey } from "../../src/types/identifiers.ts";
import { defaultArtPaths } from "../setup-assets.ts";

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

function main(): void {
  const root = resolve(import.meta.dirname, "../..");
  const home = resolve(process.env.DREAMTIDES_LOCAL_ASSET_HOME ?? homedir());
  const paths = defaultArtPaths(root, home);
  const generator = join(paths.d97ArtLibraryDir, "ulpc-generator");
  const outDir = paths.d97CharactersDir;
  const sheetsDir = join(outDir, "sheets");
  rmSync(sheetsDir, { recursive: true, force: true });
  mkdirSync(sheetsDir, { recursive: true });

  const characters: Partial<Record<D97CharacterId, ManifestCharacter>> = {};
  const available = existsSync(join(generator, "sheet_definitions"));
  if (!available) {
    console.warn(`  Warning: LPC character generator not found at ${generator}; D97 characters draw as capsules`);
  }
  const library = available ? generatorLibrary(generator) : null;
  let linked = 0;
  /** Link `sheet` (spritesheets-relative) and return its served URL. */
  const link = (sheet: string): string => {
    const target = join(sheetsDir, sheet);
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(join(generator, "spritesheets", sheet), target);
      linked += 1;
    }
    return `${CHARACTER_SHEETS_PATH}${relative(sheetsDir, target).split("\\").join("/")}`;
  };
  for (const recipe of RECIPES) {
    if (library === null) {
      characters[recipe.id] = { layers: [], missing: ["no character generator library"] };
      continue;
    }
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
  const temporary = join(outDir, ".manifest.json.tmp");
  writeFileSync(temporary, `${JSON.stringify(manifest)}\n`);
  renameSync(temporary, join(outDir, "manifest.json"));
  console.log(`Resolved ${String(RECIPES.length)} D97 character recipes; linked ${String(linked)} sheets`);
}

main();

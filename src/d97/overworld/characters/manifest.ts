// The character manifest workspace preparation writes to
// `public/d97/characters/manifest.json`: every catalog recipe resolved into
// served sheet URLs, z-order and color swaps, or the reasons it could not be.
// The format number names the JSON shape; a manifest of any other format
// (one written before the shape changed) parses to null and draws capsules
// until workspace preparation rewrites it.

import { parseD97CharacterId, type D97CharacterId } from "../../../types/identifiers";
import type { LayerSheets } from "./resolve-recipe";

/** Format 2: a layer's idle sheet may be null (its walk sheet's standing frame is the idle pose). */
export const CHARACTER_MANIFEST_FORMAT = 2;

/** Where linked sheets are served, under the art origin. */
export const CHARACTER_SHEETS_PATH = "/d97/characters/sheets/";

export interface ManifestLayer {
  readonly zPos: number;
  /** Root-relative sheet URLs. */
  readonly sheets: LayerSheets;
  readonly recolor: readonly (readonly [string, string])[];
}

export interface ManifestCharacter {
  readonly layers: readonly ManifestLayer[];
  readonly missing: readonly string[];
}

export interface CharacterManifest {
  readonly format: typeof CHARACTER_MANIFEST_FORMAT;
  readonly characters: Readonly<Partial<Record<D97CharacterId, ManifestCharacter>>>;
}

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLayer(value: unknown): ManifestLayer | null {
  if (!isJson(value) || typeof value.zPos !== "number" || !isJson(value.sheets) || !Array.isArray(value.recolor)) {
    return null;
  }
  const { walk, idle } = value.sheets;
  if (typeof walk !== "string" || (idle !== null && typeof idle !== "string")) return null;
  const recolor: (readonly [string, string])[] = [];
  for (const pair of value.recolor) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string") {
      return null;
    }
    recolor.push([pair[0], pair[1]]);
  }
  return { zPos: value.zPos, sheets: { walk, idle }, recolor };
}

function parseCharacter(value: unknown): ManifestCharacter | null {
  if (!isJson(value) || !Array.isArray(value.layers) || !Array.isArray(value.missing)) return null;
  const layers = value.layers.map(parseLayer);
  const missing = value.missing.filter((reason): reason is string => typeof reason === "string");
  if (layers.some((layer) => layer === null) || missing.length !== value.missing.length) return null;
  return { layers: layers.filter((layer) => layer !== null), missing };
}

/** The manifest in `json`, or null when it is malformed or of another format. */
export function parseCharacterManifest(json: unknown): CharacterManifest | null {
  if (!isJson(json) || json.format !== CHARACTER_MANIFEST_FORMAT || !isJson(json.characters)) return null;
  const characters: Partial<Record<D97CharacterId, ManifestCharacter>> = {};
  for (const [key, value] of Object.entries(json.characters)) {
    const character = parseCharacter(value);
    if (character === null) return null;
    let id: D97CharacterId;
    try {
      id = parseD97CharacterId(key);
    } catch {
      return null;
    }
    characters[id] = character;
  }
  return { format: CHARACTER_MANIFEST_FORMAT, characters };
}

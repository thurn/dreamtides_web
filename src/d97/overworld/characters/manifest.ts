// The character manifest workspace preparation writes to
// `public/d97/characters/manifest.json`: every catalog recipe resolved into
// served sheet URLs, z-order and color swaps, or the reasons it could not be.

import type { D97CharacterId } from "../../../types/identifiers";
import type { CharacterAnimation } from "./resolve-recipe";

export const CHARACTER_MANIFEST_FORMAT = 1;

/** Where linked sheets are served, under the art origin. */
export const CHARACTER_SHEETS_PATH = "/d97/characters/sheets/";

export interface ManifestLayer {
  readonly zPos: number;
  /** Root-relative sheet URLs per animation. */
  readonly sheets: Readonly<Record<CharacterAnimation, string>>;
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

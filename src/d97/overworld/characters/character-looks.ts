// Loads characters' looks from the character manifest: each layer's walk and
// idle sheets, recolored by its palette swaps and cut into 64×64 frames. A
// character the manifest lacks, or whose recipe names missing sheets, has no
// look; the overworld draws it as a capsule and logs a warning.

import { Rectangle, Texture } from "pixi.js";
import { logEvent } from "../../../logging";
import { assetUrl } from "../../../runtime/asset-url";
import { loadSheetImage, recolorSheet } from "../../../cumulus/primitives/lpc-character";
import type { D97CharacterId } from "../../../types/identifiers";
import { ANIMATION_COLUMNS, CHARACTER_FRAME_SIZE } from "./animation";
import type { CharacterManifest, ManifestLayer } from "./manifest";
import type { CharacterAnimation } from "./resolve-recipe";

export interface CharacterLookLayer {
  readonly zPos: number;
  /** Frames by animation, then facing row, then column. */
  readonly frames: Readonly<Record<CharacterAnimation, readonly (readonly Texture[])[]>>;
}

export interface CharacterLook {
  /** Bottom first, in the generator's z-order. */
  readonly layers: readonly CharacterLookLayer[];
}

export type CharacterLooks = ReadonlyMap<D97CharacterId, CharacterLook | null>;

/** Whether the manifest can draw `id`, and if not, why. */
export function manifestEntry(
  manifest: CharacterManifest | null,
  id: D97CharacterId,
): { readonly layers: readonly ManifestLayer[] } | { readonly missing: readonly string[] } {
  if (manifest === null) return { missing: ["no character manifest"] };
  const entry = manifest.characters[id];
  if (entry === undefined) return { missing: ["no recipe for this character"] };
  if (entry.missing.length > 0) return { missing: entry.missing };
  if (entry.layers.length === 0) return { missing: ["recipe has no layers"] };
  return { layers: entry.layers };
}

async function loadManifest(): Promise<CharacterManifest | null> {
  try {
    const response = await fetch(assetUrl("/d97/characters/manifest.json"));
    return response.ok ? ((await response.json()) as CharacterManifest) : null;
  } catch {
    return null;
  }
}

function frames(source: Texture, animation: CharacterAnimation): Texture[][] {
  const rows: Texture[][] = [];
  for (let row = 0; row < 4; row += 1) {
    const columns: Texture[] = [];
    for (let column = 0; column < ANIMATION_COLUMNS[animation]; column += 1) {
      columns.push(
        new Texture({
          source: source.source,
          frame: new Rectangle(column * CHARACTER_FRAME_SIZE, row * CHARACTER_FRAME_SIZE, CHARACTER_FRAME_SIZE, CHARACTER_FRAME_SIZE),
        }),
      );
    }
    rows.push(columns);
  }
  return rows;
}

/** Load the looks of `ids`; never rejects. */
export async function loadCharacterLooks(ids: Iterable<D97CharacterId>): Promise<CharacterLooks> {
  const manifest = await loadManifest();
  const sheets = new Map<string, Promise<Texture>>();
  const sheet = (url: string, swaps: readonly (readonly [string, string])[]) => {
    const key = `${url}|${swaps.map((pair) => pair.join(">")).join(",")}`;
    let texture = sheets.get(key);
    if (texture === undefined) {
      texture = loadSheetImage(url).then((image) => {
        const loaded = Texture.from(recolorSheet(image, swaps));
        loaded.source.scaleMode = "nearest";
        return loaded;
      });
      sheets.set(key, texture);
    }
    return texture;
  };
  const looks = new Map<D97CharacterId, CharacterLook | null>();
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const entry = manifestEntry(manifest, id);
      if ("missing" in entry) {
        logEvent("d97_character_sprite_missing", { characterId: id, reasons: entry.missing });
        looks.set(id, null);
        return;
      }
      try {
        const layers = await Promise.all(
          entry.layers.map(async (layer): Promise<CharacterLookLayer> => {
            const [walk, idle] = await Promise.all([
              sheet(layer.sheets.walk, layer.recolor),
              sheet(layer.sheets.idle, layer.recolor),
            ]);
            return { zPos: layer.zPos, frames: { walk: frames(walk, "walk"), idle: frames(idle, "idle") } };
          }),
        );
        looks.set(id, { layers });
      } catch (error) {
        logEvent("d97_character_sprite_missing", {
          characterId: id,
          reasons: [error instanceof Error ? error.message : String(error)],
        });
        looks.set(id, null);
      }
    }),
  );
  return looks;
}

// Textures for a compiled map's tilesets. A tileset draws only when its
// library source is linked (public/d97/art-library.json) and its image loads;
// otherwise its tiles are skipped and the placeholder ground shows through.

import { Assets, Rectangle, Texture } from "pixi.js";
import { logEvent } from "../../logging";
import { assetUrl } from "../../runtime/asset-url";
import type { CompiledDreamMap, CompiledTileset } from "../map/compiled";
import { gidWithoutFlags } from "../map/tiled";
import { tileFrames } from "./tile-frames";

/** Gid (without flags) to texture lookup for one map. */
export interface TileTextures {
  readonly get: (gid: number) => Texture | null;
  /** Tilesets that drew nothing, for logs. */
  readonly missing: readonly string[];
}

const EMPTY: TileTextures = { get: () => null, missing: [] };

async function linkedSources(): Promise<ReadonlySet<string>> {
  try {
    const response = await fetch(assetUrl("/d97/art-library.json"));
    if (!response.ok) return new Set();
    const json: unknown = await response.json();
    const sources = typeof json === "object" && json !== null && "sources" in json ? json.sources : null;
    return new Set(Array.isArray(sources) ? sources.filter((entry): entry is string => typeof entry === "string") : []);
  } catch {
    return new Set();
  }
}

function frames(tileset: CompiledTileset, source: Texture): Map<number, Texture> {
  const out = new Map<number, Texture>();
  for (const { gid, x, y } of tileFrames(tileset, source.width, source.height)) {
    out.set(
      gid,
      new Texture({ source: source.source, frame: new Rectangle(x, y, tileset.tileWidth, tileset.tileHeight) }),
    );
  }
  return out;
}

/** Load every drawable tileset of `map`; never rejects. */
export async function loadTileTextures(map: CompiledDreamMap): Promise<TileTextures> {
  if (map.tilesets.length === 0) return EMPTY;
  const linked = await linkedSources();
  const byGid = new Map<number, Texture>();
  const missing: string[] = [];
  const load = async (path: string): Promise<Texture | null> => {
    if (!linked.has(path.split("/")[0] ?? "")) return null;
    try {
      const texture = await Assets.load<Texture>(assetUrl(`/d97/${path}`));
      texture.source.scaleMode = "nearest";
      return texture;
    } catch {
      return null;
    }
  };
  await Promise.all(
    map.tilesets.map(async (tileset) => {
      if (tileset.image !== null) {
        const texture = await load(tileset.image);
        if (texture === null) missing.push(tileset.name);
        else for (const [gid, frame] of frames(tileset, texture)) byGid.set(gid, frame);
        return;
      }
      for (const tile of tileset.tileImages) {
        const texture = await load(tile.image);
        if (texture === null) missing.push(`${tileset.name}#${String(tile.id)}`);
        else byGid.set(tileset.firstGid + tile.id, texture);
      }
    }),
  );
  if (missing.length > 0) {
    logEvent("d97_overworld_art_missing", { mapId: map.id, tilesets: missing });
  }
  return { get: (gid) => byGid.get(gidWithoutFlags(gid)) ?? null, missing };
}

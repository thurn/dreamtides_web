// The compiled D97 map: what the recipe compiler writes to the gitignored
// `public/d97/maps/<map-id>.json` at workspace preparation and what the
// overworld renderer, the map tools and pathfinding read. Plain JSON data.

import type {
  DreamAnchorId,
  DreamMapId,
  DreamMapSourceHash,
} from "../../types/identifiers";
import type {
  DreamAnchorKind,
  DreamMapLandmark,
  DreamMapRegion,
  TilePoint,
} from "./definition";

/** Bumped whenever the compiled shape changes. */
export const COMPILED_DREAM_MAP_FORMAT = 1;

export interface CompiledTileset {
  readonly firstGid: number;
  readonly name: string;
  /** Library-relative sheet image; null for an image collection. */
  readonly image: string | null;
  readonly imageWidth: number;
  readonly imageHeight: number;
  /** Tile size, which may exceed the map's (oversized tiles draw bottom-left aligned). */
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly columns: number;
  readonly tileCount: number;
  readonly spacing: number;
  readonly margin: number;
  readonly tileOffset: { readonly x: number; readonly y: number };
  /** An image collection's per-tile images. */
  readonly tileImages: readonly {
    readonly id: number;
    readonly image: string;
    readonly width: number;
    readonly height: number;
  }[];
}

export interface CompiledTileLayer {
  readonly name: string;
  /** Row-major gids with Tiled flip flags, `width × height`. */
  readonly gids: readonly number[];
  readonly opacity: number;
  readonly offset: { readonly x: number; readonly y: number };
  /** Drawn after (above) the player and characters. */
  readonly above: boolean;
}

/** A Tiled tile object (a free-placed prop), y-sorted by the renderer. */
export interface CompiledTileObject {
  readonly gid: number;
  /** Pixel x of the left edge. */
  readonly x: number;
  /** Pixel y of the bottom edge, as Tiled places tile objects. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly layer: string;
  readonly above: boolean;
}

export interface CompiledAnchor {
  readonly id: DreamAnchorId;
  readonly kind: DreamAnchorKind;
  readonly at: TilePoint;
  /** A door's arrival tile. */
  readonly entry?: TilePoint;
  /** A guardian's blocked door. */
  readonly blocksDoor?: DreamAnchorId;
  /** A chest's guardian. */
  readonly behindGuardian?: DreamAnchorId;
  /** A friendly anchor's cluster tag. */
  readonly cluster?: string;
}

export interface CompiledDreamMap {
  readonly format: typeof COMPILED_DREAM_MAP_FORMAT;
  readonly id: DreamMapId;
  /** The pinned source hash, or null for a blank-canvas map. */
  readonly sourceSha256: DreamMapSourceHash | null;
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tilesets: readonly CompiledTileset[];
  /** Draw order, bottom first; above-player layers follow the player. */
  readonly layers: readonly CompiledTileLayer[];
  readonly objects: readonly CompiledTileObject[];
  /** Row-major `width × height`: `1` walkable, `0` blocked. */
  readonly walkable: string;
  /** Row-major `width × height`: `1` where an above-player tile is drawn. */
  readonly abovePlayer: string;
  readonly regions: readonly DreamMapRegion[];
  readonly landmarks: readonly DreamMapLandmark[];
  readonly anchors: readonly CompiledAnchor[];
}

/** The walkability grid pathfinding and movement read. */
export interface WalkabilityGrid {
  readonly width: number;
  readonly height: number;
  /** Row-major `width × height`: `1` walkable. */
  readonly walkable: string;
}

/** Whether tile `[x, y]` lies on the grid and is walkable. */
export function isWalkable(grid: WalkabilityGrid, [x, y]: TilePoint): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < grid.width &&
    y < grid.height &&
    grid.walkable[y * grid.width + x] === "1"
  );
}

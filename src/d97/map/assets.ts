// Reusable pieces a map recipe places: named stamps (LPC chunks such as a
// house or a tree cluster) and auto-tiled terrains. Both carry full tileset
// descriptors with library-relative image paths, so the compiler can add
// their tilesets to any map.

import type {
  D97StampId,
  D97TerrainId,
} from "../../types/identifiers";
import type { TilePoint } from "./definition";
import type { TiledTileset } from "./tiled";

/** One layer of a stamp: stamp-local global ids over the stamp's tilesets. */
export interface DreamStampLayer {
  /** The map tile layer it is placed on; created on top when missing. */
  readonly layer: string;
  /** Row-major gids, `width × height`; 0 leaves the map's tile in place. */
  readonly gids: readonly number[];
  /** Placed cells of this layer draw above the player. */
  readonly above?: boolean;
}

export interface DreamStamp {
  readonly id: D97StampId;
  readonly width: number;
  readonly height: number;
  /** Tilesets the stamp's gids refer to, numbered from `firstGid`. */
  readonly tilesets: readonly TiledTileset[];
  readonly layers: readonly DreamStampLayer[];
  /** Row-major `width × height` mask: `1` blocks, `0` opens, `.` leaves as is. */
  readonly walkability?: string;
  /** Named points relative to the stamp's top-left, such as a door step. */
  readonly points?: Readonly<Record<string, TilePoint>>;
}

/**
 * Corner bits of an auto-tiled cell: which of its four corners lie inside the
 * terrain.
 */
export const TERRAIN_CORNER = { nw: 1, ne: 2, sw: 4, se: 8 } as const;

/** Every corner inside the terrain: a fully covered cell. */
export const TERRAIN_FULL = 15;

export interface DreamTerrain {
  readonly id: D97TerrainId;
  /** The tileset holding the terrain's pieces, numbered from `firstGid`. */
  readonly tileset: TiledTileset;
  /**
   * Local tile ids by corner mask. A mask with several ids picks one by cell
   * position; a mask with none uses the full piece.
   */
  readonly corners: Readonly<Partial<Record<number, readonly number[]>>>;
  /** Whether fully covered cells block movement (water, lava). */
  readonly blocksMovement: boolean;
}

/**
 * The corner table of a standard LPC 3×6 terrain block whose top-left tile
 * sits at column `x`, row `y` of a sheet `columns` tiles wide:
 *
 * - row 0, column 0: a lone patch (unused by auto-tiling);
 * - rows 0–1, columns 1–2: the four inner corners;
 * - rows 2–4: the outer frame around the full center piece;
 * - row 5: full-piece variants.
 */
export function lpcTerrainCorners(
  [x, y]: TilePoint,
  columns: number,
): Readonly<Record<number, readonly number[]>> {
  const at = (column: number, row: number) => (y + row) * columns + x + column;
  const { nw, ne, sw, se } = TERRAIN_CORNER;
  return {
    [nw | ne | sw]: [at(1, 0)],
    [nw | ne | se]: [at(2, 0)],
    [nw | sw | se]: [at(1, 1)],
    [ne | sw | se]: [at(2, 1)],
    [se]: [at(0, 2)],
    [sw | se]: [at(1, 2)],
    [sw]: [at(2, 2)],
    [ne | se]: [at(0, 3)],
    [TERRAIN_FULL]: [at(1, 3), at(0, 5), at(1, 5), at(2, 5)],
    [nw | sw]: [at(2, 3)],
    [ne]: [at(0, 4)],
    [nw | ne]: [at(1, 4)],
    [nw]: [at(2, 4)],
  };
}

// Reusable pieces a map recipe places: named stamps (LPC chunks such as a
// house or a tree cluster) and auto-tiled terrains. Both carry full tileset
// descriptors with library-relative image paths, so the compiler can add
// their tilesets to any map.

import type {
  D97StampId,
  D97TerrainId,
} from "../../types/identifiers";
import type { D97Season, TilePoint } from "./definition";
import type { TiledTileset } from "./tiled";

/**
 * One LPC Revised sheet family drawn once per season with the same layout
 * (terrain, cliffs, plants, trees, wildflowers): the season's library image
 * paths. `reseason` swaps a tile to the same tile of another season's sheet.
 */
export interface D97SeasonFamily {
  readonly family: string;
  readonly images: Readonly<Record<D97Season, string>>;
}

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
  /** The tile layer a `brush` paints when it names none. */
  readonly layer: string;
  /**
   * Draws only fully covered cells: a base fill (bare dirt, sand) with no
   * edge pieces, whose edges other terrains cover.
   */
  readonly edgeless?: boolean;
}

/**
 * Where a terrain's pieces sit on its sheet, in sheet tile coordinates:
 *
 * - `outer`: the top-left of the 3×3 frame around a patch of the terrain:
 *   outer corners and edges, with the full piece in its middle;
 * - `inner`: the top-left of the 2×2 block of inner corners (a hole in the
 *   terrain spread over four tiles);
 * - `full`: the full pieces (the frame's middle when it is drawn, and any
 *   variants), picked by cell position.
 */
export interface TerrainSheetLayout {
  readonly outer: TilePoint;
  readonly inner: TilePoint;
  readonly full: readonly TilePoint[];
}

/** The corner table of a terrain laid out as `layout` on a sheet `columns` tiles wide. */
export function terrainCorners(
  layout: TerrainSheetLayout,
  columns: number,
): Readonly<Record<number, readonly number[]>> {
  const at = ([x, y]: TilePoint, column: number, row: number) => (y + row) * columns + x + column;
  const { outer, inner } = layout;
  const { nw, ne, sw, se } = TERRAIN_CORNER;
  return {
    [nw | ne | sw]: [at(inner, 0, 0)],
    [nw | ne | se]: [at(inner, 1, 0)],
    [nw | sw | se]: [at(inner, 0, 1)],
    [ne | sw | se]: [at(inner, 1, 1)],
    [se]: [at(outer, 0, 0)],
    [sw | se]: [at(outer, 1, 0)],
    [sw]: [at(outer, 2, 0)],
    [ne | se]: [at(outer, 0, 1)],
    [TERRAIN_FULL]: layout.full.map((point) => at(point, 0, 0)),
    [nw | sw]: [at(outer, 2, 1)],
    [ne]: [at(outer, 0, 2)],
    [nw | ne]: [at(outer, 1, 2)],
    [nw]: [at(outer, 2, 2)],
  };
}

/**
 * The layout of a standard LPC 3×6 terrain block whose top-left tile sits at
 * `[x, y]`:
 *
 * - row 0, column 0: a lone patch (unused by auto-tiling);
 * - rows 0–1, columns 1–2: the four inner corners;
 * - rows 2–4: the outer frame around the full center piece;
 * - row 5: full-piece variants, unless `fullRow` is false (some sheets keep
 *   props there).
 */
export function lpcBlockLayout([x, y]: TilePoint, fullRow = true): TerrainSheetLayout {
  const center: TilePoint = [x + 1, y + 3];
  return {
    outer: [x, y + 2],
    inner: [x + 1, y],
    full: fullRow
      ? [
          center,
          [x, y + 5],
          [x + 1, y + 5],
          [x + 2, y + 5],
        ]
      : [center],
  };
}

/** The corner table of a standard LPC 3×6 terrain block (`lpcBlockLayout`). */
export function lpcTerrainCorners(origin: TilePoint, columns: number): Readonly<Record<number, readonly number[]>> {
  return terrainCorners(lpcBlockLayout(origin), columns);
}

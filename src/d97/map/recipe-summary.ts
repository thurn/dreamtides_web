// What a map module's recipe places, in the compiled map's coordinates: each
// stamp's footprint and named points, each terrain brush's area and cell
// count, and each reseason's area. The inspector prints it and the preview
// outlines the stamp footprints. Operations before a crop are shifted by
// every later crop, so the coordinates match the compiled map.

import type { D97StampId, D97TerrainId } from "../../types/identifiers";
import type { DreamStamp } from "./assets";
import type { D97Season, DreamMapDefinition, TilePoint, TileRect } from "./definition";
import { rectCells, shapeCells } from "./ops/working-map";

export type RecipePlacement =
  | {
      readonly kind: "stamp";
      readonly index: number;
      readonly stamp: D97StampId;
      /** The footprint, or null when the stamp is not in the catalog. */
      readonly rect: TileRect | null;
      readonly points: readonly { readonly name: string; readonly at: TilePoint }[];
    }
  | {
      readonly kind: "terrain";
      readonly index: number;
      readonly terrain: D97TerrainId;
      /** The layer painted, or null for a brush's catalog default. */
      readonly layer: string | null;
      readonly erase: boolean;
      /** The bounding box of the painted cells. */
      readonly rect: TileRect;
      readonly cells: number;
    }
  | { readonly kind: "reseason"; readonly index: number; readonly season: D97Season; readonly rect: TileRect | null };

const UNBOUNDED = { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER };

/** The recipe's stamps, terrain paints and reseasons in compiled coordinates. */
export function recipePlacements(
  definition: DreamMapDefinition,
  stamps: ReadonlyMap<D97StampId, DreamStamp>,
): RecipePlacement[] {
  const { recipe } = definition;
  const shiftAfter = recipe.map((_, index) => {
    let dx = 0;
    let dy = 0;
    for (const later of recipe.slice(index + 1)) {
      if (later.op !== "crop") continue;
      const { x0, y0 } = rectCells(later);
      dx += x0;
      dy += y0;
    }
    return [dx, dy] as const;
  });
  const placements: RecipePlacement[] = [];
  recipe.forEach((op, index) => {
    const [dx, dy] = shiftAfter[index];
    const move = ([x, y]: TilePoint): TilePoint => [x - dx, y - dy];
    if (op.op === "stamp") {
      const stamp = stamps.get(op.stamp);
      const at = move(op.at);
      placements.push({
        kind: "stamp",
        index,
        stamp: op.stamp,
        rect: stamp === undefined ? null : { from: at, to: [at[0] + stamp.width - 1, at[1] + stamp.height - 1] },
        points: Object.entries(stamp?.points ?? {}).map(([name, [px, py]]) => ({ name, at: [at[0] + px, at[1] + py] })),
      });
    } else if (op.op === "brush" || op.op === "paintTerrain") {
      let cells: TilePoint[];
      try {
        cells = shapeCells(UNBOUNDED, op.shape);
      } catch {
        cells = [];
      }
      if (cells.length === 0) return;
      const xs = cells.map(([x]) => x);
      const ys = cells.map(([, y]) => y);
      placements.push({
        kind: "terrain",
        index,
        terrain: op.terrain,
        layer: op.op === "paintTerrain" ? op.layer : (op.layer ?? null),
        erase: op.op === "brush" && op.erase === true,
        rect: { from: move([Math.min(...xs), Math.min(...ys)]), to: move([Math.max(...xs), Math.max(...ys)]) },
        cells: new Set(cells.map(([x, y]) => `${String(x)},${String(y)}`)).size,
      });
    } else if (op.op === "reseason") {
      placements.push({
        kind: "reseason",
        index,
        season: op.season,
        rect: op.from === undefined || op.to === undefined ? null : { from: move(op.from), to: move(op.to) },
      });
    }
  });
  return placements;
}

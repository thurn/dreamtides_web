// `block` and `open`: force a rectangle's walkability, overriding what the
// tiles derive.

import type { TileRect } from "../definition";
import type { RecipeOpHandler, WorkingMap } from "./working-map";
import { requireRect } from "./working-map";

function override(map: WorkingMap, rect: TileRect, flag: 0 | 1): void {
  const { x0, y0, x1, y1 } = requireRect(map, rect);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) map.override[y * map.width + x] = flag;
  }
}

export const blockOp: RecipeOpHandler<"block"> = (map, op) => override(map, op, 1);
export const openOp: RecipeOpHandler<"open"> = (map, op) => override(map, op, 0);

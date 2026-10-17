// `hideLayer` and `abovePlayer`: layer visibility and lifting tiles (or a
// whole layer, or an object layer's tile objects) above the player.

import type { RecipeOpHandler } from "./working-map";
import { areaCells, objectCell, requireLayer } from "./working-map";

export const hideLayerOp: RecipeOpHandler<"hideLayer"> = (map, op) => {
  requireLayer(map, op.layer);
  map.hidden.add(op.layer);
};

export const abovePlayerOp: RecipeOpHandler<"abovePlayer"> = (map, op) => {
  requireLayer(map, op.layer);
  const named = map.layers.filter((layer) => layer.name === op.layer);
  if (op.from === undefined && op.to === undefined) {
    for (const layer of named) layer.aboveAll = true;
    for (const object of map.objects) if (object.layer === op.layer) object.above = true;
    return;
  }
  const { x0, y0, x1, y1 } = areaCells(map, op);
  for (const layer of named) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) layer.lifted[y * map.width + x] = 1;
    }
  }
  for (const object of map.objects) {
    const [x, y] = objectCell(map, object);
    if (object.layer === op.layer && x >= x0 && x <= x1 && y >= y0 && y <= y1) object.above = true;
  }
};

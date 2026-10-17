// `erase`: clear a rectangle on the named layers (default: every layer),
// including object shapes and tile objects based there, and reset recipe
// walkability overrides in it.

import type { RecipeOpHandler } from "./working-map";
import { objectCell, requireLayer, requireRect } from "./working-map";

export const eraseOp: RecipeOpHandler<"erase"> = (map, op) => {
  const { x0, y0, x1, y1 } = requireRect(map, op);
  const names = op.layers ?? [...map.layers.map((layer) => layer.name), ...map.objectLayers];
  for (const name of names) requireLayer(map, name);
  for (const layer of map.layers) {
    if (!names.includes(layer.name)) continue;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        layer.gids[y * map.width + x] = 0;
        layer.lifted[y * map.width + x] = 0;
      }
    }
  }
  for (const [name, shapes] of map.objectShapes) {
    if (!names.includes(name)) continue;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) shapes[y * map.width + x] = 0;
    }
  }
  map.objects = map.objects.filter((object) => {
    if (!names.includes(object.layer)) return true;
    const [x, y] = objectCell(map, object);
    return x < x0 || x > x1 || y < y0 || y > y1;
  });
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) map.override[y * map.width + x] = -1;
  }
};

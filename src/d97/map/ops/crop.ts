// `crop`: keep a rectangle of the map; tiles, overrides, object shapes and
// tile objects shift to the rectangle's origin, and objects outside it go.

import type { RecipeOpHandler } from "./working-map";
import { requireRect } from "./working-map";

export const cropOp: RecipeOpHandler<"crop"> = (map, rect) => {
  const { x0, y0, x1, y1 } = requireRect(map, rect);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const crop = <T extends number[] | Uint8Array | Int8Array>(cells: T, make: (n: number) => T): T => {
    const out = make(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        out[y * width + x] = cells[(y + y0) * map.width + x + x0];
      }
    }
    return out;
  };
  for (const layer of map.layers) {
    layer.gids = crop(layer.gids, (n) => new Array<number>(n).fill(0));
    layer.lifted = crop(layer.lifted, (n) => new Uint8Array(n));
  }
  map.override = crop(map.override, (n) => new Int8Array(n).fill(-1));
  for (const [name, cells] of map.objectShapes) {
    map.objectShapes.set(name, crop(cells, (n) => new Uint8Array(n)));
  }
  map.objects = map.objects
    .map((object) => ({ ...object, x: object.x - x0 * map.tileWidth, y: object.y - y0 * map.tileHeight }))
    .filter(
      (object) =>
        object.x >= 0 &&
        object.y > 0 &&
        object.x < width * map.tileWidth &&
        object.y <= height * map.tileHeight,
    );
  map.width = width;
  map.height = height;
};

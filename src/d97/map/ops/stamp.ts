// `stamp`: place a catalog stamp's layers with its top-left at a tile,
// remapping its gids into the map's tilesets, lifting its above layers and
// applying its walkability mask.

import { gidWithoutFlags } from "../tiled";
import type { RecipeOpHandler } from "./working-map";
import { inBounds, layerOrCreate, RecipeError, remapper } from "./working-map";

export const stampOp: RecipeOpHandler<"stamp"> = (map, op, assets) => {
  const stamp = assets.stamps.get(op.stamp);
  if (stamp === undefined) throw new RecipeError(`unknown stamp ${op.stamp}`);
  const { at } = op;
  const corner = [at[0] + stamp.width - 1, at[1] + stamp.height - 1] as const;
  if (!inBounds(map, at) || !inBounds(map, corner)) {
    throw new RecipeError(`stamp ${stamp.id} at ${JSON.stringify(at)} leaves the map`);
  }
  const remap = remapper(map, stamp.tilesets);
  for (const stampLayer of stamp.layers) {
    if (stampLayer.gids.length !== stamp.width * stamp.height) {
      throw new RecipeError(`stamp ${stamp.id} layer ${stampLayer.layer} has the wrong cell count`);
    }
    const layer = layerOrCreate(map, stampLayer.layer);
    for (let y = 0; y < stamp.height; y += 1) {
      for (let x = 0; x < stamp.width; x += 1) {
        const gid = stampLayer.gids[y * stamp.width + x];
        if (gidWithoutFlags(gid) === 0) continue;
        const cell = (at[1] + y) * map.width + at[0] + x;
        layer.gids[cell] = remap(gid);
        if (stampLayer.above === true) layer.lifted[cell] = 1;
      }
    }
  }
  const mask = stamp.walkability;
  if (mask === undefined) return;
  if (mask.length !== stamp.width * stamp.height) {
    throw new RecipeError(`stamp ${stamp.id} walkability mask has the wrong cell count`);
  }
  for (let y = 0; y < stamp.height; y += 1) {
    for (let x = 0; x < stamp.width; x += 1) {
      const flag = mask[y * stamp.width + x];
      if (flag !== "0" && flag !== "1") continue;
      map.override[(at[1] + y) * map.width + at[0] + x] = flag === "1" ? 1 : 0;
    }
  }
};

// The recipe operation registry: one handler per `DreamMapRecipeOp` kind,
// each in its own module. The compiler applies a recipe by looking up each
// operation's handler here.

import type { DreamMapRecipeOp } from "../definition";
import { cropOp } from "./crop";
import { eraseOp } from "./erase";
import { abovePlayerOp, hideLayerOp } from "./layers";
import { blockOp, openOp } from "./overrides";
import { reseasonOp } from "./reseason";
import { stampOp } from "./stamp";
import { brushOp, paintTerrainOp } from "./terrain";
import type { RecipeAssets, RecipeOpHandler, WorkingMap } from "./working-map";

const RECIPE_OPS: { readonly [K in DreamMapRecipeOp["op"]]: RecipeOpHandler<K> } = {
  crop: cropOp,
  erase: eraseOp,
  stamp: stampOp,
  paintTerrain: paintTerrainOp,
  brush: brushOp,
  reseason: reseasonOp,
  hideLayer: hideLayerOp,
  abovePlayer: abovePlayerOp,
  block: blockOp,
  open: openOp,
};

/** Apply one recipe operation to the working map. */
export function applyRecipeOp(map: WorkingMap, op: DreamMapRecipeOp, assets: RecipeAssets): void {
  const handler = RECIPE_OPS[op.op] as (map: WorkingMap, op: DreamMapRecipeOp, assets: RecipeAssets) => void;
  handler(map, op, assets);
}

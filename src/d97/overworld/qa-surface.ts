// The development QA surface (decision P26): `window.__d97` in development
// builds, for browser QA to read the overworld and drive it. Teleporting is a
// QA convenience that writes no event; walking and interacting behave exactly
// as a click or a key press would.

import type { DreamAnchorId, DreamMapId } from "../../types/identifiers";
import { isWalkable, type CompiledDreamMap } from "../map/compiled";
import type { TilePoint } from "../map/definition";
import { movementGrid } from "./interactions";
import type { OverworldSceneHandle } from "./overworld-scene";
import { FACING_STEPS, facedTile, walkerPosition } from "./walker";

export interface D97QaSurface {
  /** A JSON-safe dump of the overworld's state. */
  readonly state: () => unknown;
  /** The current dream (its map, until dreams exist). */
  readonly dream: () => { readonly mapId: DreamMapId };
  readonly playerTile: () => TilePoint;
  /** Walk to an anchor and interact, as a click on it would. */
  readonly walkTo: (anchorId: DreamAnchorId) => boolean;
  /** Walk to a tile, as a click on it would. */
  readonly walkToTile: (tile: TilePoint) => boolean;
  /** Interact with the faced anchor, as the interact key would. */
  readonly interact: () => boolean;
  /** Stand beside an anchor at once, facing it. Writes no event. */
  readonly teleport: (anchorId: DreamAnchorId) => boolean;
}

declare global {
  interface Window {
    __d97?: D97QaSurface;
  }
}

/** Install `window.__d97` for `scene`; returns its removal. */
export function installD97QaSurface(
  map: CompiledDreamMap,
  scene: OverworldSceneHandle,
): () => void {
  // Anchors where they stand: a beaten guardian has stepped aside.
  const anchor = (id: DreamAnchorId) => scene.anchors().find((candidate) => candidate.id === id);
  const grid = movementGrid(map, scene.anchors());
  const surface: D97QaSurface = {
    state: () => {
      const walker = scene.walker();
      return {
        mapId: map.id,
        size: [map.width, map.height],
        player: {
          tile: walker.tile,
          position: walkerPosition(walker),
          facing: walker.facing,
          faced: facedTile(walker),
          walking: walker.step !== null || walker.path.length > 0,
          pathRemaining: walker.path.length,
        },
        characters: scene.characters(),
        markers: scene.markers(),
        camera: scene.camera(),
        viewport: scene.viewport(),
        anchors: scene.anchors().map(({ id, kind, at }) => ({ id, kind, at })),
        hiddenAnchorIds: scene.hiddenAnchorIds(),
      };
    },
    dream: () => ({ mapId: map.id }),
    playerTile: () => scene.walker().tile,
    walkTo: (id) => {
      const target = anchor(id);
      return target !== undefined && scene.walkToAnchor(target);
    },
    walkToTile: (tile) => scene.walkToTile(tile),
    interact: () => scene.interact(),
    teleport: (id) => {
      const target = anchor(id);
      if (target === undefined) return false;
      const beside = Object.values(FACING_STEPS)
        .map(([dx, dy]): TilePoint => [target.at[0] + dx, target.at[1] + dy])
        .find((tile) => isWalkable(grid, tile));
      return beside !== undefined && scene.teleport(beside, target.at);
    },
  };
  window.__d97 = surface;
  return () => {
    if (window.__d97 === surface) delete window.__d97;
  };
}

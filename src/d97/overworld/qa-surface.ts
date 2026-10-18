// The development QA surface (decision P26): `window.__d97` in development
// builds, for browser QA to read the overworld and drive it. Its state carries
// the run's identity, dream and stored acts as the overworld last published
// them (`publishD97QaRun`). Teleporting is a QA convenience that writes no
// event; walking and interacting behave exactly as a click or a key press
// would.

import type { D97Run } from "../../rules/d97/d97-state";
import type { DreamAnchorId, DreamMapId } from "../../types/identifiers";
import { isWalkable, type CompiledDreamMap } from "../map/compiled";
import type { TilePoint } from "../map/definition";
import type { OverworldSceneHandle } from "./overworld-scene";
import { FACING_STEPS, facedTile, walkerPosition, type Facing } from "./walker";

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
  /**
   * Stand beside an anchor at once, facing it: on its `side` when given
   * ("up" is the tile north of it), else on the first walkable side. Writes
   * no event.
   */
  readonly teleport: (anchorId: DreamAnchorId, side?: Facing) => boolean;
}

declare global {
  interface Window {
    __d97?: D97QaSurface;
  }
}

/** The run the overworld shows, as the surface's state reports it. */
type D97QaRun = Pick<D97Run, "runId" | "dreamId" | "acts">;

let qaRun: D97QaRun | null = null;

/** Publish the run the overworld shows to the surface's state; returns its withdrawal. */
export function publishD97QaRun(run: D97QaRun): () => void {
  const published = { runId: run.runId, dreamId: run.dreamId, acts: run.acts };
  qaRun = published;
  return () => {
    if (qaRun === published) qaRun = null;
  };
}

/** Install `window.__d97` for `scene`; returns its removal. */
export function installD97QaSurface(
  map: CompiledDreamMap,
  scene: OverworldSceneHandle,
): () => void {
  // Anchors where they stand: a beaten guardian has stepped aside.
  const anchor = (id: DreamAnchorId) => scene.anchors().find((candidate) => candidate.id === id);
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
        drawnAnchorIds: scene.drawnAnchorIds(),
        playerScreenRect: scene.playerScreenRect(),
        playerBodyScreenRect: scene.playerBodyScreenRect(),
        hiddenAnchorIds: scene.hiddenAnchorIds(),
        run: qaRun,
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
    teleport: (id, side) => {
      const target = anchor(id);
      if (target === undefined) return false;
      const steps = side === undefined ? Object.values(FACING_STEPS) : [FACING_STEPS[side]];
      const beside = steps
        .map(([dx, dy]): TilePoint => [target.at[0] + dx, target.at[1] + dy])
        .find((tile) => isWalkable(scene.grid(), tile));
      return beside !== undefined && scene.teleport(beside, target.at);
    },
  };
  window.__d97 = surface;
  return () => {
    if (window.__d97 === surface) delete window.__d97;
  };
}

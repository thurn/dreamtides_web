// What the player can interact with on the overworld: anchors stand on their
// tiles (which the player cannot enter), the player interacts with the anchor
// it faces, and a click on an anchor walks to the nearest tile beside it.
// Handlers live in an interaction registry keyed by anchor kind, which later
// beads fill (challengers, shops, residents, doors…).

import { findPath } from "../map/pathfinding";
import { isWalkable, type CompiledAnchor, type WalkabilityGrid } from "../map/compiled";
import type { DreamAnchorKind, TilePoint } from "../map/definition";
import { FACING_STEPS } from "./walker";

/** Handles the player's interaction with one anchor. */
export type OverworldInteraction = (anchor: CompiledAnchor) => void;

export interface InteractionRegistry {
  /** Register the handler for `kind`, replacing any; returns its removal. */
  readonly register: (kind: DreamAnchorKind, handler: OverworldInteraction) => () => void;
  /** Run `anchor`'s handler; false when its kind has none. */
  readonly interact: (anchor: CompiledAnchor) => boolean;
}

export function createInteractionRegistry(): InteractionRegistry {
  const handlers = new Map<DreamAnchorKind, OverworldInteraction>();
  return {
    register(kind, handler) {
      handlers.set(kind, handler);
      return () => {
        if (handlers.get(kind) === handler) handlers.delete(kind);
      };
    },
    interact(anchor) {
      const handler = handlers.get(anchor.kind);
      if (handler === undefined) return false;
      handler(anchor);
      return true;
    },
  };
}

function key([x, y]: TilePoint): string {
  return `${String(x)},${String(y)}`;
}

/** The anchor standing on each occupied tile. */
export function anchorsByTile(
  anchors: readonly CompiledAnchor[],
): ReadonlyMap<string, CompiledAnchor> {
  return new Map(anchors.map((anchor) => [key(anchor.at), anchor]));
}

/** The anchor on `tile`, if any. */
export function anchorAt(
  byTile: ReadonlyMap<string, CompiledAnchor>,
  tile: TilePoint,
): CompiledAnchor | undefined {
  return byTile.get(key(tile));
}

/**
 * The grid the player walks on: the map's walkability with every anchor's
 * tile blocked, since anchors stand where they are.
 */
export function movementGrid(
  grid: WalkabilityGrid,
  anchors: readonly CompiledAnchor[],
): WalkabilityGrid {
  const cells = Array.from(grid.walkable);
  for (const { at } of anchors) {
    if (isWalkable(grid, at)) cells[at[1] * grid.width + at[0]] = "0";
  }
  return { width: grid.width, height: grid.height, walkable: cells.join("") };
}

/**
 * The shortest walk on `grid` (a movement grid) from `from` to a tile beside
 * `target`, or null when none is reachable. Standing beside it already is a
 * one-tile path.
 */
export function pathBeside(
  grid: WalkabilityGrid,
  from: TilePoint,
  target: TilePoint,
): TilePoint[] | null {
  let best: TilePoint[] | null = null;
  for (const [dx, dy] of Object.values(FACING_STEPS)) {
    const beside: TilePoint = [target[0] + dx, target[1] + dy];
    if (beside[0] === from[0] && beside[1] === from[1]) return [from];
    const path = findPath(grid, from, beside);
    if (path !== null && (best === null || path.length < best.length)) best = path;
  }
  return best;
}

// Where the player appears in a dream (Appendix B §B17): returning from a
// battle, beside the opponent they fought; otherwise, as on a reload, at the
// entry point of the last door they stepped through or beside the last
// waypoint they used, else at the entry of the dream's first door, or failing
// that the walkable tile nearest the map's center.

import { isWalkable, type CompiledAnchor, type CompiledDreamMap, type WalkabilityGrid } from "../map/compiled";
import type { TilePoint } from "../map/definition";
import type { DreamAnchorId } from "../../types/identifiers";
import { FACING_STEPS } from "./walker";

/** Where a scene places the player when it opens. */
export type OverworldArrival =
  | { readonly kind: "beside"; readonly anchorId: DreamAnchorId }
  | { readonly kind: "entry"; readonly anchorId: DreamAnchorId };

/**
 * The arrival a run's state names. Only an overworld opened straight from a
 * battle (`returningFromBattle`) places the player beside its opponent; any
 * other open, a reload included, uses the last door or waypoint.
 */
export function arrivalFor(
  run: {
    readonly returnAnchorId: DreamAnchorId | null;
    readonly lastPlace: { readonly kind: "door" | "waypoint"; readonly anchorId: DreamAnchorId } | null;
  },
  returningFromBattle: boolean,
): OverworldArrival | null {
  if (returningFromBattle && run.returnAnchorId !== null) return { kind: "beside", anchorId: run.returnAnchorId };
  if (run.lastPlace === null) return null;
  return { kind: run.lastPlace.kind === "door" ? "entry" : "beside", anchorId: run.lastPlace.anchorId };
}

export function spawnTile(map: CompiledDreamMap, grid: WalkabilityGrid = map): TilePoint {
  const door = map.anchors.find((anchor) => anchor.kind === "door");
  if (door?.entry !== undefined && isWalkable(grid, door.entry)) return door.entry;
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);
  let best: TilePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const distance = Math.abs(x - cx) + Math.abs(y - cy);
      if (distance < bestDistance && isWalkable(grid, [x, y])) {
        best = [x, y];
        bestDistance = distance;
      }
    }
  }
  return best ?? [cx, cy];
}

/** The first tile beside `target` the player may enter, in facing order. */
export function besideTile(grid: WalkabilityGrid, target: TilePoint): TilePoint | undefined {
  return Object.values(FACING_STEPS)
    .map(([dx, dy]): TilePoint => [target[0] + dx, target[1] + dy])
    .find((tile) => isWalkable(grid, tile));
}

/**
 * The player's opening tile, and the tile they face, for `arrival` among the
 * standing `anchors`; the default spawn when the arrival names no placeable
 * anchor.
 */
export function arrivalPlacement(
  map: CompiledDreamMap,
  anchors: readonly CompiledAnchor[],
  grid: WalkabilityGrid,
  arrival: OverworldArrival | null,
): { readonly tile: TilePoint; readonly face: TilePoint | null } {
  const anchor = arrival === null ? undefined : anchors.find((candidate) => candidate.id === arrival.anchorId);
  if (arrival !== null && anchor !== undefined) {
    if (arrival.kind === "entry" && anchor.entry !== undefined && isWalkable(grid, anchor.entry)) {
      return { tile: anchor.entry, face: null };
    }
    const beside = besideTile(grid, anchor.at);
    if (beside !== undefined) return { tile: beside, face: anchor.at };
  }
  return { tile: spawnTile(map, grid), face: null };
}

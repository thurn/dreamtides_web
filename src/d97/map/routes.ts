// Walking analysis over a compiled map: entries, reachability, walking
// routes and their crossing times, the main route, and per-region summaries.
// Pure; the map inspector and the validator read these.
//
// Definitions the tools share:
//
// - An anchor's **stand tile** is the tile a player walks to in order to use
//   it: a door's entry tile (the door tile itself may sit in a wall, under
//   its frame), every other anchor's own tile.
// - The map's **entries** are where a player can arrive: every door's entry
//   tile (stepping through from another dream) and every waypoint's tile
//   (fast travel and reloads, Appendix B §B5 and the visual guide).
// - The **main route** is the longest of the shortest walks between two
//   doors' entry tiles, with every guardian beaten: the farthest a player
//   must cross to get from one door of the dream to another, which is what
//   the P13 crossing targets size.

import type { DreamAnchorId } from "../../types/identifiers";
import { isWalkable, type CompiledAnchor, type CompiledDreamMap, type WalkabilityGrid } from "./compiled";
import type { DreamMapRegion, TilePoint } from "./definition";
import { findPath } from "./pathfinding";

/** Seconds to walk `tiles` steps at `tilesPerSecond`. */
export function crossingSeconds(tiles: number, tilesPerSecond: number): number {
  if (!(tilesPerSecond > 0)) throw new Error("walking speed must be positive");
  return tiles / tilesPerSecond;
}

export interface WalkingRoute {
  readonly from: TilePoint;
  readonly to: TilePoint;
  /** Every tile walked, both ends included. */
  readonly path: readonly TilePoint[];
  /** Steps taken: one fewer than the path's tiles. */
  readonly tiles: number;
  readonly seconds: number;
}

/** The shortest walk from `from` to `to` (via `findPath`), or null when there is none. */
export function walkingRoute(
  grid: WalkabilityGrid,
  from: TilePoint,
  to: TilePoint,
  tilesPerSecond: number,
): WalkingRoute | null {
  const path = findPath(grid, from, to);
  if (path === null) return null;
  const tiles = path.length - 1;
  return { from, to, path, tiles, seconds: crossingSeconds(tiles, tilesPerSecond) };
}

/** The tile a player walks to in order to use an anchor. */
export function anchorStandTile(anchor: CompiledAnchor): TilePoint {
  return anchor.kind === "door" || anchor.kind === "buildingDoor" ? (anchor.entry ?? anchor.at) : anchor.at;
}

export interface MapEntry {
  readonly anchorId: DreamAnchorId;
  readonly kind: "door" | "waypoint" | "buildingDoor";
  readonly at: TilePoint;
}

/**
 * Whether `map` is a room (P19): it has building doors but no door or
 * waypoint, so it is entered only from its dream's map.
 */
export function isRoomMap(map: CompiledDreamMap): boolean {
  return (
    map.anchors.some((anchor) => anchor.kind === "buildingDoor") &&
    !map.anchors.some((anchor) => anchor.kind === "door" || anchor.kind === "waypoint")
  );
}

/**
 * Where a player can arrive on the map: door entry tiles and waypoints. A
 * room's arrivals are its building doors' entry tiles. On a dream's map a
 * building door is no arrival: the player comes out of a room only after
 * walking to its door, so the door must be reached from the map's entries.
 */
export function mapEntries(map: CompiledDreamMap): MapEntry[] {
  const room = isRoomMap(map);
  return map.anchors.flatMap((anchor): MapEntry[] =>
    anchor.kind === "door" || anchor.kind === "waypoint" || (room && anchor.kind === "buildingDoor")
      ? [{ anchorId: anchor.id, kind: anchor.kind, at: anchorStandTile(anchor) }]
      : [],
  );
}

/**
 * Cells reachable by 4-way walking from any of `starts`, never entering a
 * `blocked` cell. A start need not be walkable (as in `findPath`), but a
 * blocked start reaches nothing. Row-major, `1` reachable.
 */
export function reachableCells(
  grid: WalkabilityGrid,
  starts: readonly TilePoint[],
  blocked: readonly TilePoint[] = [],
): Uint8Array {
  const { width, height } = grid;
  const reached = new Uint8Array(width * height);
  const barred = new Uint8Array(width * height);
  const onGrid = ([x, y]: TilePoint) =>
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
  for (const cell of blocked) if (onGrid(cell)) barred[cell[1] * width + cell[0]] = 1;
  const queue: number[] = [];
  for (const start of starts) {
    if (!onGrid(start)) continue;
    const cell = start[1] * width + start[0];
    if (barred[cell] === 1 || reached[cell] === 1) continue;
    reached[cell] = 1;
    queue.push(cell);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (const next of [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ] as const) {
      if (!isWalkable(grid, next)) continue;
      const index = next[1] * width + next[0];
      if (reached[index] === 1 || barred[index] === 1) continue;
      reached[index] = 1;
      queue.push(index);
    }
  }
  return reached;
}

/** Whether `[x, y]` is set in a row-major reachability array. */
export function isReached(
  reached: Uint8Array,
  grid: { readonly width: number; readonly height: number },
  [x, y]: TilePoint,
): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height && reached[y * grid.width + x] === 1;
}

export interface MainRoute extends WalkingRoute {
  readonly fromDoor: DreamAnchorId;
  readonly toDoor: DreamAnchorId;
}

/**
 * The map's main route: the longest shortest walk between two door entry
 * tiles, guardians beaten. Ties keep the earliest pair in anchor order. Null
 * when no two doors are connected.
 */
export function mainRoute(map: CompiledDreamMap, tilesPerSecond: number): MainRoute | null {
  const doors = map.anchors.filter((anchor) => anchor.kind === "door");
  let best: MainRoute | null = null;
  for (let i = 0; i < doors.length; i += 1) {
    for (let j = i + 1; j < doors.length; j += 1) {
      const route = walkingRoute(map, anchorStandTile(doors[i]), anchorStandTile(doors[j]), tilesPerSecond);
      if (route === null || (best !== null && route.tiles <= best.tiles)) continue;
      best = { ...route, fromDoor: doors[i].id, toDoor: doors[j].id };
    }
  }
  return best;
}

/** A region's cell counts. */
export interface RegionSummary {
  readonly region: DreamMapRegion;
  readonly cells: number;
  readonly walkable: number;
  /** Walkable cells reachable from the map's entries. */
  readonly reachable: number;
}

export function regionSummary(
  map: CompiledDreamMap,
  region: DreamMapRegion,
  reached: Uint8Array,
): RegionSummary {
  const x0 = Math.min(region.from[0], region.to[0]);
  const x1 = Math.max(region.from[0], region.to[0]);
  const y0 = Math.min(region.from[1], region.to[1]);
  const y1 = Math.max(region.from[1], region.to[1]);
  let walkable = 0;
  let reachable = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!isWalkable(map, [x, y])) continue;
      walkable += 1;
      if (isReached(reached, map, [x, y])) reachable += 1;
    }
  }
  return { region, cells: (x1 - x0 + 1) * (y1 - y0 + 1), walkable, reachable };
}

/**
 * The tile standing for a region in crossing times: its walkable cell
 * nearest the region's center (ties by row, then column), preferring cells
 * reachable from the entries when it has any. Null for a region with no
 * walkable cell.
 */
export function regionCenterTile(
  map: CompiledDreamMap,
  region: DreamMapRegion,
  reached: Uint8Array,
): TilePoint | null {
  const x0 = Math.min(region.from[0], region.to[0]);
  const x1 = Math.max(region.from[0], region.to[0]);
  const y0 = Math.min(region.from[1], region.to[1]);
  const y1 = Math.max(region.from[1], region.to[1]);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let best: { tile: TilePoint; reached: boolean; distance: number } | null = null;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!isWalkable(map, [x, y])) continue;
      const candidate = {
        tile: [x, y] as const,
        reached: isReached(reached, map, [x, y]),
        distance: Math.abs(x - cx) + Math.abs(y - cy),
      };
      if (
        best === null ||
        (candidate.reached && !best.reached) ||
        (candidate.reached === best.reached && candidate.distance < best.distance)
      ) {
        best = candidate;
      }
    }
  }
  return best?.tile ?? null;
}

/** Sizes of the map's 4-connected walkable areas, largest first. */
export function walkableComponentSizes(grid: WalkabilityGrid): number[] {
  const { width } = grid;
  const seen = new Uint8Array(width * grid.height);
  const sizes: number[] = [];
  const queue: number[] = [];
  for (let cell = 0; cell < seen.length; cell += 1) {
    if (seen[cell] === 1 || grid.walkable[cell] !== "1") continue;
    seen[cell] = 1;
    queue.length = 0;
    queue.push(cell);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const x = current % width;
      const y = Math.floor(current / width);
      for (const next of [
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y],
      ] as const) {
        if (!isWalkable(grid, next)) continue;
        const index = next[1] * width + next[0];
        if (seen[index] === 1) continue;
        seen[index] = 1;
        queue.push(index);
      }
    }
    sizes.push(queue.length);
  }
  return sizes.sort((a, b) => b - a);
}

// Town layout analysis over a compiled dream map (decisions P13 and P33):
// each anchor's route from the town, its reach time, its detour and the
// narrow cells it crosses. Pure; the validator's layout rules and the map
// inspector read it.
//
// Definitions the tools share:
//
// - The **town** is named by the dream module (`DreamMapTown`): its town
//   door (a door anchor on the map) and its cluster tag. Routes start at the
//   town door's entry tile. Guardians count as beaten.
// - A cell is **w wide** when some w×w square of walkable cells contains it:
//   the ground there is at least w tiles across both ways. A 2-wide corridor
//   is 2 wide along its whole length, corners included; a 1-tile gap in a
//   hedge is not. A walkable cell that is not w wide is **narrow** for w.
// - **Exempt** cells never count as narrow: the cells of the map's declared
//   narrow crossings, every guardian's tile (a guardian fills the one-tile
//   chokepoint before its door, Appendix B §B5), and a route's two ends.
// - An anchor's **route from the town** is the walk from the town door's
//   entry to its stand tile that crosses the fewest narrow cells, then the
//   fewest steps. Its narrow cells are the narrow cells on that walk; a route
//   with none is wide enough.
// - The **main routes out of town** are the routes to every other door of
//   the map (the exit door among them): the ways on to other dreams. They
//   need `mainRouteMinWidthTiles`; every other route `minPathWidthTiles`.
// - An anchor's **reach** is the shortest walk from the town door's entry to
//   its stand tile, in tiles and in seconds at walking speed.
// - Its **detour** is that walk divided by its open-ground distance,
//   |dx| + |dy|: the steps a 4-way walker needs with nothing in the way,
//   which is how far the straight line between the two tiles walks.

import type { DreamAnchorId } from "../../types/identifiers";
import { isWalkable, type CompiledAnchor, type CompiledDreamMap, type WalkabilityGrid } from "./compiled";
import type { DreamMapNarrowCrossing, TilePoint } from "./definition";
import { anchorStandTile, crossingSeconds } from "./routes";
import type { D97MapTuning } from "./tuning";

/** What a dream module says about its map's town (P33), resolved to this map's anchors. */
export interface DreamMapTown {
  /** The town door: a door anchor on this map. */
  readonly doorAnchorId: DreamAnchorId;
  /** The cluster tag of the town's friendly anchors. */
  readonly cluster: string;
  /**
   * Anchors on this map that stand in town besides the waypoint and the
   * cluster: the shop and every quest giver, or for one in a room, the
   * building door into that room.
   */
  readonly townAnchorIds: readonly DreamAnchorId[];
  /** The dream's exit door, if it is on this map; it stands outside the town. */
  readonly exitDoorAnchorId: DreamAnchorId | null;
}

/** One anchor's route from the town. */
export interface TownRoute {
  readonly anchor: CompiledAnchor;
  readonly stand: TilePoint;
  /** Straight-line distance from the town door's entry, in tiles. */
  readonly distance: number;
  /** Steps of the shortest walk from the town door's entry; null when no walk reaches it. */
  readonly tiles: number | null;
  /** `tiles` at walking speed; null when no walk reaches it. */
  readonly seconds: number | null;
  /** |dx| + |dy| from the town door's entry. */
  readonly directTiles: number;
  /** `tiles / directTiles`; null when unreached or at the town door's entry. */
  readonly detourRatio: number | null;
  /** Whether this is a main route out of town. */
  readonly main: boolean;
  readonly requiredWidth: number;
  /** Narrow cells on the route, in walking order; empty when wide enough or unreached. */
  readonly narrowCells: readonly TilePoint[];
  /** The route itself (fewest narrow cells, then fewest steps); empty when unreached. */
  readonly path: readonly TilePoint[];
}

export interface TownLayout {
  readonly door: CompiledAnchor;
  readonly entry: TilePoint;
  /** One route per anchor other than the town door, in anchor order. */
  readonly routes: readonly TownRoute[];
}

/** Cells covered by a `width × width` square of walkable cells. Row-major, `1` wide. */
export function wideCells(grid: WalkabilityGrid, width: number): Uint8Array {
  const { width: columns, height: rows } = grid;
  const wide = new Uint8Array(columns * rows);
  // Walkable cells in the rectangle [0, x) × [0, y), for constant-time square sums.
  const sums = new Int32Array((columns + 1) * (rows + 1));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const cell = grid.walkable[y * columns + x] === "1" ? 1 : 0;
      sums[(y + 1) * (columns + 1) + x + 1] =
        cell + sums[y * (columns + 1) + x + 1] + sums[(y + 1) * (columns + 1) + x] - sums[y * (columns + 1) + x];
    }
  }
  const square = (x: number, y: number) =>
    sums[(y + width) * (columns + 1) + x + width] -
    sums[y * (columns + 1) + x + width] -
    sums[(y + width) * (columns + 1) + x] +
    sums[y * (columns + 1) + x];
  for (let y = 0; y + width <= rows; y += 1) {
    for (let x = 0; x + width <= columns; x += 1) {
      if (square(x, y) !== width * width) continue;
      for (let dy = 0; dy < width; dy += 1) wide.fill(1, (y + dy) * columns + x, (y + dy) * columns + x + width);
    }
  }
  return wide;
}

const STEPS: readonly TilePoint[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** A binary min-heap of `[cost, order, cell]`, ties broken by insertion order. */
class CostHeap {
  private readonly entries: (readonly [number, number, number])[] = [];
  private order = 0;

  get size(): number {
    return this.entries.length;
  }

  private before(a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
    return a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
  }

  push(cost: number, cell: number): void {
    const entries = this.entries;
    entries.push([cost, this.order++, cell]);
    let index = entries.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(entries[index], entries[parent])) break;
      [entries[index], entries[parent]] = [entries[parent], entries[index]];
      index = parent;
    }
  }

  pop(): readonly [number, number, number] | undefined {
    const entries = this.entries;
    const top = entries[0];
    const last = entries.pop();
    if (entries.length > 0 && last !== undefined) {
      entries[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < entries.length && this.before(entries[left], entries[smallest])) smallest = left;
        if (right < entries.length && this.before(entries[right], entries[smallest])) smallest = right;
        if (smallest === index) break;
        [entries[index], entries[smallest]] = [entries[smallest], entries[index]];
        index = smallest;
      }
    }
    return top;
  }
}

/**
 * The walks from `start` crossing the fewest narrow cells, then the fewest
 * steps, never entering a `blocked` cell: each cell's predecessor, `-1` at
 * the start and on unreached cells (`reached` tells them apart).
 */
function widthTree(
  grid: WalkabilityGrid,
  start: TilePoint,
  narrow: Uint8Array,
  blocked: Uint8Array | null,
): { readonly cameFrom: Int32Array; readonly reached: Uint8Array } {
  const { width, height } = grid;
  const penalty = width * height;
  const cost = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(width * height).fill(-1);
  const reached = new Uint8Array(width * height);
  const heap = new CostHeap();
  const first = start[1] * width + start[0];
  cost[first] = 0;
  heap.push(0, first);
  while (heap.size > 0) {
    const entry = heap.pop();
    if (entry === undefined) break;
    const [current, , cell] = entry;
    if (reached[cell] === 1) continue;
    reached[cell] = 1;
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (const [dx, dy] of STEPS) {
      const next: TilePoint = [x + dx, y + dy];
      if (!isWalkable(grid, next)) continue;
      const index = next[1] * width + next[0];
      if (reached[index] === 1 || (blocked !== null && blocked[index] === 1)) continue;
      const nextCost = current + 1 + (narrow[index] === 1 ? penalty : 0);
      if (nextCost >= cost[index]) continue;
      cost[index] = nextCost;
      cameFrom[index] = cell;
      heap.push(nextCost, index);
    }
  }
  return { cameFrom, reached };
}

/** The walk from the tree's start to `goal`, both ends included, or null when unreached. */
function treePath(
  grid: WalkabilityGrid,
  tree: { readonly cameFrom: Int32Array; readonly reached: Uint8Array },
  goal: TilePoint,
): TilePoint[] | null {
  const { width } = grid;
  const cell = goal[1] * width + goal[0];
  if (!isWalkable(grid, goal) || tree.reached[cell] !== 1) return null;
  const path: TilePoint[] = [];
  for (let at = cell; at !== -1; at = tree.cameFrom[at]) path.push([at % width, Math.floor(at / width)]);
  return path.reverse();
}

/** Steps of the shortest 4-way walk from `start` to every cell; -1 where unreached. */
function walkDistances(grid: WalkabilityGrid, start: TilePoint): Int32Array {
  const { width, height } = grid;
  const distance = new Int32Array(width * height).fill(-1);
  const first = start[1] * width + start[0];
  distance[first] = 0;
  const queue = [first];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (const [dx, dy] of STEPS) {
      const next: TilePoint = [x + dx, y + dy];
      if (!isWalkable(grid, next)) continue;
      const index = next[1] * width + next[0];
      if (distance[index] !== -1) continue;
      distance[index] = distance[cell] + 1;
      queue.push(index);
    }
  }
  return distance;
}

function cellMask(grid: WalkabilityGrid, cells: readonly TilePoint[]): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  for (const [x, y] of cells) {
    if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < grid.width && y < grid.height) {
      mask[y * grid.width + x] = 1;
    }
  }
  return mask;
}

/**
 * Walkable cells narrow for `width`, given the cells exempt from the width
 * rules. Row-major, `1` narrow.
 */
export function narrowCells(grid: WalkabilityGrid, width: number, exempt: readonly TilePoint[]): Uint8Array {
  const wide = wideCells(grid, width);
  const exemptMask = cellMask(grid, exempt);
  const narrow = new Uint8Array(grid.width * grid.height);
  for (let cell = 0; cell < narrow.length; cell += 1) {
    if (grid.walkable[cell] === "1" && wide[cell] === 0 && exemptMask[cell] === 0) narrow[cell] = 1;
  }
  return narrow;
}

/** The cells exempt from the width rules on every route: narrow crossings and guardians' tiles. */
export function widthExemptCells(
  map: CompiledDreamMap,
  crossings: readonly DreamMapNarrowCrossing[],
): TilePoint[] {
  return [
    ...crossings.flatMap((crossing) => crossing.cells),
    ...map.anchors.filter((anchor) => anchor.kind === "guardian").map((anchor) => anchor.at),
  ];
}

/** The town door anchor `town` names, or null when it is not a door on `map`. */
export function townDoor(map: CompiledDreamMap, town: DreamMapTown): CompiledAnchor | null {
  return map.anchors.find((anchor) => anchor.id === town.doorAnchorId && anchor.kind === "door") ?? null;
}

interface WidthAnalysis {
  readonly narrow: Uint8Array;
  readonly tree: { readonly cameFrom: Int32Array; readonly reached: Uint8Array };
}

function widthAnalysis(
  map: CompiledDreamMap,
  entry: TilePoint,
  width: number,
  exempt: readonly TilePoint[],
  blocked: Uint8Array | null,
): WidthAnalysis {
  const narrow = narrowCells(map, width, exempt);
  return { narrow, tree: widthTree(map, entry, narrow, blocked) };
}

/** The narrow cells on `path`, its two ends excepted. */
function narrowOnPath(map: CompiledDreamMap, path: readonly TilePoint[], narrow: Uint8Array): TilePoint[] {
  return path.slice(1, -1).filter(([x, y]) => narrow[y * map.width + x] === 1);
}

/**
 * Every anchor's route from the town, or null when the town door is not a
 * door on the map.
 */
export function townLayout(
  map: CompiledDreamMap,
  tuning: D97MapTuning,
  town: DreamMapTown,
  crossings: readonly DreamMapNarrowCrossing[] = [],
): TownLayout | null {
  const door = townDoor(map, town);
  if (door === null) return null;
  const entry = anchorStandTile(door);
  const distances = walkDistances(map, entry);
  const exempt = widthExemptCells(map, crossings);
  const byWidth = new Map<number, WidthAnalysis>();
  const analysisFor = (width: number) => {
    let analysis = byWidth.get(width);
    if (analysis === undefined) {
      analysis = widthAnalysis(map, entry, width, exempt, null);
      byWidth.set(width, analysis);
    }
    return analysis;
  };
  const routes = map.anchors
    .filter((anchor) => anchor.id !== door.id)
    .map((anchor): TownRoute => {
      const stand = anchorStandTile(anchor);
      const onMap = isWalkable(map, stand);
      const steps = onMap ? distances[stand[1] * map.width + stand[0]] : -1;
      const tiles = steps === -1 ? null : steps;
      const directTiles = Math.abs(stand[0] - entry[0]) + Math.abs(stand[1] - entry[1]);
      const main = anchor.kind === "door";
      const requiredWidth = main ? tuning.mainRouteMinWidthTiles : tuning.minPathWidthTiles;
      const analysis = analysisFor(requiredWidth);
      const path = tiles === null ? null : treePath(map, analysis.tree, stand);
      return {
        anchor,
        stand,
        distance: Math.hypot(stand[0] - entry[0], stand[1] - entry[1]),
        tiles,
        seconds: tiles === null ? null : crossingSeconds(tiles, tuning.walkingSpeedTilesPerSecond),
        directTiles,
        detourRatio: tiles === null || directTiles === 0 ? null : tiles / directTiles,
        main,
        requiredWidth,
        narrowCells: path === null ? [] : narrowOnPath(map, path, analysis.narrow),
        path: path ?? [],
      };
    });
  return { door, entry, routes };
}

/**
 * The anchors whose route from the town is wide enough only through
 * `crossing`: with every crossing exempt their routes cross no narrow cell,
 * but with this crossing's cells blocked they cross one or reach nothing.
 */
export function anchorsOnlyThroughCrossing(
  map: CompiledDreamMap,
  layout: TownLayout,
  crossings: readonly DreamMapNarrowCrossing[],
  crossing: DreamMapNarrowCrossing,
): CompiledAnchor[] {
  const exempt = widthExemptCells(
    map,
    crossings.filter((other) => other !== crossing),
  );
  const blocked = cellMask(map, crossing.cells);
  const byWidth = new Map<number, WidthAnalysis>();
  const stranded: CompiledAnchor[] = [];
  for (const route of layout.routes) {
    if (route.tiles === null || route.narrowCells.length > 0) continue;
    let analysis = byWidth.get(route.requiredWidth);
    if (analysis === undefined) {
      analysis = widthAnalysis(map, layout.entry, route.requiredWidth, exempt, blocked);
      byWidth.set(route.requiredWidth, analysis);
    }
    const path = treePath(map, analysis.tree, route.stand);
    if (path === null || narrowOnPath(map, path, analysis.narrow).length > 0) stranded.push(route.anchor);
  }
  return stranded;
}

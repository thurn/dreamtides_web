// A* over a compiled map's walkability grid with 4-way steps of equal cost,
// matching tile-by-tile walking. Ties break deterministically (lower f, then
// lower heuristic, then earlier discovery), so the same grid and endpoints
// always yield the same path.

import { isWalkable, type WalkabilityGrid } from "./compiled";
import type { TilePoint } from "./definition";

const STEPS: readonly TilePoint[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

interface OpenNode {
  readonly cell: number;
  readonly f: number;
  readonly h: number;
  readonly order: number;
}

function before(a: OpenNode, b: OpenNode): boolean {
  return a.f !== b.f ? a.f < b.f : a.h !== b.h ? a.h < b.h : a.order < b.order;
}

/** A binary min-heap of open nodes. */
class OpenHeap {
  private readonly nodes: OpenNode[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: OpenNode): void {
    const nodes = this.nodes;
    nodes.push(node);
    let index = nodes.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!before(nodes[index], nodes[parent])) break;
      [nodes[index], nodes[parent]] = [nodes[parent], nodes[index]];
      index = parent;
    }
  }

  pop(): OpenNode | undefined {
    const nodes = this.nodes;
    const top = nodes[0];
    const last = nodes.pop();
    if (nodes.length > 0 && last !== undefined) {
      nodes[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < nodes.length && before(nodes[left], nodes[smallest])) smallest = left;
        if (right < nodes.length && before(nodes[right], nodes[smallest])) smallest = right;
        if (smallest === index) break;
        [nodes[index], nodes[smallest]] = [nodes[smallest], nodes[index]];
        index = smallest;
      }
    }
    return top;
  }
}

/**
 * The shortest 4-way path from `from` to `to`, both ends included, or null
 * when `to` is blocked, off the grid, or unreachable. `from` need not be
 * walkable (a character may stand on a blocked anchor tile).
 */
export function findPath(
  grid: WalkabilityGrid,
  from: TilePoint,
  to: TilePoint,
): TilePoint[] | null {
  const { width, height } = grid;
  const onGrid = ([x, y]: TilePoint) =>
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
  if (!onGrid(from) || !isWalkable(grid, to)) return null;
  const start = from[1] * width + from[0];
  const goal = to[1] * width + to[0];
  const heuristic = (cell: number) =>
    Math.abs((cell % width) - to[0]) + Math.abs(Math.floor(cell / width) - to[1]);
  const cost = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(width * height).fill(-1);
  const closed = new Uint8Array(width * height);
  const open = new OpenHeap();
  let order = 0;
  cost[start] = 0;
  open.push({ cell: start, f: heuristic(start), h: heuristic(start), order: order++ });
  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) break;
    if (closed[current.cell] === 1) continue;
    closed[current.cell] = 1;
    if (current.cell === goal) {
      const path: TilePoint[] = [];
      for (let cell = goal; cell !== -1; cell = cameFrom[cell]) {
        path.push([cell % width, Math.floor(cell / width)]);
      }
      return path.reverse();
    }
    const x = current.cell % width;
    const y = Math.floor(current.cell / width);
    for (const [dx, dy] of STEPS) {
      const next: TilePoint = [x + dx, y + dy];
      if (!isWalkable(grid, next)) continue;
      const cell = next[1] * width + next[0];
      const nextCost = cost[current.cell] + 1;
      if (closed[cell] === 1 || nextCost >= cost[cell]) continue;
      cost[cell] = nextCost;
      cameFrom[cell] = current.cell;
      const h = heuristic(cell);
      open.push({ cell, f: nextCost + h, h, order: order++ });
    }
  }
  return null;
}

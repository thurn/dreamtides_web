// The A* contract: shortest 4-way paths with both ends, detours around
// blocked cells, null for blocked, off-grid or unreachable goals, and the
// same path for the same grid and endpoints.

import { describe, expect, it } from "vitest";
import type { WalkabilityGrid } from "./compiled";
import { findPath } from "./pathfinding";

/** A grid from rows of `.` (walkable) and `#` (blocked). */
function grid(rows: readonly string[]): WalkabilityGrid {
  return {
    width: rows[0].length,
    height: rows.length,
    walkable: rows.join("").replace(/\./gu, "1").replace(/#/gu, "0"),
  };
}

const ROOM = grid([
  ".....",
  ".###.",
  ".#...",
  ".#.#.",
  "...#.",
]);

describe("findPath", () => {
  it("walks a straight line", () => {
    expect(findPath(ROOM, [0, 0], [4, 0])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  });

  it("detours around walls along a shortest path", () => {
    const path = findPath(ROOM, [2, 2], [2, 4]);
    expect(path?.[0]).toEqual([2, 2]);
    expect(path?.[path.length - 1]).toEqual([2, 4]);
    expect(path).toHaveLength(3);
    const around = findPath(ROOM, [0, 4], [4, 4]);
    expect(around).toHaveLength(9);
    for (const [index, [x, y]] of (around ?? []).entries()) {
      expect(ROOM.walkable[y * ROOM.width + x]).toBe("1");
      if (index === 0) continue;
      const [px, py] = around![index - 1];
      expect(Math.abs(px - x) + Math.abs(py - y)).toBe(1);
    }
  });

  it("returns null for blocked, off-grid and unreachable goals", () => {
    expect(findPath(ROOM, [0, 0], [1, 1])).toBeNull();
    expect(findPath(ROOM, [0, 0], [9, 0])).toBeNull();
    expect(findPath(grid([".#."]), [0, 0], [2, 0])).toBeNull();
  });

  it("starts from a blocked tile and returns one tile for a trivial path", () => {
    expect(findPath(ROOM, [1, 1], [0, 1])).toEqual([[1, 1], [0, 1]]);
    expect(findPath(ROOM, [0, 0], [0, 0])).toEqual([[0, 0]]);
  });

  it("is deterministic", () => {
    const open = grid(["......", "......", "......", "......"]);
    expect(findPath(open, [0, 0], [5, 3])).toEqual(findPath(open, [0, 0], [5, 3]));
  });
});

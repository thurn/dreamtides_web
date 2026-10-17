// Walker contract (P14): held keys step tile by tile at the walking speed and
// stop at blocked tiles (turning to face them); click paths are followed and
// cancelled by a key press; a step in progress finishes before a new path.

import { describe, expect, it } from "vitest";
import type { TilePoint } from "../map/definition";
import {
  advanceWalker,
  facedTile,
  followPath,
  holdDirection,
  initialWalker,
  isIdle,
  walkerPosition,
} from "./walker";

const OPEN = () => true;
const WALL_AT_X3 = ([x]: TilePoint) => x !== 3;

describe("walker", () => {
  it("steps one tile per quarter second while a key is held, finishing the last step on release", () => {
    let walker = holdDirection(initialWalker([0, 0]), "right", OPEN);
    walker = advanceWalker(walker, 0.125, 4, OPEN);
    expect(walkerPosition(walker)).toEqual({ x: 0.5, y: 0 });
    walker = advanceWalker(walker, 0.375, 4, OPEN);
    expect(walker.tile).toEqual([2, 0]);
    expect(walker.step?.to).toEqual([3, 0]);
    walker = holdDirection(walker, null, OPEN);
    walker = advanceWalker(walker, 1, 4, OPEN);
    expect(walker.tile).toEqual([3, 0]);
    expect(isIdle(walker)).toBe(true);
  });

  it("stops at a blocked tile and faces it", () => {
    let walker = holdDirection(initialWalker([1, 0], "down"), "right", WALL_AT_X3);
    walker = advanceWalker(walker, 2, 4, WALL_AT_X3);
    expect(walker.tile).toEqual([2, 0]);
    expect(walker.step).toBeNull();
    expect(walker.facing).toBe("right");
    expect(facedTile(walker)).toEqual([3, 0]);
  });

  it("turns toward a blocked direction without moving", () => {
    const walker = holdDirection(initialWalker([2, 0], "down"), "right", WALL_AT_X3);
    expect(walker.tile).toEqual([2, 0]);
    expect(walker.step).toBeNull();
    expect(walker.facing).toBe("right");
  });

  it("follows a path to its end and faces along it", () => {
    const path: TilePoint[] = [[0, 0], [1, 0], [1, 1], [1, 2]];
    let walker = followPath(initialWalker([0, 0]), path, OPEN);
    walker = advanceWalker(walker, 10, 4, OPEN);
    expect(walker.tile).toEqual([1, 2]);
    expect(walker.facing).toBe("down");
    expect(isIdle(walker)).toBe(true);
  });

  it("finishes the step in progress before a new path, and a key cancels a path", () => {
    let walker = followPath(initialWalker([0, 0]), [[0, 0], [1, 0], [2, 0]], OPEN);
    walker = advanceWalker(walker, 0.1, 4, OPEN);
    walker = followPath(walker, [[1, 0], [1, 1]], OPEN);
    expect(walker.step?.to).toEqual([1, 0]);
    walker = advanceWalker(walker, 1, 4, OPEN);
    expect(walker.tile).toEqual([1, 1]);

    walker = followPath(walker, [[1, 1], [1, 2], [1, 3], [1, 4]], OPEN);
    walker = holdDirection(walker, "left", OPEN);
    expect(walker.path).toEqual([]);
  });

  it("stops a path at a tile that became blocked", () => {
    let walker = followPath(initialWalker([0, 0]), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], OPEN);
    walker = advanceWalker(walker, 5, 4, WALL_AT_X3);
    expect(walker.tile).toEqual([2, 0]);
    expect(isIdle(walker)).toBe(true);
  });
});

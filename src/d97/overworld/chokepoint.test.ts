// Chokepoints over a synthetic corridor: a beaten guardian steps aside to open
// ground off the corridor line and never onto a tile that cuts its door off;
// an unbeaten guardian is the walk target for anything beyond it.

import { describe, expect, it } from "vitest";
import type { CompiledAnchor, WalkabilityGrid } from "../map/compiled";
import type { TilePoint } from "../map/definition";
import { parseDreamAnchorId } from "../../types/identifiers";
import { asideTile, blockingGuardian } from "./chokepoint";
import { movementGrid } from "./interactions";

/** A grid from rows of `.` (walkable) and `#` (blocked). */
function grid(rows: readonly string[]): WalkabilityGrid {
  return {
    width: rows[0].length,
    height: rows.length,
    walkable: rows.map((row) => row.replace(/\./g, "1").replace(/#/g, "0")).join(""),
  };
}

// A wall with a one-tile gap at (3, 3); the guardian stands just past it at
// (4, 3) and its door is at (7, 3).
const ROOM = grid([
  "#########",
  "...#.....",
  "...#.....",
  ".........",
  "...#.....",
  "...#.....",
  "#########",
]);
const WALLED = grid([
  "#########",
  "...######",
  "...######",
  ".........",
  "...######",
  "...######",
  "#########",
]);

const GUARDIAN: CompiledAnchor = { id: parseDreamAnchorId("d9700000-0000-4000-8000-0000000000a1"), kind: "guardian", at: [4, 3] };
const DOOR: TilePoint = [7, 3];

describe("asideTile", () => {
  it("steps to the side onto open ground, not back along the corridor", () => {
    const tile = asideTile(ROOM, GUARDIAN.at, DOOR);
    expect(tile).not.toBeNull();
    expect(tile![0]).toBe(4);
    expect([2, 4]).toContain(tile![1]);
  });

  it("never blocks the only way to its door", () => {
    // Past the gap the corridor is one tile wide: any step aside cuts the door off.
    expect(asideTile(WALLED, GUARDIAN.at, DOOR)).toBeNull();
    // Without a door to keep open, it may step back.
    expect(asideTile(WALLED, GUARDIAN.at, null)).toEqual([5, 3]);
  });
});

describe("blockingGuardian", () => {
  const blocked = movementGrid(ROOM, [GUARDIAN]);
  it("returns the guardian when it alone stands between the player and the target", () => {
    const found = blockingGuardian(blocked, [GUARDIAN], [0, 3], { tile: [6, 1], beside: false });
    expect(found?.guardian.id).toBe(GUARDIAN.id);
    expect(found?.path[found.path.length - 1]).toEqual([3, 3]);
  });

  it("returns null when the target is unreachable for another reason", () => {
    expect(blockingGuardian(blocked, [GUARDIAN], [0, 3], { tile: [3, 1], beside: false })).toBeNull();
  });
});

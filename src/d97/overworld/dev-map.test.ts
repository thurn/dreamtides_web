// The development dream compiles to a medium map whose spawn is walkable,
// whose unguarded anchors are reachable from the spawn, and whose guarded
// door is unreachable while its guardian stands.

import { describe, expect, it } from "vitest";
import { isWalkable } from "../map/compiled";
import { compileDevMap } from "./dev-map";
import { movementGrid, pathBeside } from "./interactions";
import { spawnTile } from "./spawn";

describe("compileDevMap", () => {
  const map = compileDevMap();
  const grid = movementGrid(map, map.anchors);
  const spawn = spawnTile(map, grid);

  it("is a medium map with a walkable spawn", () => {
    expect([map.width, map.height]).toEqual([110, 110]);
    expect(isWalkable(grid, spawn)).toBe(true);
  });

  it("reaches every anchor but the guarded door and the chest behind it", () => {
    const guardian = map.anchors.find((anchor) => anchor.kind === "guardian");
    const guarded = new Set([guardian?.blocksDoor, ...map.anchors.filter((anchor) => anchor.behindGuardian !== undefined).map((anchor) => anchor.id)]);
    for (const anchor of map.anchors) {
      const reachable = pathBeside(grid, spawn, anchor.at) !== null;
      expect(reachable, anchor.kind).toBe(!guarded.has(anchor.id));
    }
  });
});

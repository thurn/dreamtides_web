// Interaction contract: anchors block their tiles for movement unless hidden
// (a hidden anchor's tile is walkable and nothing to interact with); a click on
// an anchor walks to the nearest tile beside it; the registry runs the
// handler registered for an anchor's kind and reports kinds without one.

import { describe, expect, it, vi } from "vitest";
import { parseDreamAnchorId } from "../../types/identifiers";
import type { CompiledAnchor, WalkabilityGrid } from "../map/compiled";
import { isWalkable } from "../map/compiled";
import { anchorAt, createInteractionRegistry, movementGrid, pathBeside, shownMovement } from "./interactions";

const SHOP: CompiledAnchor = {
  id: parseDreamAnchorId("d9700000-0000-4000-8000-0000000000a1"),
  kind: "shop",
  at: [3, 1],
};
const GRID: WalkabilityGrid = { width: 5, height: 3, walkable: "111111111111111" };

describe("movementGrid", () => {
  it("blocks every anchor's tile", () => {
    const grid = movementGrid(GRID, [SHOP]);
    expect(isWalkable(grid, [3, 1])).toBe(false);
    expect(isWalkable(grid, [2, 1])).toBe(true);
  });
});

describe("shownMovement", () => {
  const OBJECT: CompiledAnchor = {
    id: parseDreamAnchorId("d9700000-0000-4000-8000-0000000000a2"),
    kind: "object",
    at: [1, 1],
  };

  it("opens a hidden anchor's tile and blocks it again once shown", () => {
    const hidden = shownMovement(GRID, [SHOP, OBJECT], new Set([OBJECT.id]));
    expect(isWalkable(hidden.grid, OBJECT.at)).toBe(true);
    expect(isWalkable(hidden.grid, SHOP.at)).toBe(false);
    expect(anchorAt(hidden.byTile, OBJECT.at)).toBeUndefined();
    expect(pathBeside(hidden.grid, [0, 1], SHOP.at)).toEqual([[0, 1], [1, 1], [2, 1]]);

    const shown = shownMovement(GRID, [SHOP, OBJECT], new Set());
    expect(isWalkable(shown.grid, OBJECT.at)).toBe(false);
    expect(anchorAt(shown.byTile, OBJECT.at)).toBe(OBJECT);
  });
});

describe("pathBeside", () => {
  it("walks to the nearest tile beside the anchor", () => {
    const grid = movementGrid(GRID, [SHOP]);
    const path = pathBeside(grid, [0, 1], SHOP.at);
    expect(path?.[path.length - 1]).toEqual([2, 1]);
    expect(path).toHaveLength(3);
    expect(pathBeside(grid, [2, 1], SHOP.at)).toEqual([[2, 1]]);
  });

  it("returns null when nothing beside the anchor is reachable", () => {
    const walled: WalkabilityGrid = { width: 5, height: 3, walkable: "110111101111011" };
    expect(pathBeside(movementGrid(walled, [SHOP]), [0, 1], SHOP.at)).toBeNull();
  });
});

describe("createInteractionRegistry", () => {
  it("runs the handler registered for the anchor's kind", () => {
    const registry = createInteractionRegistry();
    expect(registry.interact(SHOP)).toBe(false);
    const handler = vi.fn();
    const unregister = registry.register("shop", handler);
    expect(registry.interact(SHOP)).toBe(true);
    expect(handler).toHaveBeenCalledWith(SHOP);
    unregister();
    expect(registry.interact(SHOP)).toBe(false);
  });
});

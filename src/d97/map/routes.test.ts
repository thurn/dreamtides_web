// Walking analysis over synthetic row maps: crossing time, entries,
// reachability, the main route, region summaries and walkable areas.

import { describe, expect, it } from "vitest";
import type { CompiledAnchor } from "./compiled";
import { compiledFromRows, ROW_ANCHORS } from "./map-fixtures";
import {
  crossingSeconds,
  mainRoute,
  mapEntries,
  reachableCells,
  regionCenterTile,
  regionSummary,
  walkableComponentSizes,
  walkingRoute,
} from "./routes";
import { mapSizeClass, type D97MapTuning } from "./tuning";

describe("crossingSeconds", () => {
  it("divides tiles walked by walking speed", () => {
    expect(crossingSeconds(480, 4)).toBe(120);
    expect(crossingSeconds(0, 4)).toBe(0);
    expect(crossingSeconds(10, 2.5)).toBe(4);
  });

  it("rejects a non-positive speed", () => {
    expect(() => crossingSeconds(10, 0)).toThrow();
  });
});

describe("walkingRoute", () => {
  it("counts steps along the shortest path around walls", () => {
    const map = compiledFromRows([".#...", ".#.#.", "...#."]);
    const route = walkingRoute(map, [0, 0], [4, 0], 2);
    expect(route?.tiles).toBe(8);
    expect(route?.seconds).toBe(4);
    expect(route?.path[0]).toEqual([0, 0]);
    expect(route?.path[route.path.length - 1]).toEqual([4, 0]);
    expect(walkingRoute(compiledFromRows([".#."]), [0, 0], [2, 0], 1)).toBeNull();
  });
});

describe("mainRoute", () => {
  const doors: CompiledAnchor[] = [
    { id: ROW_ANCHORS.doorA, kind: "door", at: [0, 0], entry: [0, 1] },
    { id: ROW_ANCHORS.doorB, kind: "door", at: [5, 0], entry: [5, 1] },
    { id: ROW_ANCHORS.doorC, kind: "door", at: [9, 2], entry: [9, 3] },
  ];
  const map = compiledFromRows(["#####.####", "..........", "..........", ".........."], doors);

  it("is the longest shortest walk between door entries", () => {
    const route = mainRoute(map, 4);
    expect(route).toMatchObject({ fromDoor: ROW_ANCHORS.doorA, toDoor: ROW_ANCHORS.doorC, tiles: 11, seconds: 2.75 });
  });

  it("is null with fewer than two connected doors", () => {
    expect(mainRoute(compiledFromRows(["...."], doors.slice(0, 1)), 4)).toBeNull();
  });

  it("counts doors and waypoints as entries at their stand tiles", () => {
    const withWaypoint = compiledFromRows(
      ["#####.####", "..........", "..........", ".........."],
      [...doors, { id: ROW_ANCHORS.waypoint, kind: "waypoint", at: [3, 3] }, { id: ROW_ANCHORS.shop, kind: "shop", at: [2, 2] }],
    );
    expect(mapEntries(withWaypoint).map((entry) => entry.at)).toEqual([[0, 1], [5, 1], [9, 3], [3, 3]]);
  });
});

describe("reachability and regions", () => {
  const rows = ["...#..", "...#..", "######", "......"];
  const map = compiledFromRows(rows, [], [{ name: "west", from: [0, 0], to: [3, 1] }]);

  it("floods from the starts, never entering blocked cells", () => {
    const reached = reachableCells(map, [[0, 0]], [[1, 1]]);
    expect(Array.from(reached.slice(0, 6))).toEqual([1, 1, 1, 0, 0, 0]);
    expect(reached[1 * 6 + 1]).toBe(0);
    expect(reached[1 * 6 + 0]).toBe(1);
  });

  it("summarizes a region's walkable and reachable cells", () => {
    const reached = reachableCells(map, [[0, 0]]);
    expect(regionSummary(map, map.regions[0], reached)).toMatchObject({ cells: 8, walkable: 6, reachable: 6 });
    expect(regionCenterTile(map, map.regions[0], reached)).toEqual([1, 0]);
  });

  it("sizes the walkable areas, largest first", () => {
    expect(walkableComponentSizes(map)).toEqual([6, 6, 4]);
  });
});

describe("mapSizeClass", () => {
  const tuning: D97MapTuning = {
    walkingSpeedTilesPerSecond: 4,
    sizeClasses: [
      { size: "small", nominalSide: 60, maxSide: 80, crossingTargetSeconds: 60, crossingSeverity: "warning" },
      { size: "medium", nominalSide: 110, maxSide: 130, crossingTargetSeconds: 120, crossingSeverity: "error" },
    ],
    crossingTolerance: 0.25,
    doorMinSpacingTiles: 8,
  };

  it("picks the first class holding the longer side, else the largest", () => {
    expect(mapSizeClass(tuning, { width: 60, height: 80 }).size).toBe("small");
    expect(mapSizeClass(tuning, { width: 81, height: 20 }).size).toBe("medium");
    expect(mapSizeClass(tuning, { width: 200, height: 200 }).size).toBe("medium");
  });
});

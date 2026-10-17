// The D97 map validator rules over synthetic row maps: each rule passes a
// well-formed map and reports a broken one at the offending coordinate.

import { describe, expect, it } from "vitest";
import type { CompiledAnchor } from "./compiled";
import type { TilePoint } from "./definition";
import { compiledFromRows, ROW_ANCHORS } from "./map-fixtures";
import type { D97MapTuning } from "./tuning";
import {
  validateAnchorsReachable,
  validateAnchorsWalkable,
  validateDoorSpacing,
  validateDreamMap,
  validateGuardedAnchors,
  validateMainRouteCrossing,
} from "./validate";

const TUNING: D97MapTuning = {
  walkingSpeedTilesPerSecond: 1,
  sizeClasses: [
    { size: "medium", nominalSide: 12, maxSide: 100, crossingTargetSeconds: 10, crossingSeverity: "error" },
  ],
  crossingTolerance: 0.25,
  doorMinSpacingTiles: 8,
};

const door = (id: CompiledAnchor["id"], at: TilePoint, entry: TilePoint): CompiledAnchor => ({
  id,
  kind: "door",
  at,
  entry,
});

/** Two rooms joined by a one-tile corridor at 5,2 where the guardian stands. */
const GUARDED_ROWS = [
  "############",
  "#....#.....#",
  "#..........#",
  "#....#.....#",
  "############",
];
const GUARDED_ANCHORS: CompiledAnchor[] = [
  door(ROW_ANCHORS.doorA, [0, 2], [1, 2]),
  door(ROW_ANCHORS.doorB, [11, 2], [10, 2]),
  { id: ROW_ANCHORS.guardian, kind: "guardian", at: [5, 2], blocksDoor: ROW_ANCHORS.doorB },
  { id: ROW_ANCHORS.chest, kind: "chest", at: [8, 1], behindGuardian: ROW_ANCHORS.guardian },
  { id: ROW_ANCHORS.shop, kind: "shop", at: [2, 3] },
];

describe("validateAnchorsWalkable", () => {
  it("passes anchors on walkable cells, judging doors by their entry tile", () => {
    expect(validateAnchorsWalkable(compiledFromRows(GUARDED_ROWS, GUARDED_ANCHORS))).toEqual([]);
  });

  it("reports an anchor on a blocked cell at its coordinate", () => {
    const map = compiledFromRows(GUARDED_ROWS, [{ id: ROW_ANCHORS.shop, kind: "shop", at: [5, 1] }]);
    expect(validateAnchorsWalkable(map)).toEqual([
      expect.objectContaining({ rule: "anchor-walkable", severity: "error", anchorId: ROW_ANCHORS.shop, at: [5, 1] }),
    ]);
  });
});

describe("validateAnchorsReachable", () => {
  it("passes when the entries reach every anchor", () => {
    expect(validateAnchorsReachable(compiledFromRows(GUARDED_ROWS, GUARDED_ANCHORS))).toEqual([]);
  });

  it("reports an anchor in a sealed pocket and a door on an island", () => {
    const rows = ["#########", "#..#.##.#", "#..#..#.#", "#########"];
    const map = compiledFromRows(rows, [
      door(ROW_ANCHORS.doorA, [0, 1], [1, 1]),
      { id: ROW_ANCHORS.waypoint, kind: "waypoint", at: [2, 2] },
      door(ROW_ANCHORS.doorB, [6, 2], [5, 2]),
      { id: ROW_ANCHORS.shop, kind: "shop", at: [7, 1] },
    ]);
    expect(validateAnchorsReachable(map)).toEqual([
      expect.objectContaining({ rule: "anchor-reachable", anchorId: ROW_ANCHORS.doorB, at: [5, 2] }),
      expect.objectContaining({ rule: "anchor-reachable", anchorId: ROW_ANCHORS.shop, at: [7, 1] }),
    ]);
  });

  it("reports a map with no entries", () => {
    const map = compiledFromRows(GUARDED_ROWS, [{ id: ROW_ANCHORS.shop, kind: "shop", at: [2, 3] }]);
    expect(validateAnchorsReachable(map)).toEqual([{ rule: "no-entries", severity: "error" }]);
  });
});

describe("validateGuardedAnchors", () => {
  it("passes when the guardian's tile is the only way to its door and chest", () => {
    expect(validateGuardedAnchors(compiledFromRows(GUARDED_ROWS, GUARDED_ANCHORS))).toEqual([]);
  });

  it("reports a guarded door and chest reachable around a standing guardian", () => {
    const bypass = ["############", "#..........#", "#..........#", "#....#.....#", "############"];
    const findings = validateGuardedAnchors(compiledFromRows(bypass, GUARDED_ANCHORS));
    expect(findings).toEqual([
      expect.objectContaining({ rule: "guard-bypassed", anchorId: ROW_ANCHORS.doorB, at: [10, 2], guardianAt: [5, 2] }),
      expect.objectContaining({ rule: "guard-bypassed", anchorId: ROW_ANCHORS.chest, at: [8, 1], guardianAt: [5, 2] }),
    ]);
  });
});

describe("validateDoorSpacing", () => {
  const rows = ["............"];
  it("passes doors at least the minimum spacing apart", () => {
    const map = compiledFromRows(rows, [door(ROW_ANCHORS.doorA, [0, 0], [0, 0]), door(ROW_ANCHORS.doorB, [8, 0], [8, 0])]);
    expect(validateDoorSpacing(map, TUNING)).toEqual([]);
  });

  it("reports doors closer than the minimum spacing", () => {
    const map = compiledFromRows(rows, [door(ROW_ANCHORS.doorA, [0, 0], [0, 0]), door(ROW_ANCHORS.doorB, [3, 0], [3, 0])]);
    expect(validateDoorSpacing(map, TUNING)).toEqual([
      expect.objectContaining({
        rule: "door-spacing",
        doors: [ROW_ANCHORS.doorA, ROW_ANCHORS.doorB],
        at: [0, 0],
        otherAt: [3, 0],
        distance: 3,
        minimum: 8,
      }),
    ]);
  });
});

describe("validateMainRouteCrossing", () => {
  const corridor = compiledFromRows(
    ["............"],
    [door(ROW_ANCHORS.doorA, [0, 0], [0, 0]), door(ROW_ANCHORS.doorB, [11, 0], [11, 0])],
  );

  it("passes a main route inside the target band", () => {
    // 11 tiles at 1 tile/s against 10 s ± 25%.
    expect(validateMainRouteCrossing(corridor, TUNING)).toEqual([]);
  });

  it("reports a main route outside the target band", () => {
    const slow = { ...TUNING, sizeClasses: [{ ...TUNING.sizeClasses[0], crossingTargetSeconds: 30 }] };
    expect(validateMainRouteCrossing(corridor, slow)).toEqual([
      expect.objectContaining({
        rule: "main-route-crossing",
        severity: "error",
        size: "medium",
        targetSeconds: 30,
        route: expect.objectContaining({ tiles: 11, seconds: 11 }) as unknown,
      }),
    ]);
  });

  it("reports a map without two connected doors, graded by the size class", () => {
    const lone = compiledFromRows(["......"], [door(ROW_ANCHORS.doorA, [0, 0], [0, 0])]);
    const lenient = { ...TUNING, sizeClasses: [{ ...TUNING.sizeClasses[0], crossingSeverity: "warning" as const }] };
    expect(validateMainRouteCrossing(lone, lenient)).toEqual([
      { rule: "main-route-missing", severity: "warning", size: "medium" },
    ]);
  });
});

describe("validateDreamMap", () => {
  it("runs every rule", () => {
    const map = compiledFromRows(GUARDED_ROWS, GUARDED_ANCHORS);
    const rules = validateDreamMap(map, { ...TUNING, doorMinSpacingTiles: 20 }).map((finding) => finding.rule);
    expect(rules).toEqual(["door-spacing"]);
  });
});

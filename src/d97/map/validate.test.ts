// The D97 map validator rules over synthetic row maps: each rule passes a
// well-formed map and reports a broken one at the offending coordinate. The
// layout rules (size, town, path width, detour, reach) run through
// `validateDreamMap` with a town, so each broken map yields exactly its own
// finding.

import { describe, expect, it } from "vitest";
import type { CompiledAnchor } from "./compiled";
import type { DreamMapNarrowCrossing, TilePoint } from "./definition";
import type { DreamMapTown } from "./layout";
import { compiledFromRows, FIXTURE_MAP_ID, FIXTURE_TUNING, ROW_ANCHORS } from "./map-fixtures";
import {
  validateAnchorsReachable,
  validateAnchorsWalkable,
  validateDoorSpacing,
  validateDreamMap,
  validateGuardedAnchors,
  validateMapSize,
  validateTilesetsServed,
} from "./validate";

const TUNING = FIXTURE_TUNING;

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

describe("validateDreamMap", () => {
  it("runs every rule", () => {
    const map = compiledFromRows(GUARDED_ROWS, GUARDED_ANCHORS);
    const rules = validateDreamMap(map, { ...TUNING, doorMinSpacingTiles: 20 }).map((finding) => finding.rule);
    expect(rules).toEqual(["door-spacing"]);
  });
});

describe("room reachability (P19)", () => {
  const buildingDoor = (id: CompiledAnchor["id"], at: TilePoint, entry: TilePoint): CompiledAnchor => ({
    id,
    kind: "buildingDoor",
    at,
    entry,
  });
  /** A dream map: a door's yard, and a walled-off house front whose building door is at 9,0. */
  const DREAM_ROWS = ["#########.#", "#....#....#", "#....#....#", "###########"];

  it("reports a building door its dream map's entries cannot reach", () => {
    const map = compiledFromRows(DREAM_ROWS, [door(ROW_ANCHORS.doorA, [0, 1], [1, 1]), buildingDoor(ROW_ANCHORS.doorB, [9, 0], [9, 1])]);
    expect(validateAnchorsReachable(map)).toEqual([
      expect.objectContaining({ rule: "anchor-reachable", anchorId: ROW_ANCHORS.doorB, at: [9, 1] }),
    ]);
  });

  it("passes a building door the dream map's entries reach, which is no entry itself", () => {
    const open = ["#########.#", "#.........#", "#....#....#", "###########"];
    const map = compiledFromRows(open, [door(ROW_ANCHORS.doorA, [0, 1], [1, 1]), buildingDoor(ROW_ANCHORS.doorB, [9, 0], [9, 1])]);
    expect(validateAnchorsReachable(map)).toEqual([]);
  });

  it("reaches a room's anchors from its building door, and reports one walled off from it", () => {
    const ROOM_ROWS = ["#######", "#..#..#", "#..#..#", "#.#####"];
    const door = buildingDoor(ROW_ANCHORS.doorC, [1, 3], [1, 2]);
    const reachable = compiledFromRows(ROOM_ROWS, [door, { id: ROW_ANCHORS.shop, kind: "shop", at: [2, 1] }]);
    expect(validateAnchorsReachable(reachable)).toEqual([]);
    const walled = compiledFromRows(ROOM_ROWS, [door, { id: ROW_ANCHORS.chest, kind: "chest", at: [5, 1] }]);
    expect(validateAnchorsReachable(walled)).toEqual([
      expect.objectContaining({ rule: "anchor-reachable", anchorId: ROW_ANCHORS.chest, at: [5, 1] }),
    ]);
  });

  it("holds a room to no size class", () => {
    const room = compiledFromRows(["#.#", "#.#"], [buildingDoor(ROW_ANCHORS.doorC, [1, 1], [1, 0])]);
    const tiny = { ...TUNING, sizeClasses: [{ ...TUNING.sizeClasses[0], maxSide: 1 }] };
    expect(validateMapSize(room, tiny)).toEqual([]);
  });
});

describe("validateTilesetsServed", () => {
  const tileset = (name: string, image: string | null, tileImages: readonly string[] = []) => ({
    firstGid: 1,
    name,
    image,
    imageWidth: 32,
    imageHeight: 32,
    tileWidth: 32,
    tileHeight: 32,
    columns: 1,
    tileCount: 1,
    spacing: 0,
    margin: 0,
    tileOffset: { x: 0, y: 0 },
    tileImages: tileImages.map((path, id) => ({ id, image: path, width: 32, height: 32 })),
  });

  it("reports each drawn image outside the served subtrees", () => {
    const map = {
      ...compiledFromRows(["...."]),
      tilesets: [
        tileset("ground", "pack/tiles/ground.png"),
        tileset("rules", "pack/automapping/rules.png"),
        tileset("props", null, ["pack/tiles/a.png", "pack/sprites/b.png"]),
      ],
    };
    expect(validateTilesetsServed(map, ["pack/tiles"])).toEqual([
      { rule: "tileset-unserved", severity: "error", tileset: "rules", image: "pack/automapping/rules.png" },
      { rule: "tileset-unserved", severity: "error", tileset: "props", image: "pack/sprites/b.png" },
    ]);
    expect(validateTilesetsServed(map, ["pack/tiles/", "pack/automapping", "pack/sprites"])).toEqual([]);
    // Without the served subtrees, validateDreamMap skips the rule.
    expect(validateDreamMap(map, TUNING).some((finding) => finding.rule === "tileset-unserved")).toBe(false);
  });
});

describe("the layout rules (P13, P33)", () => {
  /** A compact open field, 20×9. */
  const FIELD = Array.from({ length: 9 }, () => "....................");
  const TOWN: DreamMapTown = {
    doorAnchorId: ROW_ANCHORS.doorA,
    cluster: "square",
    townAnchorIds: [ROW_ANCHORS.shop],
    exitDoorAnchorId: ROW_ANCHORS.doorB,
  };
  /** The town door, west, arriving at 1,4. */
  const TOWN_DOOR = door(ROW_ANCHORS.doorA, [0, 4], [1, 4]);
  const EXIT_DOOR = door(ROW_ANCHORS.doorB, [19, 4], [18, 4]);
  const anchor = (id: CompiledAnchor["id"], kind: CompiledAnchor["kind"], at: TilePoint, cluster?: string): CompiledAnchor =>
    cluster === undefined ? { id, kind, at } : { id, kind, at, cluster };
  const CLEAN: CompiledAnchor[] = [
    TOWN_DOOR,
    anchor(ROW_ANCHORS.waypoint, "waypoint", [3, 4]),
    anchor(ROW_ANCHORS.friendly, "friendly", [2, 6], "square"),
    anchor(ROW_ANCHORS.shop, "shop", [3, 2]),
    anchor(ROW_ANCHORS.challenger, "challenger", [6, 1]),
    EXIT_DOOR,
  ];
  const validate = (
    rows: readonly string[],
    anchors: readonly CompiledAnchor[],
    narrowCrossings: readonly DreamMapNarrowCrossing[] = [],
    tuning = TUNING,
  ) => validateDreamMap(compiledFromRows(rows, anchors), tuning, { town: TOWN, narrowCrossings });

  /**
   * The field with a walled pocket in its south-east (x 7–19, rows 7–8)
   * whose one way in is the 1-tile gap at 12,6, or with `alternative` also
   * a 2-wide gap at 17–18,6.
   */
  const pocket = (alternative: boolean) =>
    FIELD.map((row, y) => {
      if (y < 6) return row;
      const cells = Array.from(row);
      cells[6] = "#";
      if (y === 6) {
        for (let x = 6; x < 20; x += 1) cells[x] = x === 12 || (alternative && (x === 17 || x === 18)) ? "." : "#";
      }
      return cells.join("");
    });
  const POCKET_CHEST = anchor(ROW_ANCHORS.chest, "chest", [15, 8]);
  const PLANK: DreamMapNarrowCrossing = { name: "plank", cells: [[12, 6]] };

  it("finds nothing on a clean compact map", () => {
    expect(validate(FIELD, CLEAN)).toEqual([]);
  });

  it("reports a town anchor beyond the town radius", () => {
    const anchors = CLEAN.map((entry) => (entry.id === ROW_ANCHORS.shop ? { ...entry, at: [8, 2] as const } : entry));
    expect(validate(FIELD, anchors)).toEqual([
      expect.objectContaining({ rule: "town-outside", severity: "error", anchorId: ROW_ANCHORS.shop, at: [8, 2], radius: 4 }),
    ]);
  });

  it("reports a challenger inside the town", () => {
    const anchors = CLEAN.map((entry) => (entry.id === ROW_ANCHORS.challenger ? { ...entry, at: [4, 4] as const } : entry));
    expect(validate(FIELD, anchors)).toEqual([
      expect.objectContaining({ rule: "town-intrusion", severity: "error", anchorId: ROW_ANCHORS.challenger, at: [4, 4] }),
    ]);
  });

  it("reports the exit door inside the town", () => {
    const anchors = [TOWN_DOOR, door(ROW_ANCHORS.doorB, [5, 0], [4, 2])];
    expect(validate(FIELD, anchors, [], { ...TUNING, doorMinSpacingTiles: 1 })).toEqual([
      expect.objectContaining({ rule: "town-intrusion", anchorId: ROW_ANCHORS.doorB, at: [4, 2] }),
    ]);
  });

  it("reports a 1-tile-wide only route by its narrow cell", () => {
    expect(validate(pocket(false), [TOWN_DOOR, POCKET_CHEST])).toEqual([
      expect.objectContaining({
        rule: "path-narrow",
        severity: "error",
        anchorId: ROW_ANCHORS.chest,
        at: [15, 8],
        requiredWidth: 2,
        main: false,
        cells: [[12, 6]],
      }),
    ]);
  });

  it("holds a main route out of town to the wider width", () => {
    // A 2-tall gap in a wall at x 10: wide enough for 2, not for 3.
    const walled = FIELD.map((row, y) => (y === 4 || y === 5 ? row : `${row.slice(0, 10)}#${row.slice(11)}`));
    expect(validate(walled, [TOWN_DOOR, EXIT_DOOR])).toEqual([
      expect.objectContaining({ rule: "path-narrow", anchorId: ROW_ANCHORS.doorB, requiredWidth: 3, main: true, cells: [[10, 4]] }),
    ]);
  });

  it("exempts a declared narrow crossing that is not the only route", () => {
    expect(validate(pocket(true), [TOWN_DOOR, POCKET_CHEST], [PLANK])).toEqual([]);
  });

  it("reports a declared narrow crossing that is the only route", () => {
    expect(validate(pocket(false), [TOWN_DOOR, POCKET_CHEST], [PLANK])).toEqual([
      expect.objectContaining({
        rule: "crossing-only-route",
        severity: "error",
        crossing: "plank",
        cells: [[12, 6]],
        anchors: [expect.objectContaining({ anchorId: ROW_ANCHORS.chest, at: [15, 8] })],
      }),
    ]);
  });

  it("reports a walk over the detour ratio", () => {
    // A wall at x 8 down to row 6: the chest just behind it is 8 tiles away on open ground, 14 on foot.
    const walled = FIELD.map((row, y) => (y > 6 ? row : `${row.slice(0, 8)}#${row.slice(9)}`));
    expect(validate(walled, [TOWN_DOOR, anchor(ROW_ANCHORS.chest, "chest", [9, 4])])).toEqual([
      expect.objectContaining({
        rule: "detour",
        severity: "error",
        anchorId: ROW_ANCHORS.chest,
        at: [9, 4],
        tiles: 14,
        directTiles: 8,
        ratio: 1.75,
        maxRatio: 1.6,
      }),
    ]);
  });

  it("reports a reach over the size class's maximum", () => {
    expect(validate(FIELD, [TOWN_DOOR, anchor(ROW_ANCHORS.challenger, "challenger", [19, 8])])).toEqual([
      expect.objectContaining({
        rule: "reach",
        severity: "error",
        anchorId: ROW_ANCHORS.challenger,
        at: [19, 8],
        size: "medium",
        tiles: 22,
        seconds: 22,
        maxSeconds: 20,
      }),
    ]);
  });

  it("reports a map over the largest size class", () => {
    const small = { ...TUNING, sizeClasses: [{ ...TUNING.sizeClasses[0], maxSide: 16 }] };
    expect(validate(FIELD, CLEAN, [], small)).toEqual([
      expect.objectContaining({ rule: "map-oversize", side: 20, maxSide: 16 }),
    ]);
  });

  it("reports a dream map with no town, or a town door that is not a door on it", () => {
    const map = compiledFromRows(FIELD, CLEAN);
    expect(validateDreamMap(map, TUNING, { town: null })).toEqual([expect.objectContaining({ rule: "town-missing" })]);
    expect(validateDreamMap(map, TUNING, { town: { ...TOWN, doorAnchorId: ROW_ANCHORS.shop } })).toEqual([
      expect.objectContaining({ rule: "town-door-unknown", doorAnchorId: ROW_ANCHORS.shop }),
    ]);
  });

  it("skips the town rules on a map no dream plays", () => {
    const anchors = CLEAN.map((entry) => (entry.id === ROW_ANCHORS.challenger ? { ...entry, at: [4, 4] as const } : entry));
    expect(validateDreamMap(compiledFromRows(FIELD, anchors), TUNING)).toEqual([]);
  });

  it("downgrades an allowlisted map's layout findings to allowlisted warnings", () => {
    const allowlisted = { ...TUNING, layoutAllowlist: [FIXTURE_MAP_ID] };
    const findings = validate(
      FIELD,
      [TOWN_DOOR, anchor(ROW_ANCHORS.challenger, "challenger", [19, 8]), door(ROW_ANCHORS.doorC, [0, 0], [1, 1])],
      [],
      allowlisted,
    );
    // Door spacing is no layout rule: it stays an error.
    expect(findings).toEqual([
      expect.objectContaining({ rule: "door-spacing", severity: "error" }),
      expect.objectContaining({ rule: "reach", severity: "warning", allowlisted: true }),
    ]);
  });
});

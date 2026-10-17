// The recipe summary the inspector prints: stamp footprints and points,
// brush areas and reseasons, in compiled coordinates after later crops.

import { describe, expect, it } from "vitest";
import { HUT, HUT_STAMP, WATER, fixtureDefinition } from "./map-fixtures";
import { recipePlacements } from "./recipe-summary";

describe("recipePlacements", () => {
  it("shifts operations before a crop into compiled coordinates", () => {
    const definition = fixtureDefinition({
      recipe: [
        { op: "stamp", stamp: HUT, at: [3, 3] },
        { op: "brush", terrain: WATER, erase: true, shape: { kind: "path", points: [[2, 1], [5, 1]] } },
        { op: "crop", from: [1, 1], to: [7, 5] },
        { op: "reseason", season: "winter", from: [0, 0], to: [2, 2] },
        { op: "paintTerrain", terrain: WATER, layer: "Moat", shape: { kind: "rect", from: [0, 0], to: [1, 1] } },
      ],
    });
    expect(recipePlacements(definition, new Map([[HUT, HUT_STAMP]]))).toEqual([
      { kind: "stamp", index: 0, stamp: HUT, rect: { from: [2, 2], to: [3, 3] }, points: [{ name: "door", at: [2, 3] }] },
      { kind: "terrain", index: 1, terrain: WATER, layer: null, erase: true, rect: { from: [1, 0], to: [4, 0] }, cells: 4 },
      { kind: "reseason", index: 3, season: "winter", rect: { from: [0, 0], to: [2, 2] } },
      { kind: "terrain", index: 4, terrain: WATER, layer: "Moat", erase: false, rect: { from: [0, 0], to: [1, 1] }, cells: 4 },
    ]);
  });

  it("reports a stamp missing from the catalog without a footprint", () => {
    const definition = fixtureDefinition({ recipe: [{ op: "stamp", stamp: HUT, at: [0, 0] }] });
    expect(recipePlacements(definition, new Map())).toEqual([{ kind: "stamp", index: 0, stamp: HUT, rect: null, points: [] }]);
  });
});

// A tileset's frames: the declared grid when the tileset states it, and the
// grid derived from the image and tile sizes when it omits `columns` and
// `tilecount`, as older Tiled tilesets do.

import { describe, expect, it } from "vitest";
import type { CompiledTileset } from "../map/compiled";
import { tileFrames } from "./tile-frames";

const SHEET: CompiledTileset = {
  firstGid: 11,
  name: "sheet",
  image: "source/sheet.png",
  imageWidth: 96,
  imageHeight: 64,
  tileWidth: 32,
  tileHeight: 32,
  columns: 3,
  tileCount: 6,
  spacing: 0,
  margin: 0,
  tileOffset: { x: 0, y: 0 },
  tileImages: [],
};

describe("tileFrames", () => {
  it("cuts the declared grid", () => {
    expect(tileFrames(SHEET, 96, 64)).toEqual([
      { gid: 11, x: 0, y: 0 },
      { gid: 12, x: 32, y: 0 },
      { gid: 13, x: 64, y: 0 },
      { gid: 14, x: 0, y: 32 },
      { gid: 15, x: 32, y: 32 },
      { gid: 16, x: 64, y: 32 },
    ]);
  });

  it("derives the grid when the tileset omits columns and tile count", () => {
    const bare = { ...SHEET, columns: 0, tileCount: 0 };
    expect(tileFrames(bare, 96, 64)).toEqual(tileFrames(SHEET, 96, 64));
  });

  it("takes an omitted image size from the loaded image", () => {
    const bare = { ...SHEET, columns: 0, tileCount: 0, imageWidth: 0, imageHeight: 0 };
    expect(tileFrames(bare, 96, 64)).toHaveLength(6);
  });

  it("derives a spaced, margined grid", () => {
    const spaced = { ...SHEET, columns: 0, tileCount: 0, margin: 1, spacing: 2, imageWidth: 104, imageHeight: 36 };
    expect(tileFrames(spaced, 104, 36)).toEqual([
      { gid: 11, x: 1, y: 1 },
      { gid: 12, x: 35, y: 1 },
      { gid: 13, x: 69, y: 1 },
    ]);
  });

  it("skips frames past the loaded image", () => {
    expect(tileFrames(SHEET, 64, 32).map((frame) => frame.gid)).toEqual([11, 12]);
  });
});

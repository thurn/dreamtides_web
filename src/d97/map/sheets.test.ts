// Library sheets as map material over a synthetic 4×3 sheet: the sheet
// tileset's grid, the whole-sheet preview map, and cutting a rectangle into
// a catalog stamp (above-player rows, walkability, trimming and empty tiles).

import { describe, expect, it } from "vitest";
import { parseD97StampId } from "../../types/identifiers";
import { cutSheetStamp, sheetPreviewMap, sheetTileset } from "./sheets";
import { stampAbovePlayerMask } from "./stamps";

const SHEET = sheetTileset({ path: "packs/props.png", width: 128, height: 96 }, 32);
/** Empty tiles: the whole left column and local 3 (top-right). */
const EMPTY = new Set([0, 4, 8, 3]);
const isEmpty = (local: number) => EMPTY.has(local);
const ID = parseD97StampId("0d5e7a1c-2b3f-4c4d-9e5f-6a7b8c9d0e1f");

describe("sheetTileset and sheetPreviewMap", () => {
  it("cuts the image into a grid of square tiles named after the file", () => {
    expect(SHEET).toMatchObject({ name: "props", columns: 4, tileCount: 12, tileWidth: 32, firstGid: 1 });
    const map = sheetPreviewMap(SHEET);
    expect([map.width, map.height]).toEqual([4, 3]);
    expect(map.layers[0].gids).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  });
});

describe("cutSheetStamp", () => {
  const options = { id: ID, name: "crate stack", theme: "street", layer: "Objects", aboveRows: 1 } as const;

  it("lifts the top rows above the player and blocks the tiles below them", () => {
    const stamp = cutSheetStamp(SHEET, { from: [1, 0], to: [3, 2] }, options, isEmpty);
    expect([stamp.width, stamp.height]).toEqual([3, 3]);
    expect(stamp.walkability).toBe("00.111111");
    expect(stampAbovePlayerMask(stamp)).toBe("110000000");
    expect(stamp.layers).toEqual([
      { layer: "Objects", gids: [0, 0, 0, 6, 7, 8, 10, 11, 12] },
      { layer: "Objects", gids: [2, 3, 0, 0, 0, 0, 0, 0, 0], above: true },
    ]);
    expect(stamp.extractedFrom).toEqual({ sheet: "packs/props.png", rect: { from: [1, 0], to: [3, 2] } });
    expect(stamp.theme).toBe("street");
  });

  it("trims empty border rows and columns when asked", () => {
    const stamp = cutSheetStamp(SHEET, { from: [0, 0], to: [3, 2] }, { ...options, aboveRows: 0, trim: true }, isEmpty);
    expect(stamp.extractedFrom.rect).toEqual({ from: [1, 0], to: [3, 2] });
    expect(() => cutSheetStamp(SHEET, { from: [0, 0], to: [0, 2] }, { ...options, trim: true }, isEmpty)).toThrow(RangeError);
  });

  it("rejects a rectangle off the sheet", () => {
    expect(() => cutSheetStamp(SHEET, { from: [2, 2], to: [4, 2] }, options, isEmpty)).toThrow(RangeError);
  });
});

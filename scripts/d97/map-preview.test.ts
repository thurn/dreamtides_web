// The map preview writer: PNGs of the expected pixel dimensions, in the
// walkability rendering (no library) and from tileset images, plus the
// stamp preview sheet. Synthetic maps only.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { compileDreamMap } from "../../src/d97/map/compile.ts";
import { compiledFromRows, fixtureDefinition, FIXTURE_TMX, loadFixtureText, ROW_ANCHORS } from "../../src/d97/map/map-fixtures.ts";
import { PREVIEW_GRID_MARGIN, previewDimensions, type RgbaImage } from "../../src/d97/map/preview.ts";
import { extractStamp } from "../../src/d97/map/stamps.ts";
import { parseD97StampId } from "../../src/types/identifiers.ts";
import { STAMP_SHEET_GAP, writeMapPreviews, writeStampSheet } from "./map-preview.ts";

const directories: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "d97-preview-"));
  directories.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function decodedSize(path: string): { width: number; height: number } {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height };
}

const MAP = compiledFromRows(
  ["............", "......#.....", "............", "............", "............"],
  [
    { id: ROW_ANCHORS.doorA, kind: "door", at: [0, 2], entry: [1, 2] },
    { id: ROW_ANCHORS.doorB, kind: "door", at: [11, 2], entry: [10, 2] },
  ],
  [{ name: "east field", from: [6, 1], to: [11, 4] }],
);

describe("writeMapPreviews", () => {
  it("writes the whole map and zoomed views at the requested scale without a library", () => {
    const outDir = tempDir();
    const written = writeMapPreviews(MAP, {
      outDir,
      images: null,
      scale: 0.5,
      rect: { from: [2, 0], to: [4, 1] },
    });
    expect(written.images.map((image) => image.mode)).toEqual(["walkability", "walkability", "walkability"]);
    const [whole, region, rect] = written.images;
    expect(decodedSize(whole.path)).toEqual({ width: 12 * 16, height: 5 * 16 });
    expect(decodedSize(region.path)).toEqual({ width: PREVIEW_GRID_MARGIN + 6 * 16, height: PREVIEW_GRID_MARGIN + 4 * 16 });
    expect(decodedSize(rect.path)).toEqual(previewDimensions({ from: [2, 0], to: [4, 1] }, 16, true));
    for (const image of written.images) expect(decodedSize(image.path)).toEqual({ width: image.width, height: image.height });
  });

  it("renders only the named region and rejects an unknown one", () => {
    const outDir = tempDir();
    expect(writeMapPreviews(MAP, { outDir, images: null, region: "east field" }).images).toHaveLength(2);
    expect(() => writeMapPreviews(MAP, { outDir, images: null, region: "nowhere" })).toThrow();
  });

  it("draws tiles when the loader supplies tileset images", () => {
    const compiled = compileDreamMap(fixtureDefinition(), {
      source: { text: FIXTURE_TMX, loadText: loadFixtureText },
      stamps: new Map(),
      terrains: new Map(),
    });
    if (!compiled.ok) throw new Error("fixture did not compile");
    const solid = (width: number, height: number): RgbaImage => ({
      width,
      height,
      data: new Uint8Array(width * height * 4).fill(200),
    });
    const written = writeMapPreviews(compiled.map, {
      outDir: tempDir(),
      images: (path) => (path.endsWith(".png") ? solid(128, 128) : null),
      scale: 0.25,
    });
    const [whole] = written.images;
    expect(whole.mode).toBe("tiles");
    expect(decodedSize(whole.path)).toEqual({ width: 8 * 8, height: 6 * 8 });
  });
});

describe("writeStampSheet", () => {
  it("writes the tiles and masks side by side", () => {
    const { stamp } = extractStamp(MAP, { from: [5, 0], to: [7, 1] }, {
      id: parseD97StampId("3f9b2c4e-1a2b-4c3d-8e4f-5a6b7c8d9e0f"),
      name: "wall",
      theme: "building",
      origin: "rows",
    });
    const sheet = writeStampSheet(stamp, join(tempDir(), "wall.png"), null);
    const panel = previewDimensions({ from: [0, 0], to: [2, 1] }, 32, true);
    expect(decodedSize(sheet.path)).toEqual({ width: panel.width * 2 + STAMP_SHEET_GAP, height: panel.height });
  });
});

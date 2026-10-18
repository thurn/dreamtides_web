// The hardened map tooling over synthetic fixtures: `compose` scaffolds a
// module that compiles from brushes and stamps alone and passes the
// validator; `stamps cut` writes a module and preview sheet from a library
// sheet; `stamps sheet` writes one sheet and legend per theme; `stamps list`
// groups and filters by theme; and `inspect` reports stamp placements,
// terrain edits, drawn tilesets and dropped ones.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import type { D97MapTheme } from "../../src/content/d97/terrains/themes.ts";
import { TERRAIN_FULL, type D97SeasonFamily, type DreamTerrain } from "../../src/d97/map/assets.ts";
import { compileDreamMap } from "../../src/d97/map/compile.ts";
import type { DreamMapDefinition } from "../../src/d97/map/definition.ts";
import { FIXTURE_TUNING, HUT_STAMP, WATER, WATER_TERRAIN, WATER_TILESET } from "../../src/d97/map/map-fixtures.ts";
import { renderMapPreview } from "../../src/d97/map/preview.ts";
import { defineD97Stamp, type D97CatalogStamp } from "../../src/d97/map/stamps.ts";
import { validateDreamMap } from "../../src/d97/map/validate.ts";
import { parseD97StampId, parseD97TerrainId, parseDreamAnchorId, parseDreamMapId } from "../../src/types/identifiers.ts";
import { composeMapSource } from "./map-compose.ts";
import type { LoadedMap } from "./map-load.ts";
import { inspectReport } from "./map-report.ts";
import { cutStampFiles, stampListReport, writeThemeSheets } from "./map-stamps.ts";
import { writePng } from "./png.ts";

const directories: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "d97-map-tools-"));
  directories.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const BASE = parseD97TerrainId("base");
const COVER = parseD97TerrainId("cover");
const BASE_TERRAIN: DreamTerrain = {
  id: BASE,
  tileset: { ...WATER_TILESET, name: "base", image: { path: "terrain/base.png", width: 96, height: 192 } },
  corners: { [TERRAIN_FULL]: [4] },
  blocksMovement: false,
  layer: "Ground",
  edgeless: true,
};
const COVER_TERRAIN: DreamTerrain = {
  ...WATER_TERRAIN,
  id: COVER,
  tileset: { ...WATER_TILESET, name: "cover", image: { path: "terrain/cover.png", width: 96, height: 192 } },
  blocksMovement: false,
  layer: "Grass",
};
const TERRAINS = new Map([
  [BASE, BASE_TERRAIN],
  [COVER, COVER_TERRAIN],
  [WATER, WATER_TERRAIN],
]);
const SEASONS: readonly D97SeasonFamily[] = [
  {
    family: "cover",
    images: { spring: "terrain/cover.png", summer: "terrain/cover.png", autumn: "terrain/cover.png", winter: "terrain/cover_winter.png" },
  },
];

function catalogStamp(name: string, theme: D97CatalogStamp["theme"], id: string): D97CatalogStamp {
  return defineD97Stamp({
    ...HUT_STAMP,
    id: parseD97StampId(id),
    name,
    theme,
    extractedFrom: { sheet: "props/hut.png", rect: { from: [0, 0], to: [1, 1] } },
  });
}

const HUT_A = catalogStamp("hut", "nature", "1a2b3c4d-0000-4000-8000-000000000001");
const HUT_B = catalogStamp("shed", "nature", "1a2b3c4d-0000-4000-8000-000000000002");
const TOWER = catalogStamp("tower", "scifi", "1a2b3c4d-0000-4000-8000-000000000003");

describe("composeMapSource", () => {
  const theme: D97MapTheme = {
    theme: "nature",
    base: BASE,
    cover: COVER,
    path: { terrain: COVER, erase: true },
    water: WATER,
    season: "winter",
  };

  it("scaffolds a module built from brushes and stamps that compiles and passes the validator", async () => {
    const root = resolve(import.meta.dirname, "../..");
    const source = composeMapSource({
      id: parseDreamMapId("2b3c4d5e-0000-4000-8000-000000000001"),
      anchors: {
        westDoor: parseDreamAnchorId("2b3c4d5e-0000-4000-8000-000000000002"),
        eastDoor: parseDreamAnchorId("2b3c4d5e-0000-4000-8000-000000000003"),
        waypoint: parseDreamAnchorId("2b3c4d5e-0000-4000-8000-000000000004"),
      },
      width: 32,
      height: 28,
      theme,
      stamps: [HUT_A, HUT_B],
      terrainName: (id) => id,
      imports: {
        definition: join(root, "src/d97/map/definition.ts"),
        identifiers: join(root, "src/types/identifiers.ts"),
      },
    });
    const path = join(tempDir(), "scaffold.ts");
    writeFileSync(path, source);
    const definition = ((await import(pathToFileURL(path).href)) as { default: DreamMapDefinition }).default;
    expect(definition.recipe.every((op) => op.op === "brush" || op.op === "stamp" || op.op === "reseason")).toBe(true);
    expect(definition.recipe.filter((op) => op.op === "stamp")).toHaveLength(2);
    const result = compileDreamMap(definition, {
      source: null,
      stamps: new Map([HUT_A, HUT_B].map((stamp) => [stamp.id, stamp])),
      terrains: TERRAINS,
      seasons: SEASONS,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.map.tilesets.some((tileset) => tileset.image === "terrain/cover_winter.png")).toBe(true);
    const tuning = {
      ...FIXTURE_TUNING,
      walkingSpeedTilesPerSecond: 4,
      sizeClasses: [{ size: "small", nominalSide: 30, maxSide: 60, reachMaxSeconds: 60 }],
    } as const;
    expect(validateDreamMap(result.map, tuning, { served: ["terrain", "props"] }).filter((finding) => finding.severity === "error")).toEqual([]);
  });

  it("refuses sides too small to lay out", () => {
    expect(() =>
      composeMapSource({
        id: parseDreamMapId("2b3c4d5e-0000-4000-8000-000000000001"),
        anchors: {
          westDoor: parseDreamAnchorId("2b3c4d5e-0000-4000-8000-000000000002"),
          eastDoor: parseDreamAnchorId("2b3c4d5e-0000-4000-8000-000000000003"),
          waypoint: parseDreamAnchorId("2b3c4d5e-0000-4000-8000-000000000004"),
        },
        width: 10,
        height: 40,
        theme,
        stamps: [],
        terrainName: (id) => id,
        imports: { definition: "x", identifiers: "y" },
      }),
    ).toThrow(RangeError);
  });
});

describe("stamp catalog tools", () => {
  it("cuts a stamp module and its preview sheet out of a library sheet", () => {
    const library = tempDir();
    const png = new PNG({ width: 64, height: 64 });
    // Opaque top-left and bottom row tiles; the top-right tile stays empty.
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        if (y < 32 && x >= 32) continue;
        png.data.set([120, 80, 40, 255], (y * 64 + x) * 4);
      }
    }
    mkdirSync(join(library, "packs"), { recursive: true });
    writePng(join(library, "packs/sheet.png"), { width: 64, height: 64, data: new Uint8Array(png.data) });
    const out = tempDir();
    const result = cutStampFiles({
      library,
      image: "packs/sheet.png",
      tileSize: 32,
      rect: { from: [0, 0], to: [1, 1] },
      name: "crate",
      theme: "street",
      layer: "Objects",
      aboveRows: 1,
      trim: true,
      moduleDir: join(out, "stamps"),
      previewDir: join(out, "previews"),
    });
    expect(result.stamp.walkability).toBe("0.11");
    expect(readFileSync(result.modulePath, "utf8")).toContain(result.stamp.id);
    expect(existsSync(result.sheet.path)).toBe(true);
    expect(result.sheet.mode).toBe("tiles");
  });

  it("writes one preview sheet and legend per theme", () => {
    const dir = tempDir();
    const written = writeThemeSheets([HUT_A, TOWER, HUT_B], dir, join(dir, "no-library"));
    expect(written.map((sheet) => sheet.path)).toEqual([join(dir, "nature.png"), join(dir, "scifi.png")]);
    expect(readFileSync(join(dir, "nature.txt"), "utf8")).toContain(HUT_B.id);
    expect(writeThemeSheets([HUT_A, TOWER], dir, join(dir, "no-library"), "scifi")).toHaveLength(1);
  });

  it("lists stamps grouped by theme, optionally one theme", () => {
    const all = stampListReport([TOWER, HUT_A]);
    expect(all.indexOf(HUT_A.id)).toBeLessThan(all.indexOf(TOWER.id));
    const scifi = stampListReport([TOWER, HUT_A], "scifi");
    expect(scifi).toContain(TOWER.id);
    expect(scifi).not.toContain(HUT_A.id);
  });
});

describe("inspectReport", () => {
  it("reports stamp placements, terrain edits, drawn tilesets and dropped ones", () => {
    const definition: DreamMapDefinition = {
      id: parseDreamMapId("3c4d5e6f-0000-4000-8000-000000000001"),
      source: { kind: "blank", width: 12, height: 12, tileWidth: 32, tileHeight: 32 },
      recipe: [
        { op: "brush", terrain: BASE, shape: { kind: "rect", from: [0, 0], to: [11, 11] } },
        { op: "stamp", stamp: HUT_A.id, at: [4, 4] },
      ],
      regions: [],
      landmarks: [],
      anchors: [],
    };
    const result = compileDreamMap(definition, { source: null, stamps: new Map([[HUT_A.id, HUT_A]]), terrains: TERRAINS });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const loaded: LoadedMap = {
      argument: "fixture",
      slug: "fixture",
      library: "/nowhere",
      definition,
      map: result.map,
      droppedTilesets: [{ name: "stale-rules", image: "pack/automapping/rules.png" }],
    };
    const report = inspectReport(
      loaded,
      { ...FIXTURE_TUNING, walkingSpeedTilesPerSecond: 4, sizeClasses: [{ size: "small", nominalSide: 10, maxSide: 20, reachMaxSeconds: 10 }] },
      { stamps: new Map([[HUT_A.id, HUT_A]]), terrains: new Map([[BASE, { name: "base fill", layer: "Ground" }]]), served: ["terrain"] },
    );
    expect(report).toContain(HUT_A.id);
    expect(report).toContain("4,4–5,5");
    expect(report).toContain("terrain/base.png");
    expect(report).toContain("props/hut.png");
    expect(report).toContain("pack/automapping/rules.png");
  });
});

describe("preview outlines and marks", () => {
  it("draws stamp outlines and point marks over the map", () => {
    const map = {
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [],
      layers: [],
      objects: [],
      walkable: "1".repeat(16),
      abovePlayer: "0".repeat(16),
      regions: [],
      anchors: [],
    };
    const rect = { from: [0, 0], to: [3, 3] } as const;
    const plain = renderMapPreview(map, { rect, tilePixels: 16, grid: false, images: null });
    const marked = renderMapPreview(map, {
      rect,
      tilePixels: 16,
      grid: false,
      images: null,
      outlines: [{ rect: { from: [1, 1], to: [2, 2] }, label: "1" }],
      marks: [{ at: [3, 3], letter: "D" }],
    });
    const pixel = (image: typeof plain.image, x: number, y: number) => Array.from(image.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3));
    expect(pixel(marked.image, 16, 40)).not.toEqual(pixel(plain.image, 16, 40));
    expect(pixel(marked.image, 56, 56)).not.toEqual(pixel(plain.image, 56, 56));
    expect(pixel(marked.image, 8, 8)).toEqual(pixel(plain.image, 8, 8));
  });

  it("draws the walkability overlay's narrow and flagged cells", () => {
    const map = {
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [],
      layers: [],
      objects: [],
      walkable: "1".repeat(16),
      abovePlayer: "0".repeat(16),
      regions: [],
      anchors: [],
    };
    const rect = { from: [0, 0], to: [3, 3] } as const;
    const plain = renderMapPreview(map, { rect, tilePixels: 16, grid: false, images: null });
    const overlaid = renderMapPreview(map, {
      rect,
      tilePixels: 16,
      grid: false,
      images: null,
      overlay: { narrow: [[1, 0]], flagged: [[2, 0]] },
    });
    const pixel = (image: typeof plain.image, x: number, y: number) => Array.from(image.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3));
    // The narrow cell's centre, the flagged cell's cross at its top-left, and an unmarked cell.
    expect(pixel(overlaid.image, 24, 8)).not.toEqual(pixel(plain.image, 24, 8));
    expect(pixel(overlaid.image, 32, 0)).not.toEqual(pixel(plain.image, 32, 0));
    expect(pixel(overlaid.image, 56, 56)).toEqual(pixel(plain.image, 56, 56));
  });
});

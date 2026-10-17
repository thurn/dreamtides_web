// The Tiled reader contract over a synthetic town: TMX and TMJ read to the
// same model (layers in draw order with group context folded in, external
// tilesets resolved against the referencing file, tile objects, typed
// properties, flip flags kept); base64 data, compressed or not, matches CSV;
// infinite maps normalize to their chunks' bounds; malformed XML throws.

import { deflateSync, gzipSync, inflateSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  COLLISION,
  DECO,
  FIXTURE_MAP_PATH,
  FIXTURE_TMX,
  FLIPPED_GID,
  GROUND,
  PROPS_FIRST_GID,
  ROOF,
  fixtureTmj,
  loadFixtureText,
} from "./map-fixtures";
import {
  gidWithoutFlags,
  readTiledMap,
  resolveRelativePath,
  tilesetForGid,
  type TiledCompression,
  type TiledMap,
} from "./tiled";
import { parseXml } from "./xml";

const OPTIONS = {
  path: FIXTURE_MAP_PATH,
  loadText: loadFixtureText,
  decompress: (bytes: Uint8Array, compression: TiledCompression) =>
    new Uint8Array(compression === "gzip" ? gunzipSync(bytes) : inflateSync(bytes)),
};

function base64Of(cells: readonly number[]): Buffer {
  const buffer = Buffer.alloc(cells.length * 4);
  cells.forEach((gid, index) => buffer.writeUInt32LE(gid, index * 4));
  return buffer;
}

function expectTown(map: TiledMap): void {
  expect([map.width, map.height, map.tileWidth, map.tileHeight]).toEqual([8, 6, 32, 32]);
  expect(map.properties).toEqual({ biome: "meadow & town" });
  expect(map.layers.map((layer) => `${layer.kind}:${layer.name}`)).toEqual([
    "tile:Ground",
    "tile:Collision",
    "tile:Deco",
    "tile:Roof",
    "object:Props",
    "object:collision",
  ]);
  const [ground, collision, deco, roof, props] = map.layers;
  if (ground?.kind !== "tile" || collision?.kind !== "tile" || deco?.kind !== "tile" || roof?.kind !== "tile" || props?.kind !== "object") {
    throw new Error("unexpected layer kinds");
  }
  expect(ground.gids).toEqual(GROUND);
  expect(collision.gids).toEqual(COLLISION);
  expect(collision.visible).toBe(false);
  expect(deco.gids).toEqual(DECO);
  expect(roof.gids).toEqual(ROOF);
  expect(roof.offset).toEqual({ x: 2, y: 3 });
  expect(roof.opacity).toBe(0.5);
  expect(roof.properties).toEqual({ season: "summer", height: 2 });

  const [base, props2] = map.tilesets;
  expect(base?.image).toEqual({ path: "tiles/base.png", width: 128, height: 128 });
  expect(base?.tiles.find((tile) => tile.id === 5)?.properties).toEqual({ collides: true });
  expect(base?.tiles.find((tile) => tile.id === 6)?.hasCollision).toBe(true);
  expect(props2?.firstGid).toBe(PROPS_FIRST_GID);
  expect(props2?.externalPath).toBe("tilesets/props.tsx");
  expect(props2?.image?.path).toBe("images/props.png");
  expect([props2?.tileWidth, props2?.tileHeight]).toEqual([64, 64]);

  expect(props.objects.map((object) => [object.gid, object.x, object.y, object.point])).toEqual([
    [PROPS_FIRST_GID, 64, 160, false],
    [null, 16, 16, true],
  ]);
}

describe("readTiledMap", () => {
  it("reads the TMX town", () => {
    expectTown(readTiledMap(FIXTURE_TMX, OPTIONS));
  });

  it("reads the TMJ twin to the same model", () => {
    const tmx = readTiledMap(FIXTURE_TMX, OPTIONS);
    const tmj = readTiledMap(fixtureTmj(), OPTIONS);
    expectTown(tmj);
    expect(tmj).toEqual(tmx);
  });

  it("decodes base64 data, plain, zlib and gzip, to the CSV cells", () => {
    const csv = readTiledMap(fixtureTmj(), OPTIONS);
    for (const [compression, pack] of [
      ["", (bytes: Buffer) => bytes],
      ["zlib", (bytes: Buffer) => deflateSync(bytes)],
      ["gzip", (bytes: Buffer) => gzipSync(bytes)],
    ] as const) {
      const encoded = readTiledMap(
        fixtureTmj((cells) => ({
          encoding: "base64",
          ...(compression === "" ? {} : { compression }),
          data: pack(base64Of(cells)).toString("base64"),
        })),
        OPTIONS,
      );
      expect(encoded.layers).toEqual(csv.layers);
    }
  });

  it("rejects compressed data without a decompressor", () => {
    const text = fixtureTmj((cells) => ({
      encoding: "base64",
      compression: "zlib",
      data: deflateSync(base64Of(cells)).toString("base64"),
    }));
    expect(() => readTiledMap(text, { path: FIXTURE_MAP_PATH, loadText: loadFixtureText })).toThrow();
  });

  it("normalizes an infinite map to the bounds of its chunks", () => {
    const text = JSON.stringify({
      type: "map",
      orientation: "orthogonal",
      width: 0,
      height: 0,
      tilewidth: 32,
      tileheight: 32,
      infinite: true,
      tilesets: [],
      layers: [
        {
          type: "tilelayer",
          name: "Ground",
          chunks: [
            { x: -2, y: -1, width: 2, height: 1, data: [1, 2] },
            { x: 0, y: 0, width: 2, height: 1, data: [3, 4] },
          ],
        },
        { type: "objectgroup", name: "Props", objects: [{ id: 1, gid: 1, x: 0, y: 32, width: 32, height: 32 }] },
      ],
    });
    const map = readTiledMap(text, OPTIONS);
    expect([map.width, map.height]).toEqual([4, 2]);
    expect(map.layers[0]?.kind === "tile" && map.layers[0].gids).toEqual([1, 2, 0, 0, 0, 0, 3, 4]);
    const props = map.layers[1];
    expect(props?.kind === "object" && [props.objects[0]?.x, props.objects[0]?.y]).toEqual([64, 64]);
  });

  it("keeps flip flags and resolves gids to their tilesets", () => {
    const map = readTiledMap(FIXTURE_TMX, OPTIONS);
    expect(gidWithoutFlags(FLIPPED_GID)).toBe(3);
    expect(tilesetForGid(map.tilesets, FLIPPED_GID)?.name).toBe("base");
    expect(tilesetForGid(map.tilesets, PROPS_FIRST_GID + 1)?.name).toBe("props");
    expect(tilesetForGid(map.tilesets, 0)).toBeNull();
  });

  it("refuses non-orthogonal maps", () => {
    expect(() => readTiledMap(FIXTURE_TMX.replace('orientation="orthogonal"', 'orientation="isometric"'), OPTIONS)).toThrow();
  });
});

describe("resolveRelativePath", () => {
  it("resolves references against the referencing file's directory", () => {
    expect(resolveRelativePath("maps/a/town.tmx", "../../tiles/x.png")).toBe("tiles/x.png");
    expect(resolveRelativePath("town.tmx", "./x.tsx")).toBe("x.tsx");
    expect(resolveRelativePath("maps/town.tmx", "/abs/x.png")).toBe("/abs/x.png");
  });
});

describe("parseXml", () => {
  it("parses attributes, entities, CDATA and nesting", () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><a k="1 &lt; 2"><b>x &amp; y</b><c><![CDATA[<raw>]]></c><d/></a>');
    expect(root.attributes.k).toBe("1 < 2");
    expect(root.children.map((child) => [child.name, child.text])).toEqual([
      ["b", "x & y"],
      ["c", "<raw>"],
      ["d", ""],
    ]);
  });

  it("throws on malformed structure", () => {
    expect(() => parseXml("<a><b></a>")).toThrow();
    expect(() => parseXml("<a>")).toThrow();
    expect(() => parseXml("<a/><b/>")).toThrow();
  });
});

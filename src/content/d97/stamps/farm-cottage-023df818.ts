// farm cottage: a D97 map stamp extracted by `npm run d97:map -- stamps extract`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId, parseDreamMapSourceHash } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("023df818-7460-41b9-bf10-0a7b1c0a1760"),
  name: "farm cottage",
  theme: "building",
  width: 7,
  height: 7,
  tilesets: [
    {
      firstGid: 1,
      name: "house",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 165,
      columns: 11,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/house.png",
        width: 352,
        height: 500,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
    {
      firstGid: 166,
      name: "shadow",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 10,
      columns: 5,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/shadow.png",
        width: 160,
        height: 64,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Shadow",
      gids: [
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 170,
        0, 0, 0, 0, 0, 0, 170,
        0, 0, 0, 0, 0, 0, 170,
      ],
    },
    {
      layer: "Ground",
      gids: [
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        1, 2, 2, 2, 2, 2, 3,
        12, 4, 13, 13, 13, 13, 14,
        23, 15, 24, 24, 24, 24, 25,
      ],
    },
    {
      layer: "Ground1",
      gids: [
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 109, 110, 109, 110, 0,
        0, 0, 120, 121, 120, 121, 0,
        0, 5, 131, 132, 131, 132, 0,
      ],
    },
    {
      layer: "Over",
      gids: [
        10, 34, 48, 49, 50, 36, 32,
        21, 45, 59, 60, 61, 47, 43,
        45, 56, 57, 57, 57, 58, 47,
        56, 57, 57, 57, 57, 57, 58,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0000100000010011111111111111111111110111111011111",
  points: {
    door: [1, 5],
    "door-entry": [1, 6],
  },
  extractedFrom: {
    map: "source-of-tales/maps/goldenfields/main.tmx",
    rect: { from: [121,25], to: [127,31] },
    sourceSha256: parseDreamMapSourceHash("bfef031be76be13bb3071c5de967237364b5339bc7ec7563016db0b9c3aa8074"),
  },
});

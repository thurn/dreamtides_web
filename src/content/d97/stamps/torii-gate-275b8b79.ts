// torii gate: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("275b8b79-b58e-423f-83a2-211c8fc431ed"),
  name: "torii gate",
  theme: "japanese",
  width: 5,
  height: 4,
  tilesets: [
    {
      firstGid: 1,
      name: "torii",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 80,
      columns: 10,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/torii.png",
        width: 320,
        height: 256,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Buildings",
      gids: [
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        31, 32, 33, 34, 35,
      ],
    },
    {
      layer: "Buildings",
      gids: [
        1, 2, 3, 4, 5,
        11, 12, 13, 14, 15,
        21, 22, 23, 24, 25,
        0, 0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "00000000000000001010",
  points: {
    passage: [2, 3],
  },
  extractedFrom: {
    sheet: "source-of-tales/tiles/torii.png",
    rect: { from: [0,0], to: [4,3] },
  },
});

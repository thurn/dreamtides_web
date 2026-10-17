// gabled brick house: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("03403ff5-6d28-4d23-bbdb-34b462b79289"),
  name: "gabled brick house",
  theme: "building",
  width: 6,
  height: 6,
  tilesets: [
    {
      firstGid: 1,
      name: "Brick House B",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 36,
      columns: 6,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-revised/Structure/Structures/Brick House B.png",
        width: 192,
        height: 192,
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
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        13, 14, 15, 16, 17, 18,
        19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30,
        0, 32, 33, 34, 35, 0,
      ],
    },
    {
      layer: "Buildings",
      gids: [
        0, 0, 3, 4, 0, 0,
        0, 8, 9, 10, 11, 0,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "..00...0000.111111111111111111.1101.",
  points: {
    door: [3, 5],
  },
  extractedFrom: {
    sheet: "lpc-revised/Structure/Structures/Brick House B.png",
    rect: { from: [0,0], to: [5,5] },
  },
});

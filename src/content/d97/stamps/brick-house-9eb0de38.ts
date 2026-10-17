// brick house: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("9eb0de38-4bce-45b1-ab9b-2fae83854351"),
  name: "brick house",
  theme: "building",
  width: 8,
  height: 7,
  tilesets: [
    {
      firstGid: 1,
      name: "Brick House A",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 56,
      columns: 8,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-revised/Structure/Structures/Brick House A.png",
        width: 256,
        height: 224,
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
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        17, 18, 19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30, 31, 0,
        0, 34, 35, 36, 37, 38, 39, 0,
        0, 42, 43, 44, 45, 0, 0, 0,
        0, 0, 51, 0, 0, 0, 0, 0,
      ],
    },
    {
      layer: "Buildings",
      gids: [
        0, 2, 3, 4, 5, 6, 7, 0,
        9, 10, 11, 12, 13, 14, 15, 16,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: ".000000.00000000111111111111111..111111..1011.....0.....",
  points: {
    door: [2, 5],
    "door-entry": [2, 6],
  },
  extractedFrom: {
    sheet: "lpc-revised/Structure/Structures/Brick House A.png",
    rect: { from: [0,0], to: [7,6] },
  },
});

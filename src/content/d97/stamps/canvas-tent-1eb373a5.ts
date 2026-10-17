// canvas tent: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("1eb373a5-2ded-4be2-a967-882811fbd61e"),
  name: "canvas tent",
  theme: "building",
  width: 4,
  height: 5,
  tilesets: [
    {
      firstGid: 1,
      name: "tent",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 20,
      columns: 4,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/tent.png",
        width: 128,
        height: 160,
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
        0, 0, 0, 0,
        0, 0, 0, 0,
        9, 10, 11, 12,
        13, 14, 15, 16,
        17, 18, 19, 20,
      ],
    },
    {
      layer: "Buildings",
      gids: [
        0, 2, 3, 0,
        5, 6, 7, 8,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: ".00.0000111111111011",
  points: {
    door: [1, 4],
  },
  extractedFrom: {
    sheet: "source-of-tales/tiles/tent.png",
    rect: { from: [0,0], to: [3,4] },
  },
});

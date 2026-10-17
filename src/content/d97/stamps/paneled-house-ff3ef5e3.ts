// paneled house: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("ff3ef5e3-719b-4d81-9501-3c7baea7f672"),
  name: "paneled house",
  theme: "building",
  width: 5,
  height: 5,
  tilesets: [
    {
      firstGid: 1,
      name: "Paneled House A",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 25,
      columns: 5,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-revised/Structure/Structures/Paneled House A.png",
        width: 160,
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
        0, 0, 0, 0, 0,
        6, 7, 8, 9, 10,
        11, 12, 13, 14, 15,
        16, 17, 18, 19, 20,
        21, 22, 23, 24, 25,
      ],
    },
    {
      layer: "Buildings",
      gids: [
        1, 2, 3, 4, 5,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0000011111111111111011110",
  points: {
    door: [4, 3],
    "door-entry": [4, 4],
  },
  extractedFrom: {
    sheet: "lpc-revised/Structure/Structures/Paneled House A.png",
    rect: { from: [0,0], to: [4,4] },
  },
});

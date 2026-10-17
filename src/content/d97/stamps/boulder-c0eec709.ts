// boulder: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("c0eec709-a0ec-4d04-b01a-7830aeb97a29"),
  name: "boulder",
  theme: "nature",
  width: 2,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "Rocks, Grasslands",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 72,
      columns: 6,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-revised/Terrain/Rocks, Grasslands.png",
        width: 192,
        height: 384,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Objects",
      gids: [
        1, 2,
        7, 8,
      ],
    },
  ],
  walkability: "1111",
  extractedFrom: {
    sheet: "lpc-revised/Terrain/Rocks, Grasslands.png",
    rect: { from: [0,0], to: [1,1] },
  },
});

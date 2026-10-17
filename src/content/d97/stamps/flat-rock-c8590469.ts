// flat rock: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("c8590469-f6f0-45fd-85e3-d7526f2a2efb"),
  name: "flat rock",
  theme: "nature",
  width: 2,
  height: 1,
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
        15, 16,
      ],
    },
  ],
  walkability: "11",
  extractedFrom: {
    sheet: "lpc-revised/Terrain/Rocks, Grasslands.png",
    rect: { from: [2,2], to: [3,2] },
  },
});

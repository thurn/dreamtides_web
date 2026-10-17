// snow-laden pine: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("e53f8c2c-447a-427d-98ae-81586a86a85c"),
  name: "snow-laden pine",
  theme: "winter",
  width: 3,
  height: 4,
  tilesets: [
    {
      firstGid: 1,
      name: "trees_winter",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 288,
      columns: 16,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-revised/Terrain/trees_winter.png",
        width: 512,
        height: 576,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Trees",
      gids: [
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
        0, 246, 0,
      ],
    },
    {
      layer: "Trees",
      gids: [
        197, 198, 199,
        213, 214, 215,
        229, 230, 231,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000000.1.",
  extractedFrom: {
    sheet: "lpc-revised/Terrain/trees_winter.png",
    rect: { from: [4,12], to: [6,15] },
  },
});

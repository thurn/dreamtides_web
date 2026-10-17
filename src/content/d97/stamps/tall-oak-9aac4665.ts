// tall oak: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("9aac4665-28dd-42a0-86b1-bc076c681c78"),
  name: "tall oak",
  theme: "nature",
  width: 3,
  height: 5,
  tilesets: [
    {
      firstGid: 1,
      name: "trees_summer",
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
        path: "lpc-revised/Terrain/trees_summer.png",
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
        0, 60, 0,
        0, 76, 0,
      ],
    },
    {
      layer: "Trees",
      gids: [
        11, 12, 13,
        27, 28, 29,
        43, 44, 45,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000000.1..1.",
  extractedFrom: {
    sheet: "lpc-revised/Terrain/trees_summer.png",
    rect: { from: [10,0], to: [12,4] },
  },
});

// bare tree: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("0b66c61a-42f7-4435-be63-8f04c9f4b020"),
  name: "bare tree",
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
        0, 178, 0,
        0, 194, 0,
      ],
    },
    {
      layer: "Trees",
      gids: [
        129, 130, 131,
        145, 146, 147,
        161, 162, 163,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000000.1..1.",
  extractedFrom: {
    sheet: "lpc-revised/Terrain/trees_summer.png",
    rect: { from: [0,8], to: [2,12] },
  },
});

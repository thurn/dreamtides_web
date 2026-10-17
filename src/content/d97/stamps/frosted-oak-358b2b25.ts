// frosted oak: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("358b2b25-f3c1-4ce7-ac0d-6f951b34ff8b"),
  name: "frosted oak",
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
        37, 38, 39,
        0, 54, 0,
      ],
    },
    {
      layer: "Trees",
      gids: [
        5, 6, 7,
        21, 22, 23,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000111.1.",
  extractedFrom: {
    sheet: "lpc-revised/Terrain/trees_winter.png",
    rect: { from: [4,0], to: [6,3] },
  },
});

// market stall: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("8268bfc9-8643-408d-adfe-0e3c954cd2b2"),
  name: "market stall",
  theme: "street",
  width: 4,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "victorian-market",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 1280,
      columns: 16,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-victorian-town-decorations/files/lpc-victorian-decoration/victorian-market.png",
        width: 512,
        height: 2560,
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
        0, 0, 0, 0,
        49, 50, 51, 52,
        65, 66, 67, 68,
      ],
    },
    {
      layer: "Objects",
      gids: [
        33, 34, 35, 36,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000011111111",
  extractedFrom: {
    sheet: "lpc-victorian-town-decorations/files/lpc-victorian-decoration/victorian-market.png",
    rect: { from: [0,2], to: [3,4] },
  },
});

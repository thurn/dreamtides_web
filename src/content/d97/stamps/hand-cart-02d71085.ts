// hand cart: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("02d71085-3b42-4c6a-9e84-5d8f8a439735"),
  name: "hand cart",
  theme: "street",
  width: 2,
  height: 2,
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
        185, 186,
        201, 202,
      ],
    },
  ],
  walkability: "1111",
  extractedFrom: {
    sheet: "lpc-victorian-town-decorations/files/lpc-victorian-decoration/victorian-market.png",
    rect: { from: [8,11], to: [9,12] },
  },
});

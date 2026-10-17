// canvas awning: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("58b01d1b-d2d1-4f72-9933-a99491665a86"),
  name: "canvas awning",
  theme: "desert",
  width: 3,
  height: 4,
  tilesets: [
    {
      firstGid: 1,
      name: "adobe-2",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 256,
      columns: 16,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-adobe-town-set/files/adobe-2.png",
        width: 512,
        height: 512,
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
        0, 0, 0,
        0, 0, 0,
        122, 123, 124,
        138, 139, 140,
      ],
    },
    {
      layer: "Objects",
      gids: [
        90, 91, 92,
        106, 107, 108,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000111111",
  extractedFrom: {
    sheet: "lpc-adobe-town-set/files/adobe-2.png",
    rect: { from: [9,5], to: [11,8] },
  },
});

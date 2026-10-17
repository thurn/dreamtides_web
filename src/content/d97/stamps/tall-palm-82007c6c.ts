// tall palm: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("82007c6c-315e-40c5-a919-504c77a7a9c1"),
  name: "tall palm",
  theme: "desert",
  width: 3,
  height: 6,
  tilesets: [
    {
      firstGid: 1,
      name: "beach-desert",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 1024,
      columns: 32,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-beach-desert/files/lpc-beach-desert/beach-desert.png",
        width: 1024,
        height: 1024,
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
        0, 0, 0,
        397, 398, 399,
        429, 430, 431,
      ],
    },
    {
      layer: "Trees",
      gids: [
        269, 270, 271,
        301, 302, 303,
        333, 334, 335,
        0, 366, 0,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000000.1..1....",
  extractedFrom: {
    sheet: "lpc-beach-desert/files/lpc-beach-desert/beach-desert.png",
    rect: { from: [12,8], to: [14,13] },
  },
});

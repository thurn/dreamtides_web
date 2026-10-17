// snowy fir: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("3efb8fe9-b429-46e5-bc98-8c089a765843"),
  name: "snowy fir",
  theme: "winter",
  width: 3,
  height: 4,
  tilesets: [
    {
      firstGid: 1,
      name: "TilesB",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 48,
      columns: 6,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-winter-tiles/files/TilesB.png",
        width: 192,
        height: 256,
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
        13, 14, 15,
        19, 20, 21,
      ],
    },
    {
      layer: "Trees",
      gids: [
        1, 2, 3,
        7, 8, 9,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000111.1.",
  extractedFrom: {
    sheet: "lpc-winter-tiles/files/TilesB.png",
    rect: { from: [0,0], to: [2,3] },
  },
});

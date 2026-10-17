// snowy fir pair: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("5d5e5a86-7a85-4baa-8c2c-9875822f7c1c"),
  name: "snowy fir pair",
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
        16, 17, 18,
        22, 23, 24,
      ],
    },
    {
      layer: "Trees",
      gids: [
        0, 5, 6,
        10, 11, 12,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: ".00000111.1.",
  extractedFrom: {
    sheet: "lpc-winter-tiles/files/TilesB.png",
    rect: { from: [3,0], to: [5,3] },
  },
});

// small snowy fir: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("8720419e-1d50-4a8c-9dcf-9ec33a27b3ba"),
  name: "small snowy fir",
  theme: "winter",
  width: 2,
  height: 2,
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
        0, 0,
        37, 38,
      ],
    },
    {
      layer: "Trees",
      gids: [
        31, 32,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0011",
  extractedFrom: {
    sheet: "lpc-winter-tiles/files/TilesB.png",
    rect: { from: [0,5], to: [1,6] },
  },
});

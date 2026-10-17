// palm tree: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("ef928535-7133-4414-8742-8721588270a8"),
  name: "palm tree",
  theme: "desert",
  width: 3,
  height: 4,
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
        353, 354, 355,
      ],
    },
    {
      layer: "Trees",
      gids: [
        257, 258, 259,
        289, 290, 291,
        0, 322, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000.1....",
  extractedFrom: {
    sheet: "lpc-beach-desert/files/lpc-beach-desert/beach-desert.png",
    rect: { from: [0,8], to: [2,11] },
  },
});

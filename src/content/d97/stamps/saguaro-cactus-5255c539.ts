// saguaro cactus: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("5255c539-42da-4bc4-93e7-e57f13fb34e5"),
  name: "saguaro cactus",
  theme: "desert",
  width: 2,
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
      layer: "Objects",
      gids: [
        0, 0,
        0, 0,
        204, 205,
        236, 237,
      ],
    },
    {
      layer: "Objects",
      gids: [
        140, 141,
        172, 173,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "00001111",
  extractedFrom: {
    sheet: "lpc-beach-desert/files/lpc-beach-desert/beach-desert.png",
    rect: { from: [11,4], to: [12,7] },
  },
});

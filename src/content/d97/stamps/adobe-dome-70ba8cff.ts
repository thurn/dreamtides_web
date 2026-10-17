// adobe dome: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("70ba8cff-3aad-4f83-af4d-aea70ec52475"),
  name: "adobe dome",
  theme: "desert",
  width: 4,
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
      layer: "Buildings",
      gids: [
        0, 0, 0, 0,
        0, 0, 0, 0,
        113, 114, 115, 116,
        129, 130, 131, 132,
      ],
    },
    {
      layer: "Buildings",
      gids: [
        81, 82, 83, 84,
        97, 98, 99, 100,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0000000011111101",
  points: {
    door: [2, 3],
  },
  extractedFrom: {
    sheet: "lpc-adobe-town-set/files/adobe-2.png",
    rect: { from: [0,5], to: [3,8] },
  },
});

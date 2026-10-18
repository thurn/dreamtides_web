// garden shed: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("ce5f48a0-3d3c-4011-b7cc-f5f561d7f7a1"),
  name: "garden shed",
  theme: "building",
  width: 2,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "decorations-medieval",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 1024,
      columns: 16,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-medieval-village-decorations/files/decoration_medieval/decorations-medieval.png",
        width: 512,
        height: 2048,
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
        204, 205,
        220, 221,
      ],
    },
    {
      layer: "Objects",
      gids: [
        188, 189,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "001111",
  extractedFrom: {
    sheet: "lpc-medieval-village-decorations/files/decoration_medieval/decorations-medieval.png",
    rect: { from: [11,11], to: [12,13] },
  },
});

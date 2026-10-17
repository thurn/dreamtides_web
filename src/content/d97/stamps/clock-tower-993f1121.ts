// clock tower: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("993f1121-2811-4ba0-ac00-26608451a5a9"),
  name: "clock tower",
  theme: "street",
  width: 2,
  height: 5,
  tilesets: [
    {
      firstGid: 1,
      name: "victorian-streets",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 1536,
      columns: 16,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-victorian-town-decorations/files/lpc-victorian-decoration/victorian-streets.png",
        width: 512,
        height: 3072,
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
        0, 0,
        0, 0,
        0, 0,
        1519, 1520,
        1535, 1536,
      ],
    },
    {
      layer: "Buildings",
      gids: [
        1471, 1472,
        1487, 1488,
        1503, 1504,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0000001111",
  extractedFrom: {
    sheet: "lpc-victorian-town-decorations/files/lpc-victorian-decoration/victorian-streets.png",
    rect: { from: [14,91], to: [15,95] },
  },
});

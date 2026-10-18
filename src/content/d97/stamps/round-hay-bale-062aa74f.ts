// round hay bale: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("062aa74f-98e2-4159-a7af-91cb250818f6"),
  name: "round hay bale",
  theme: "street",
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
        337, 338,
        353, 354,
      ],
    },
    {
      layer: "Objects",
      gids: [
        321, 322,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "001111",
  extractedFrom: {
    sheet: "lpc-medieval-village-decorations/files/decoration_medieval/decorations-medieval.png",
    rect: { from: [0,20], to: [1,22] },
  },
});

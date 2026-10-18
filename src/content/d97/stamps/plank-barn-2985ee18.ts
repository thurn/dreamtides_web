// plank barn: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("2985ee18-0562-420b-b925-525d08985855"),
  name: "plank barn",
  theme: "building",
  width: 2,
  height: 4,
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
        0, 0,
        362, 363,
        378, 379,
      ],
    },
    {
      layer: "Objects",
      gids: [
        330, 331,
        346, 347,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "00001111",
  extractedFrom: {
    sheet: "lpc-medieval-village-decorations/files/decoration_medieval/decorations-medieval.png",
    rect: { from: [9,20], to: [10,23] },
  },
});

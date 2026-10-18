// scarecrow: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("33be7cfd-c2d7-4e7b-8a5b-9ae82ba1420f"),
  name: "scarecrow",
  theme: "street",
  width: 1,
  height: 2,
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
        0,
        91,
      ],
    },
    {
      layer: "Objects",
      gids: [
        75,
        0,
      ],
      above: true,
    },
  ],
  walkability: "01",
  extractedFrom: {
    sheet: "lpc-medieval-village-decorations/files/decoration_medieval/decorations-medieval.png",
    rect: { from: [10,4], to: [10,5] },
  },
});

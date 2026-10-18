// hooded statue: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("a71de33a-692e-4827-935b-6168e5b547de"),
  name: "hooded statue",
  theme: "graveyard",
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
        164,
      ],
    },
    {
      layer: "Objects",
      gids: [
        148,
        0,
      ],
      above: true,
    },
  ],
  walkability: "01",
  extractedFrom: {
    sheet: "lpc-medieval-village-decorations/files/decoration_medieval/decorations-medieval.png",
    rect: { from: [3,9], to: [3,10] },
  },
});

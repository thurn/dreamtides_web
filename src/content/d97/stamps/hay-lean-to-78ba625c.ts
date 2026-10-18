// hay lean-to: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("78ba625c-9694-4dac-bf2b-66d9198599b6"),
  name: "hay lean-to",
  theme: "building",
  width: 2,
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
        0, 0,
        380, 381,
      ],
    },
    {
      layer: "Objects",
      gids: [
        364, 365,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0011",
  extractedFrom: {
    sheet: "lpc-medieval-village-decorations/files/decoration_medieval/decorations-medieval.png",
    rect: { from: [11,22], to: [12,23] },
  },
});

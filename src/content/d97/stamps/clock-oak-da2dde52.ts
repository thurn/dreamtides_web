// clock oak: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("da2dde52-0b42-4571-a6f2-a2add8805525"),
  name: "clock oak",
  theme: "nature",
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
        0, 0,
        207, 208,
      ],
    },
    {
      layer: "Objects",
      gids: [
        159, 160,
        175, 176,
        191, 192,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "00000011",
  extractedFrom: {
    sheet: "lpc-medieval-village-decorations/files/decoration_medieval/decorations-medieval.png",
    rect: { from: [14,9], to: [15,12] },
  },
});

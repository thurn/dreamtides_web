// stone lantern: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("a575fcd0-9596-4f26-99e4-222fa2598d69"),
  name: "stone lantern",
  theme: "japanese",
  width: 1,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "toro",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 2,
      columns: 1,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/toro.png",
        width: 32,
        height: 64,
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
        2,
      ],
    },
    {
      layer: "Objects",
      gids: [
        1,
        0,
      ],
      above: true,
    },
  ],
  walkability: "01",
  extractedFrom: {
    sheet: "source-of-tales/tiles/toro.png",
    rect: { from: [0,0], to: [0,1] },
  },
});

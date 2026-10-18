// server rack: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("79f84432-b893-4b4e-b3fb-652465c774eb"),
  name: "server rack",
  theme: "scifi",
  width: 1,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "obj_misk_atlas",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 1024,
      columns: 32,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-tile-atlas2/files/obj_misk_atlas.png",
        width: 1024,
        height: 1024,
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
        630,
      ],
    },
    {
      layer: "Objects",
      gids: [
        598,
        0,
      ],
      above: true,
    },
  ],
  walkability: "01",
  extractedFrom: {
    sheet: "lpc-tile-atlas2/files/obj_misk_atlas.png",
    rect: { from: [21,18], to: [21,19] },
  },
});

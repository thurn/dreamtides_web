// street lamp: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("815c6fcb-582c-46dc-8052-1d50038bf9cc"),
  name: "street lamp",
  theme: "scifi",
  width: 1,
  height: 3,
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
        0,
        760,
      ],
    },
    {
      layer: "Objects",
      gids: [
        696,
        728,
        0,
      ],
      above: true,
    },
  ],
  walkability: "001",
  extractedFrom: {
    sheet: "lpc-tile-atlas2/files/obj_misk_atlas.png",
    rect: { from: [23,21], to: [23,23] },
  },
});

// rowboat: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("dd35bdd7-4614-4050-a2a2-1b640a6c0578"),
  name: "rowboat",
  theme: "desert",
  width: 4,
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
        808, 809, 810, 811,
        840, 841, 842, 843,
      ],
    },
  ],
  walkability: "11111111",
  extractedFrom: {
    sheet: "lpc-tile-atlas2/files/obj_misk_atlas.png",
    rect: { from: [7,25], to: [10,26] },
  },
});

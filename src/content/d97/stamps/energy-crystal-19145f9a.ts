// energy crystal: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("19145f9a-036d-45b9-960b-4c2deda3a6b4"),
  name: "energy crystal",
  theme: "scifi",
  width: 1,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "scifi_hackspace_frama",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 99,
      columns: 11,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-frama-sci-fi-extensions/files/frama_scifi_extension/scifi_hackspace_frama.png",
        width: 352,
        height: 288,
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
        34,
      ],
    },
    {
      layer: "Objects",
      gids: [
        23,
        0,
      ],
      above: true,
    },
  ],
  walkability: "01",
  extractedFrom: {
    sheet: "lpc-frama-sci-fi-extensions/files/frama_scifi_extension/scifi_hackspace_frama.png",
    rect: { from: [0,2], to: [0,3] },
  },
});

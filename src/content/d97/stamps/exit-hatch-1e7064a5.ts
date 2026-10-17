// exit hatch: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("1e7064a5-3669-4b65-9d73-389bdc749cad"),
  name: "exit hatch",
  theme: "scifi",
  width: 2,
  height: 3,
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
      layer: "Walls",
      gids: [
        0, 0,
        58, 59,
        69, 70,
      ],
    },
    {
      layer: "Walls",
      gids: [
        47, 48,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "001101",
  points: {
    door: [0, 2],
  },
  extractedFrom: {
    sheet: "lpc-frama-sci-fi-extensions/files/frama_scifi_extension/scifi_hackspace_frama.png",
    rect: { from: [2,4], to: [3,6] },
  },
});

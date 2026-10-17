// great cherry tree: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("04b0866d-d919-432b-a1c8-f8ecb7792654"),
  name: "great cherry tree",
  theme: "japanese",
  width: 3,
  height: 4,
  tilesets: [
    {
      firstGid: 1,
      name: "cherry_blossom_trees",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 28,
      columns: 7,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/cherry_blossom_trees.png",
        width: 224,
        height: 128,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Trees",
      gids: [
        0, 0, 0,
        0, 0, 0,
        19, 20, 21,
        26, 27, 28,
      ],
    },
    {
      layer: "Trees",
      gids: [
        5, 6, 7,
        12, 13, 14,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000111.1.",
  extractedFrom: {
    sheet: "source-of-tales/tiles/cherry_blossom_trees.png",
    rect: { from: [4,0], to: [6,3] },
  },
});

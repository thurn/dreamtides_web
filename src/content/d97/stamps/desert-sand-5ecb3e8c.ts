// desert sand: a D97 map stamp extracted by `npm run d97:map -- stamps extract`:
// plain sand from Source of Tales' Goldenfields desert, on its Terrain layer,
// to fill a crop of that desert where a recipe erases cliffs.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId, parseDreamMapSourceHash } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("5ecb3e8c-46d5-408a-ba7c-e2eef373f74a"),
  name: "desert sand",
  theme: "desert",
  width: 2,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "terrain",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 464,
      columns: 16,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/terrain.png",
        width: 512,
        height: 928,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Terrain",
      gids: [
        2, 2,
        2, 2,
      ],
    },
  ],
  walkability: "0000",
  extractedFrom: {
    map: "source-of-tales/maps/goldenfields/main.tmx",
    rect: { from: [112,0], to: [113,1] },
    sourceSha256: parseDreamMapSourceHash("bfef031be76be13bb3071c5de967237364b5339bc7ec7563016db0b9c3aa8074"),
  },
});

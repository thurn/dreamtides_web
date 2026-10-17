// ember arch: a D97 map stamp extracted by `npm run d97:map -- stamps extract`,
// then trimmed to a free-standing dream-door frame: the scorched ground and
// cliff fragments around the arch are cleared (gid 0 keeps the map's own
// ground), and the mask leaves one walkable column in the opening (x 3,
// rows 4-6) so the door, its entry and a guardian stand in single file.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId, parseDreamMapSourceHash } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("684f3b39-baac-49fd-9031-5c874c76d5ee"),
  name: "ember arch",
  theme: "building",
  width: 8,
  height: 7,
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
    {
      firstGid: 600,
      name: "magecity",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 360,
      columns: 8,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/magecity.png",
        width: 256,
        height: 1450,
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
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 336, 334, 334, 335, 0, 0,
        0, 336, 330, 322, 322, 326, 335, 0,
        336, 330, 323, 325, 325, 324, 326, 335,
        332, 322, 327, 441, 4, 332, 322, 327,
        333, 325, 329, 4, 4, 333, 325, 329,
        0, 0, 0, 4, 4, 0, 0, 0,
      ],
    },
    {
      layer: "Ground",
      gids: [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 629, 0, 0, 0, 0, 629, 0,
        629, 0, 0, 0, 0, 0, 0, 629,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        621, 0, 621, 0, 0, 621, 0, 621,
        629, 0, 629, 0, 0, 629, 0, 629,
      ],
    },
    {
      layer: "Over",
      above: true,
      gids: [
        0, 621, 0, 0, 0, 0, 621, 0,
        621, 0, 0, 0, 0, 0, 0, 621,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
      ],
    },
  ],
  walkability: "00000000011111101111111111111111111011111110111111101111",
  extractedFrom: {
    map: "source-of-tales/maps/mountainwatch/main.tmx",
    rect: { from: [47,168], to: [54,174] },
    sourceSha256: parseDreamMapSourceHash("88f3428886232c33e12d5b1a05d0fc458bd9e5f4a275849834e39ab14c6b5bfe"),
  },
});

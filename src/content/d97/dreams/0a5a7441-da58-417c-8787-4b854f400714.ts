// The oasis below the temple of its brief
// (`./0a5a7441-da58-417c-8787-4b854f400714.md`) on its map
// (`../maps/0a5a7441-da58-417c-8787-4b854f400714.ts`).
//
// The oasis is the town (decision P33): a run arrives at its town door, the
// little gate in the cliff, with the waypoint, the awning where the shop
// stands and the oasis's four friendly anchors around it. Three challengers
// wait beyond it, on the high terrace, the cliff nook and the falls' foot,
// and the temple portico on the high ground is the exit door, with a
// guardian anchor in its mouth.
//
// A small dream in the desert temple tileset (`./tilesets.ts`). This module
// holds its concept and map; its residents, personas and quests come with
// its residents. Until then one challenger is seated, at the falls' foot:
// the home Avatars of the tileset, each as itself, so a run here meets a
// challenge.

import { parseAvatarId, parseD97CharacterId, parseD97DreamId, parseD97TilesetId, parseDreamAnchorId, parseDreamMapId } from "../../../types/identifiers";
import { defineCatalogDream } from "./schema";

const anchor = parseDreamAnchorId;

/** The desert temple (`./tilesets.ts`). */
const DESERT_TEMPLE = parseD97TilesetId("ae87cbce-6c1e-488e-ba58-713ae5c0199d");

/** The little gate in the cliff: the town door, where a run arrives. */
const TOWN_DOOR = anchor("4778d845-4513-4c61-8fa5-1dfc7a70c9a7");

export default defineCatalogDream({
  id: parseD97DreamId("0a5a7441-da58-417c-8787-4b854f400714"),
  mapId: parseDreamMapId("0a5a7441-da58-417c-8787-4b854f400714"),
  size: "small",
  tilesetId: DESERT_TEMPLE,
  topology: {
    waypointAnchorId: anchor("d9451bd2-6447-4a41-b1ea-2daf66f3cb54"),
    arrivalDoorAnchorId: TOWN_DOOR,
    // The temple portico and the guardian anchor in its mouth.
    exitDoorAnchorId: anchor("f67306e1-6e5a-4712-adff-7391e86746d6"),
    exitGuardianAnchorId: anchor("6119e753-b347-4fe4-846c-570bffb343d1"),
    // In front of the awning.
    shopAnchorId: anchor("d5d3658b-6fcf-4e4a-b63f-35bc4578e1e4"),
  },
  town: { doorAnchorId: TOWN_DOOR, cluster: "oasis" },
  rooms: [],
  residents: [
    // The falls' foot: Seld Rakor, or Vethran when the player is Seld Rakor.
    {
      role: "challenger",
      anchorId: anchor("6ab6b15c-43f9-4432-8622-457f7abc14c4"),
      scale: "standard",
      deck: {
        kind: "avatar",
        incarnations: [
          {
            avatarId: parseAvatarId("c72cfd7b-408b-47f6-adf1-1e486a7e20d3"),
            characterId: parseD97CharacterId("04f13342-9547-4c92-a2c7-82a2f5c07f1a"),
          },
          {
            avatarId: parseAvatarId("f0f5449e-01c2-4635-bce1-76b179fc2108"),
            characterId: parseD97CharacterId("515ba04f-a88c-413b-98e8-6863c11d8e3c"),
          },
        ],
      },
    },
  ],
  personas: [],
  quests: [],
});

// The first dream: the hill town of its brief
// (`./3229d6c7-0700-4f37-9b07-921e3dccb8b6.md`) on its map
// (`../maps/3229d6c7-0700-4f37-9b07-921e3dccb8b6.ts`). Its residents' looks
// are in `../characters/3229d6c7-0700-4f37-9b07-921e3dccb8b6.ts` and their
// dialogue and quests in `../dialogue/3229d6c7-0700-4f37-9b07-921e3dccb8b6.ts`.
//
// The well square is the town (decision P33): a run arrives at its town
// door. The innkeeper keeps the shop in the inn, the dream's one room
// (decision P19), behind the inn door on the square; the reeve keeps the
// hall steps and Hessa the square's south corner; three townsfolk stand in
// the square and two more in the inn's tap room, and two townsfolk and five
// challengers fill the high ground, the south road and the stubble terrace.
// Vaela guards the ember arch on the high field, or Tessa when the player is
// Vaela: an ember of a day that will not end, then a gleaner of its last
// field. Each appears, speaks and fights as herself. The square's four open
// friendly anchors stand empty for the friendly characters later assembly
// places.

import {
  parseAvatarId,
  parseD97CharacterId,
  type AvatarId,
  parseD97DreamId,
  parseD97RoomId,
  parseDreamAnchorId,
  parseDreamMapId,
} from "../../../types/identifiers";
import {
  AMBROSE_FINCH,
  BARNABY_THATCH,
  COBB,
  DILLY_SORREL,
  GARROW_THRESHER,
  HESSA_MOTT,
  JORY_HEWITT,
  LAMBERT_ROOK,
  MOTHER_YARROW,
  NETTIE_FURROW,
  OSWIN_MARL,
  PELL,
  THE_SCARECROW,
  WENNA_ASHDOWN,
  WIDOW_MARRABLE,
} from "../characters/3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import { FIRST_DREAM_DIALOGUES as LINES } from "../dialogue/3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import { defineDream } from "./schema";

const anchor = parseDreamAnchorId;

const VAELA = parseAvatarId("60bd584b-5bc8-4ee7-8a98-cbb304eb71ab");
const TESSA = parseAvatarId("ba973428-6d90-4847-b779-cb7e25a5ac84");
/** Vaela's and Tessa's own character recipes (`../characters/avatars/`). */
const VAELA_CHARACTER = parseD97CharacterId("e12f93c6-8033-4b31-b6e7-402eedfe566c");
const TESSA_CHARACTER = parseD97CharacterId("f045208d-0eb8-4c96-96f4-632deec4d161");

/** A generic challenger's deck, built from its deck source Avatar's tide set. */
const deckOf = (deckSourceAvatarId: AvatarId) => ({ kind: "generic", deckSourceAvatarId }) as const;

export default defineDream({
  id: parseD97DreamId("3229d6c7-0700-4f37-9b07-921e3dccb8b6"),
  mapId: parseDreamMapId("3229d6c7-0700-4f37-9b07-921e3dccb8b6"),
  topology: {
    waypointAnchorId: anchor("d01c6e03-c291-4164-a3ec-50393ed0c817"),
    // The town door, the iron arch in the well square.
    arrivalDoorAnchorId: anchor("c9f6d615-0e4c-465b-a990-7bd30bdb0fc8"),
    // The ember arch and the guardian filling its mouth.
    exitDoorAnchorId: anchor("2ef5689f-f791-402c-9cc6-6e59cf0c5e14"),
    exitGuardianAnchorId: anchor("649daef4-9f8b-4e0e-b3f2-3d2ab91a844d"),
    // In front of the inn's bar.
    shopAnchorId: anchor("9823fdb3-fff7-4dda-8d86-230b0109e7a3"),
  },
  // The town is the well square's cluster around the town door, which is
  // also the arrival door.
  town: {
    doorAnchorId: anchor("c9f6d615-0e4c-465b-a990-7bd30bdb0fc8"),
    cluster: "well square",
  },
  rooms: [
    // The inn, behind the inn door on the well square.
    {
      id: parseD97RoomId("8f22aeec-9a8f-4d44-91fb-7668f369609f"),
      mapId: parseDreamMapId("8f22aeec-9a8f-4d44-91fb-7668f369609f"),
      buildingDoorAnchorId: anchor("be2ecdb3-f77c-4efd-84a8-11d197767a0b"),
      doorAnchorId: anchor("3d1b6084-0b8f-4c0f-a41d-2b4cad8a9af6"),
    },
  ],
  residents: [
    // The ember arch.
    {
      role: "guardian",
      anchorId: anchor("649daef4-9f8b-4e0e-b3f2-3d2ab91a844d"),
      scale: "standard",
      deck: {
        kind: "avatar",
        incarnations: [
          { avatarId: VAELA, characterId: VAELA_CHARACTER, dialogueId: LINES.vaela },
          { avatarId: TESSA, characterId: TESSA_CHARACTER, dialogueId: LINES.tessa },
        ],
      },
    },
    // The inn's bar, the hall steps and the square's south corner.
    { role: "shop", anchorId: anchor("9823fdb3-fff7-4dda-8d86-230b0109e7a3"), characterId: WENNA_ASHDOWN.id, scale: "standard", dialogueId: LINES.wenna },
    { role: "friendly", anchorId: anchor("8d202783-1114-45ae-af43-115eb6688d64"), characterId: LAMBERT_ROOK.id, scale: "standard", dialogueId: LINES.reeve },
    { role: "friendly", anchorId: anchor("ee1d1483-32ee-414b-98cd-5f3788471b13"), characterId: HESSA_MOTT.id, scale: "standard", dialogueId: LINES.hessa },
    // Townsfolk: the square's east houses, north of the well, the high
    // field, beside the well and the white bridge's head.
    { role: "townsfolk", anchorId: anchor("8b9d34e7-c976-49b2-a995-c22eec88f4ce"), characterId: PELL.id, scale: "standard", dialogueId: LINES.pell },
    { role: "townsfolk", anchorId: anchor("ba3c1bab-018c-4164-988d-67f48de0b423"), characterId: AMBROSE_FINCH.id, scale: "standard", dialogueId: LINES.ambrose },
    { role: "townsfolk", anchorId: anchor("bc4b6a27-abf6-430c-9a5e-23b899945106"), characterId: DILLY_SORREL.id, scale: "standard", dialogueId: LINES.dilly },
    { role: "townsfolk", anchorId: anchor("c36ac406-967d-4dee-9fa7-faebc17b1da7"), characterId: WIDOW_MARRABLE.id, scale: "standard", dialogueId: LINES.marrable },
    { role: "townsfolk", anchorId: anchor("e2f1e61b-dcf6-4c18-86a7-412d8fcdb536"), characterId: COBB.id, scale: "standard", dialogueId: LINES.cobb },
    // In the inn's tap room: by the west table, and between the back tables.
    { role: "townsfolk", anchorId: anchor("38e9424d-ba12-45d7-ad0d-e164ed590f70"), characterId: BARNABY_THATCH.id, scale: "standard", dialogueId: LINES.barnaby },
    { role: "townsfolk", anchorId: anchor("aad4297c-5246-4f3f-897a-f0ef14088e36"), characterId: NETTIE_FURROW.id, scale: "standard", dialogueId: LINES.nettie },
    // Challengers. The herb ledge: a hedge-witch (Edran's tides).
    {
      role: "challenger",
      anchorId: anchor("3bc16e16-b79f-4d67-8db3-5b99ccb9cdf2"),
      characterId: MOTHER_YARROW.id,
      scale: "standard",
      dialogueId: LINES.yarrow,
      deck: deckOf(parseAvatarId("5e28154d-770a-4b84-8aac-9de44f5d7d02")),
    },
    // The south road: a thresher, in step like a phalanx (Demetrios's tides).
    {
      role: "challenger",
      anchorId: anchor("bf1e576a-4b6b-4908-8fd2-3875b360dfd3"),
      characterId: GARROW_THRESHER.id,
      scale: "standard",
      dialogueId: LINES.garrow,
      deck: deckOf(parseAvatarId("2c53b1b9-9291-4bba-8d3a-f40b545c8f3c")),
    },
    // The stubble terrace's pines: a woodcutter (Grath's tides).
    {
      role: "challenger",
      anchorId: anchor("7a2a2fa2-608f-4f41-81dc-659bf11bd0a2"),
      characterId: JORY_HEWITT.id,
      scale: "standard",
      dialogueId: LINES.jory,
      deck: deckOf(parseAvatarId("94e7c651-25e9-4a62-9de4-eaf5ba20542c")),
    },
    // The stubble terrace: the scarecrow (Vethran's tides).
    {
      role: "challenger",
      anchorId: anchor("720d48ff-863e-4c8f-9354-b1431147d967"),
      characterId: THE_SCARECROW.id,
      scale: "standard",
      dialogueId: LINES.scarecrow,
      deck: deckOf(parseAvatarId("f0f5449e-01c2-4635-bce1-76b179fc2108")),
    },
    // The high field: the tithe clerk (Seld Rakor's tides).
    {
      role: "challenger",
      anchorId: anchor("457b0f96-1ecf-473d-bbec-62054dde63ec"),
      characterId: OSWIN_MARL.id,
      scale: "standard",
      dialogueId: LINES.oswin,
      deck: deckOf(parseAvatarId("c72cfd7b-408b-47f6-adf1-1e486a7e20d3")),
    },
  ],
});

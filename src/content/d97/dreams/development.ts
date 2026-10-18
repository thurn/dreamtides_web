// The development dream: the synthetic development map
// (src/d97/overworld/dev-map.ts) with residents drawn from the development
// character recipes, speaking the fixture dialogue
// (src/d97/overworld/dev-dialogue.ts). Its guardian is an Avatar resident:
// Caedryn, or Calloway when the player is Caedryn, each drawn as their own
// Avatar character. Development QA scenes play it. It is not in the dream
// catalog: only development builds register it
// (src/d97/development-content.ts).

import { DEV_DIALOGUES } from "../../../d97/overworld/dev-dialogue";
import { DEV_MAP_DEFINITION, devAnchorId } from "../../../d97/overworld/dev-map";
import { parseAvatarId, parseD97CharacterId, parseD97DreamId } from "../../../types/identifiers";
import { DEV_KNIGHT, DEV_VILLAGER } from "../characters/development";
import { defineDream } from "./schema";

const CAEDRYN = parseAvatarId("9d64a4a2-3dc7-456e-9eb2-5fe3a48883c4");
const CALLOWAY = parseAvatarId("8a2fcd65-bba7-459c-a6b0-f0391b9293fd");
const CORVATH = parseAvatarId("b8c1b0ab-0fe6-47d6-b576-0c2231aeb81e");
const DEMETRIOS = parseAvatarId("2c53b1b9-9291-4bba-8d3a-f40b545c8f3c");
const DRUSUS = parseAvatarId("bdd3a3a7-242c-4d2b-8071-ebe56891a340");
/** Caedryn's and Calloway's own character recipes (`../characters/avatars/`). */
const CAEDRYN_CHARACTER = parseD97CharacterId("9eb05998-2e5b-462e-ba3a-568e6cd0f2ea");
const CALLOWAY_CHARACTER = parseD97CharacterId("8bd7eef9-b2f8-4b9c-89ba-cea2505ffac9");

const generic = (deckSourceAvatarId: typeof CORVATH) => ({ kind: "generic" as const, deckSourceAvatarId });

export const DEVELOPMENT_DREAM = defineDream({
  id: parseD97DreamId("d9720000-0000-4000-8000-000000000000"),
  mapId: DEV_MAP_DEFINITION.id,
  topology: {
    waypointAnchorId: devAnchorId(3),
    arrivalDoorAnchorId: devAnchorId(1),
    exitDoorAnchorId: devAnchorId(2),
    exitGuardianAnchorId: devAnchorId(4),
    shopAnchorId: devAnchorId(5),
  },
  rooms: [],
  residents: [
    // Four challengers and the guardian; the fourth challenger is a prize duel.
    { role: "challenger", anchorId: devAnchorId(6), characterId: DEV_KNIGHT.id, scale: "standard", deck: generic(CORVATH) },
    { role: "challenger", anchorId: devAnchorId(7), characterId: DEV_VILLAGER.id, scale: "standard", deck: generic(DEMETRIOS) },
    { role: "challenger", anchorId: devAnchorId(8), characterId: DEV_KNIGHT.id, scale: "standard", deck: generic(DRUSUS) },
    { role: "challenger", anchorId: devAnchorId(9), characterId: DEV_VILLAGER.id, scale: "standard", badge: "prizeDuel", deck: generic(CALLOWAY) },
    {
      role: "guardian",
      anchorId: devAnchorId(4),
      scale: "incarnation",
      deck: {
        kind: "avatar",
        incarnations: [
          { avatarId: CAEDRYN, characterId: CAEDRYN_CHARACTER },
          { avatarId: CALLOWAY, characterId: CALLOWAY_CHARACTER },
        ],
      },
    },
    { role: "shop", anchorId: devAnchorId(5), characterId: DEV_VILLAGER.id, scale: "standard" },
    // The plaza friendlies: two quest givers and the parcel's recipient.
    { role: "friendly", anchorId: devAnchorId(10), characterId: DEV_VILLAGER.id, scale: "standard", dialogueId: DEV_DIALOGUES.wren },
    { role: "friendly", anchorId: devAnchorId(11), characterId: DEV_KNIGHT.id, scale: "standard", dialogueId: DEV_DIALOGUES.bram },
    { role: "friendly", anchorId: devAnchorId(12), characterId: DEV_VILLAGER.id, scale: "standard", dialogueId: DEV_DIALOGUES.oda },
    { role: "townsfolk", anchorId: devAnchorId(15), characterId: DEV_VILLAGER.id, scale: "standard", dialogueId: DEV_DIALOGUES.pip },
    { role: "townsfolk", anchorId: devAnchorId(16), characterId: DEV_VILLAGER.id, scale: "standard", dialogueId: DEV_DIALOGUES.moss },
  ],
});

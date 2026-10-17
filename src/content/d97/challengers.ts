// Dreamtides 97 challenger and guardian occupants (Appendix B §B9, §B11):
// who stands at a battle anchor and what deck they fight with. A generic
// character fights with a deck built from its deck source Avatar's tide set
// and never has an Avatar ability; an Avatar character fights as its own
// Avatar, the first of its Avatars the player is not playing. Keyed by
// anchor UUID; dream authoring beads add their dreams' occupants.

import { DEV_KNIGHT, DEV_VILLAGER, DEV_WOLF } from "./characters/development";
import {
  parseAvatarId,
  parseDreamAnchorId,
  type AvatarId,
  type D97CharacterId,
  type DreamAnchorId,
} from "../../types/identifiers";

export type D97ChallengerDeck =
  | { readonly kind: "generic"; readonly deckSourceAvatarId: AvatarId }
  | { readonly kind: "avatar"; readonly avatarIds: readonly AvatarId[] };

export interface D97ChallengerDefinition {
  readonly anchorId: DreamAnchorId;
  readonly characterId: D97CharacterId;
  /** A guardian blocks a door and fights at the guardian tier. */
  readonly role: "challenger" | "guardian";
  readonly deck: D97ChallengerDeck;
}

const anchor = parseDreamAnchorId;
const CAEDRYN = parseAvatarId("9d64a4a2-3dc7-456e-9eb2-5fe3a48883c4");
const CALLOWAY = parseAvatarId("8a2fcd65-bba7-459c-a6b0-f0391b9293fd");
const CORVATH = parseAvatarId("b8c1b0ab-0fe6-47d6-b576-0c2231aeb81e");
const DEMETRIOS = parseAvatarId("2c53b1b9-9291-4bba-8d3a-f40b545c8f3c");
const DRUSUS = parseAvatarId("bdd3a3a7-242c-4d2b-8071-ebe56891a340");

/** The development dream's four challengers and its guardian. */
const DEVELOPMENT_CHALLENGERS: readonly D97ChallengerDefinition[] = [
  { anchorId: anchor("d9700000-0000-4000-8000-000000000006"), characterId: DEV_KNIGHT.id, role: "challenger", deck: { kind: "generic", deckSourceAvatarId: CORVATH } },
  { anchorId: anchor("d9700000-0000-4000-8000-000000000007"), characterId: DEV_VILLAGER.id, role: "challenger", deck: { kind: "generic", deckSourceAvatarId: DEMETRIOS } },
  { anchorId: anchor("d9700000-0000-4000-8000-000000000008"), characterId: DEV_KNIGHT.id, role: "challenger", deck: { kind: "generic", deckSourceAvatarId: DRUSUS } },
  { anchorId: anchor("d9700000-0000-4000-8000-000000000009"), characterId: DEV_VILLAGER.id, role: "challenger", deck: { kind: "generic", deckSourceAvatarId: CALLOWAY } },
  { anchorId: anchor("d9700000-0000-4000-8000-000000000004"), characterId: DEV_WOLF.id, role: "guardian", deck: { kind: "avatar", avatarIds: [CAEDRYN, CALLOWAY] } },
];

export const D97_CHALLENGERS: readonly D97ChallengerDefinition[] = [...DEVELOPMENT_CHALLENGERS];

// Dreamtides 97 challenger and guardian occupants (Appendix B §B9, §B11):
// who stands at a battle anchor and what deck they fight with, assembled
// from the battle residents of every dream module (`./dreams/`), the catalog
// dreams and the development dream. Anchor UUIDs are unique across dreams, so
// the encounter rules find a challenger by its anchor alone.

import { D97_DREAM_MODULES } from "./dreams";
import type { D97ChallengerDeck, D97DreamDefinition } from "./dreams/schema";
import type { D97CharacterId, DreamAnchorId } from "../../types/identifiers";

export interface D97ChallengerDefinition {
  readonly anchorId: DreamAnchorId;
  readonly characterId: D97CharacterId;
  /** A guardian blocks a door and fights at the guardian tier. */
  readonly role: "challenger" | "guardian";
  readonly deck: D97ChallengerDeck;
}

/** The challengers and guardians `dreams` declare, in declaration order. */
export function dreamChallengers(dreams: readonly D97DreamDefinition[]): D97ChallengerDefinition[] {
  return dreams.flatMap((dream) =>
    dream.residents.flatMap((resident) =>
      resident.role === "challenger" || resident.role === "guardian"
        ? [{ anchorId: resident.anchorId, characterId: resident.characterId, role: resident.role, deck: resident.deck }]
        : [],
    ),
  );
}

export const D97_CHALLENGERS: readonly D97ChallengerDefinition[] = dreamChallengers(D97_DREAM_MODULES);

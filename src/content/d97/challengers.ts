// Dreamtides 97 challenger and guardian occupants (Appendix B §B9, §B11):
// who stands at a battle anchor of a dream and what deck they fight with,
// read from the dream module's battle residents (`./dreams/`). Each
// registered dream keeps its own map (`src/rules/d97/d97-dreams.ts`), so the
// encounter rules find a challenger only in the run's dream.

import type { D97ChallengerDeck, D97DreamDefinition } from "./dreams/schema";
import type { D97CharacterId, DreamAnchorId } from "../../types/identifiers";

export interface D97ChallengerDefinition {
  readonly anchorId: DreamAnchorId;
  readonly characterId: D97CharacterId;
  /** A guardian blocks a door and fights at the guardian tier. */
  readonly role: "challenger" | "guardian";
  readonly deck: D97ChallengerDeck;
}

/** The challengers and guardians `dream` declares, by anchor, in declaration order. */
export function dreamChallengers(dream: D97DreamDefinition): ReadonlyMap<DreamAnchorId, D97ChallengerDefinition> {
  return new Map(
    dream.residents.flatMap((resident) =>
      resident.role === "challenger" || resident.role === "guardian"
        ? [[resident.anchorId, { anchorId: resident.anchorId, characterId: resident.characterId, role: resident.role, deck: resident.deck }] as const]
        : [],
    ),
  );
}

// The pure view-model builder for the D97 encounter preview: resolves the
// stored encounter's UUIDs (Avatar, signature cards, antes) to display data
// at the render boundary, and names the opponent: an Avatar character by its
// Avatar, anyone else by the name their dialogue speaks under, else by role.
// A generic opponent's preview names no Avatar: its signature cards show the
// deck it plays.

import type { D97EncounterPreviewView, D97PreviewCardView } from "../../../cumulus/screens/d97/D97EncounterPreview";
import { findCopy } from "../../../d97/collection/collection";
import type { D97Collection } from "../../../d97/collection/types";
import type { D97Encounter } from "../../../rules/d97/d97-state";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { AvatarContent } from "../../../types/content";

const ROLE_LABELS: Readonly<Record<D97Encounter["role"], string>> = {
  challenger: "Challenger",
  guardian: "Guardian",
};

/** The preview of `encounter`, or null when its Avatar is not in the roster. */
export function buildD97EncounterPreviewView(
  collection: D97Collection,
  encounter: D97Encounter,
  avatars: readonly AvatarContent[],
  cardsById: ReadonlyMap<CardId, CardData>,
  /** The name the opponent's dialogue speaks under, or null for one with none. */
  speakerName: string | null,
): D97EncounterPreviewView | null {
  const avatar = avatars.find((candidate) => candidate.id === encounter.avatarId);
  if (avatar === undefined) return null;
  const view = (cardId: CardId | null | undefined): D97PreviewCardView | null => {
    const card = cardId === null || cardId === undefined ? undefined : cardsById.get(cardId);
    return card === undefined ? null : { cardId: card.id, model: { cardId: card.id, displaySnapshot: card } };
  };
  const anteCopy = encounter.playerAnteCopyId === null ? null : findCopy(collection, encounter.playerAnteCopyId);
  const avatarCharacter = encounter.kind === "avatar";
  const role = ROLE_LABELS[encounter.role];
  return {
    anchorId: encounter.anchorId,
    role: encounter.role,
    opponent: {
      name: avatarCharacter ? avatar.name : (speakerName ?? role),
      epithet: avatarCharacter ? avatar.title : role,
      characterId: encounter.characterId,
    },
    avatar: {
      id: avatar.id,
      name: avatar.name,
      title: avatar.title,
      ability: avatarCharacter ? avatar.renderedText : null,
      abilityActive: encounter.abilityActive,
    },
    tier: encounter.tier,
    scoreToWin: encounter.scoreToWin,
    signatureCards: encounter.signatureCardIds.flatMap((cardId) => {
      const card = view(cardId);
      return card === null ? [] : [card];
    }),
    playerAnte: view(anteCopy?.cardId),
    opponentAnte: view(encounter.opponentAnteCardId),
    extraEssence: encounter.extra?.amount ?? null,
  };
}

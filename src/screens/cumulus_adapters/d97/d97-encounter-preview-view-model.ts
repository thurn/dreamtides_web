// The pure view-model builder for the D97 encounter preview: resolves the
// stored encounter's UUIDs (Avatar, signature cards, antes) to display data
// at the render boundary.

import type { D97EncounterPreviewView, D97PreviewCardView } from "../../../cumulus/screens/d97/D97EncounterPreview";
import { findCopy } from "../../../d97/collection/collection";
import type { D97Encounter, D97Run } from "../../../rules/d97/d97-state";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { AvatarContent } from "../../../types/content";

/** The preview of `encounter`, or null when its Avatar is not in the roster. */
export function buildD97EncounterPreviewView(
  run: D97Run,
  encounter: D97Encounter,
  avatars: readonly AvatarContent[],
  cardsById: ReadonlyMap<CardId, CardData>,
): D97EncounterPreviewView | null {
  const avatar = avatars.find((candidate) => candidate.id === encounter.avatarId);
  if (avatar === undefined) return null;
  const view = (cardId: CardId | null | undefined): D97PreviewCardView | null => {
    const card = cardId === null || cardId === undefined ? undefined : cardsById.get(cardId);
    return card === undefined ? null : { cardId: card.id, model: { cardId: card.id, displaySnapshot: card } };
  };
  const anteCopy = encounter.playerAnteCopyId === null ? null : findCopy(run.collection, encounter.playerAnteCopyId);
  return {
    anchorId: encounter.anchorId,
    role: encounter.role,
    avatar: {
      id: avatar.id,
      name: avatar.name,
      title: avatar.title,
      ability: encounter.kind === "avatar" ? avatar.renderedText : null,
      abilityActive: encounter.abilityActive,
    },
    tier: encounter.tier,
    scoreToWin: encounter.scoreToWin,
    headStarts: encounter.headStarts,
    signatureCards: encounter.signatureCardIds.flatMap((cardId) => {
      const card = view(cardId);
      return card === null ? [] : [card];
    }),
    playerAnte: view(anteCopy?.cardId),
    opponentAnte: view(encounter.opponentAnteCardId),
    extraEssence: encounter.extra?.amount ?? null,
  };
}

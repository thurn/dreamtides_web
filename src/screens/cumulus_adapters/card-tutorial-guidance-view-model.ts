import type { BattleTutorialGuidanceView } from "../../cumulus/screens/BattleTutorialGuidance";
import type { CardTutorialGuidancePresentation } from "../../rules/card-tutorial-guidance";
import type { CardData } from "../../types/cards";

/** Map one shared site-card tutorial to stationary inline Mira guidance. */
export function buildCardTutorialGuidanceView(
  presentation: CardTutorialGuidancePresentation | null | undefined,
  cardDatabase: ReadonlyMap<number, CardData>,
): BattleTutorialGuidanceView | null {
  if (presentation == null) return null;
  const card = [...cardDatabase.values()].find(
    (candidate) => candidate.id === presentation.cardId,
  );
  if (card === undefined) return null;
  return {
    presentationId: presentation.id,
    triggerId: presentation.triggerId,
    messageIndex: 0,
    messageCount: 1,
    duration: presentation.duration,
    dialogue: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text: presentation.text,
    },
    horizontalOffset: presentation.horizontalOffset,
    verticalOffset: presentation.verticalOffset,
    bubbleWidth: presentation.bubbleWidth,
    source: {
      kind: "journey-card",
      cardId: card.id,
      model: { cardId: card.id, displaySnapshot: card },
    },
  };
}

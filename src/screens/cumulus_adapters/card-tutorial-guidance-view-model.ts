import type { BattleTutorialGuidanceView } from "../../cumulus/screens/BattleTutorialGuidance";
import type { CardTutorialGuidancePresentation } from "../../rules/card-tutorial-guidance";
import type { CardData } from "../../types/cards";
import { tx } from "@trox/runtime";
import { localizedSourceText } from "../../runtime/localization/runtime";

/** Map one shared site-card tutorial to stationary inline Mira guidance. */
export function buildCardTutorialGuidanceView(
  presentation: CardTutorialGuidancePresentation | null | undefined,
  cardDatabase: ReadonlyMap<number, CardData>,
): BattleTutorialGuidanceView | null {
  if (presentation == null) return null;
  const card = presentation.cardId === null
    ? null
    : [...cardDatabase.values()].find(
        (candidate) => candidate.id === presentation.cardId,
      ) ?? null;
  if (presentation.cardId !== null && card === null) return null;
  return {
    presentationId: presentation.id,
    triggerId: presentation.triggerId,
    messageIndex: 0,
    messageCount: 1,
    delay: presentation.delay ?? 0,
    duration: presentation.duration,
    dialogue: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: tx("Mira", "[tutorial] Name of the tutorial guide."),
      speakerName: tx("Mira", "[tutorial] Name of the tutorial guide."),
      text: localizedSourceText(presentation.text),
    },
    horizontalOffset: presentation.horizontalOffset,
    verticalOffset: presentation.verticalOffset,
    bubbleWidth: presentation.bubbleWidth,
    source: card === null
      ? { kind: "journey-site" }
      : {
          kind: "journey-card",
          cardId: card.id,
          model: { cardId: card.id, displaySnapshot: card },
        },
  };
}

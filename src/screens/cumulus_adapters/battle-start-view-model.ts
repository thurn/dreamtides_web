import {
  opponentAbilityIsActive,
} from "../../battle/integration/opponent-deck";
import type { BattleInit } from "../../battle/types";
import type { CardData } from "../../types/cards";
import type { TutorialBattleStartConfiguration } from "../../types/tutorial";
import { artRef } from "../../cumulus/primitives/art";
import type { BattleStartView } from "../../cumulus/screens/BattleStartScreen";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";

export type BattleStartInit = BattleInit;

export interface BattleStartTutorialContext {
  readonly isTutorialJourney: boolean;
  readonly configuration?: TutorialBattleStartConfiguration;
}

export function buildBattleStartView(
  init: BattleInit,
  cardDatabase: ReadonlyMap<number, CardData>,
  tutorial?: BattleStartTutorialContext,
): BattleStartView {
  const enemy = init.enemyDescriptor;
  const node =
    init.dreamscapeId !== null
      ? init.atlasSnapshot.nodes[init.dreamscapeId]
      : undefined;
  return {
    battleId: init.battleId,
    scene:
      node?.dreamscapeId !== null && node?.dreamscapeId !== undefined
        ? artRef.dreamscapeScene(node.dreamscapeId)
        : null,
    dreamAvatar: {
      id: enemy.id,
      name: enemy.name,
      title: enemy.subtitle,
      imageNumber: enemy.imageNumber ?? "001",
      ability: enemy.abilityText.trim(),
      abilityActive: opponentAbilityIsActive(init.completionLevelAtStart),
    },
    dreamsigns: (enemy.dreamsigns ?? []).flatMap((dreamsign) =>
      dreamsign.id === undefined ? [] : [{ ...dreamsign, id: dreamsign.id }],
    ),
    signatureCards: (enemy.signatureCards ?? []).flatMap((summary) => {
      const card = cardDatabase.get(summary.cardNumber);
      return card === undefined
        ? []
        : [
            {
              cardId: card.id,
              model: { cardId: card.id, displaySnapshot: card },
            },
          ];
    }),
    pointsToWin: init.scoreToWin,
    essenceReward: init.essenceReward,
    ...(tutorial?.isTutorialJourney === true &&
    init.completionLevelAtStart === 1 &&
    tutorial.configuration !== undefined
      ? {
          guideDialogue: {
            id: `${init.battleId}:second-battle-start-guidance`,
            model: {
              portrait: {
                kind: "character-portrait" as const,
                characterId: "mira",
              },
              portraitAlt: "Mira",
              speakerName: "Mira",
              text: tutorial.configuration.speechBubble.text,
            },
            delaySeconds: tutorialSpeechBubbleDelaySeconds(
              tutorial.configuration.speechBubble,
            ),
            horizontalOffset:
              tutorial.configuration.speechBubble.horizontalOffset,
            verticalOffset:
              tutorial.configuration.speechBubble.verticalOffset,
            bubbleWidth: tutorial.configuration.speechBubble.bubbleWidth,
          },
        }
      : {}),
  };
}

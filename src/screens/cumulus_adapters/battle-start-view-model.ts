import type { BattleInit } from "../../battle/types";
import type { CardData } from "../../types/cards";
import type { TutorialBattleStartConfiguration } from "../../types/tutorial";
import { artRef } from "../../cumulus/primitives/art";
import type { BattleStartView } from "../../cumulus/screens/BattleStartScreen";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";
import { localizedSourceText } from "../../runtime/localization/runtime";
import { tx } from "@trox/runtime";
import { localizedDreamsign } from "../../cumulus/components/hud/localized-dreamsign";

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
  const battleStartGuidance =
    tutorial?.isTutorialJourney === true
      ? init.completionLevelAtStart === 0
        ? tutorial.configuration?.firstBattle
        : init.completionLevelAtStart === 1
          ? tutorial.configuration?.secondBattle
          : undefined
      : undefined;
  const battleOrdinal =
    init.completionLevelAtStart === 0
      ? "first"
      : init.completionLevelAtStart === 1
        ? "second"
        : undefined;
  return {
    battleId: init.battleId,
    scene:
      node?.dreamscapeId !== null && node?.dreamscapeId !== undefined
        ? artRef.dreamscapeScene(node.dreamscapeId)
        : null,
    dreamAvatar: {
      id: enemy.id,
      name: localizedSourceText(enemy.name),
      title: localizedSourceText(enemy.subtitle),
      imageNumber: enemy.imageNumber ?? "001",
      ability: localizedSourceText(enemy.abilityText.trim()),
      abilityActive: init.opponentAbilityActive,
    },
    dreamsigns: (enemy.dreamsigns ?? []).flatMap((dreamsign) =>
      dreamsign.id === undefined
        ? []
        : [localizedDreamsign(dreamsign, "Battle start")],
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
    ...(battleStartGuidance !== undefined && battleOrdinal !== undefined
      ? {
          guideDialogue: {
            id: `${init.battleId}:${battleOrdinal}-battle-start-guidance`,
            model: {
              portrait: {
                kind: "character-portrait" as const,
                characterId: "mira",
              },
              portraitAlt: tx("Mira", "[tutorial] Name of the tutorial guide."),
              speakerName: tx("Mira", "[tutorial] Name of the tutorial guide."),
              text: localizedSourceText(
                battleStartGuidance.speechBubble.text,
              ),
            },
            delaySeconds: tutorialSpeechBubbleDelaySeconds(
              battleStartGuidance.speechBubble,
            ),
            horizontalOffset: battleStartGuidance.speechBubble.horizontalOffset,
            verticalOffset: battleStartGuidance.speechBubble.verticalOffset,
            bubbleWidth: battleStartGuidance.speechBubble.bubbleWidth,
          },
        }
      : {}),
  };
}

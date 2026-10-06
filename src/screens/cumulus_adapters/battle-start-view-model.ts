import type { BattleInit } from "../../battle/types";
import type { CardData } from "../../types/cards";
import type { TutorialBattleStartConfiguration } from "../../types/tutorial";
import type { DreamscapeArtCatalog } from "../../data/dreamscapes";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import type { BattleStartView } from "../../cumulus/screens/BattleStartScreen";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";
import { toDreamsignView } from "../../cumulus/components/hud/dreamsign-view";
import { parsePresentationId } from "../../types/identifiers";

export type BattleStartInit = BattleInit;

export interface BattleStartTutorialContext {
  readonly isTutorialJourney: boolean;
  readonly configuration?: TutorialBattleStartConfiguration;
}

export function buildBattleStartView(
  init: BattleInit,
  cardDatabase: ReadonlyMap<number, CardData>,
  artCatalog: DreamscapeArtCatalog,
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
    scene: dreamscapeSceneRef(node ?? null, artCatalog),
    avatar: {
      id: enemy.id,
      name: enemy.name,
      title: enemy.subtitle,
      imageNumber: enemy.imageNumber ?? "001",
      ability: enemy.abilityText.trim(),
      abilityActive: init.opponentAbilityActive,
    },
    dreamsigns: (enemy.dreamsigns ?? []).map((dreamsign) =>
      toDreamsignView(dreamsign),
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
            id: parsePresentationId(
              `${init.battleId}:${battleOrdinal}-battle-start-guidance`,
            ),
            model: {
              portrait: {
                kind: "character-portrait" as const,
                characterId: "mira",
              },
              portraitAlt: "Mira",
              speakerName: "Mira",
              text: battleStartGuidance.speechBubble.text,
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

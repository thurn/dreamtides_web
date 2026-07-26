import { battleGameCardModel } from "../../battle/ui/battle-game-card-model";
import type { TutorialBattleControllerPlan } from "../../battle/tutorial-battle-controller";
import type { BattleFoldState } from "../../rules/battle/fold";
import type { TutorialBattleView } from "../../cumulus/screens/TutorialBattleScreen";
import { buildMobileBattleView } from "./mobile-battle-view-model";

export function buildTutorialBattleView(
  battle: BattleFoldState,
  controller: TutorialBattleControllerPlan,
  confirmedPromptId: number | null,
): TutorialBattleView {
  const mobile = buildMobileBattleView(
    battle.init,
    battle.board,
    {
      id: battle.init.enemyDescriptor.id,
      imageNumber: battle.init.enemyDescriptor.imageNumber ?? "001",
      name: battle.init.enemyDescriptor.name,
      renderedText: battle.init.enemyDescriptor.abilityText,
      title: battle.init.enemyDescriptor.subtitle,
    },
    null,
    {
      aiMode: false,
      isOpponentHandRevealed: false,
      isPlayerHandHidden: false,
      pendingPrompt: battle.pendingPrompt,
      confirmedPromptId,
    },
  );
  const prompt = battle.pendingPrompt;
  const presentation = battle.tutorialPresentation ?? null;
  const confirmedHumanPrompt = controller.status === "driver" &&
    controller.isCurrentClientDriver &&
    controller.requiresHumanDecision &&
    prompt !== null &&
    confirmedPromptId === prompt.promptId;
  return {
    battle: { ...mobile, result: null },
    ownership: controller.status === "not-tutorial" ? "observer" : controller.status,
    driverClientId: controller.driverClientId,
    manualControls: controller.status === "driver" && controller.isCurrentClientDriver && controller.requiresHumanDecision,
    foresee:
      confirmedHumanPrompt && prompt.options.kind === "foresee"
        ? {
            initialCount: prompt.options.count,
            cards: prompt.options.cardIds.flatMap((battleCardId) => {
              const card = battle.board.cardInstances[battleCardId];
              return card === undefined
                ? []
                : [{ battleCardId, model: battleGameCardModel(card) }];
            }),
          }
        : null,
    presentation:
      presentation?.kind === "opponent-play"
        ? (() => {
            const card = battle.board.cardInstances[presentation.battleCardId];
            return card === undefined || card.definition.cardId !== presentation.cardId
              ? null
              : {
                  kind: presentation.kind,
                  cardId: presentation.cardId,
                  battleCardId: presentation.battleCardId,
                  cardKind: presentation.cardKind,
                  model: battleGameCardModel(card),
                };
          })()
        : null,
    victorySummary:
      battle.board.result === "victory" && controller.status === "terminal" && controller.isCurrentClientDriver && controller.isDriverPresent
        ? `You reached ${String(battle.board.sides.player.score)} ⍟.`
        : null,
    terminalRestartAvailable: controller.status === "terminal" && !controller.isDriverPresent,
  };
}

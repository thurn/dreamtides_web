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
  return {
    battle: { ...mobile, result: null },
    ownership: controller.status === "not-tutorial" ? "observer" : controller.status,
    driverClientId: controller.driverClientId,
    manualControls: controller.status === "driver" && controller.requiresHumanDecision,
    foresee:
      prompt?.options.kind === "foresee"
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
    victorySummary:
      battle.board.result === "victory" && controller.status === "terminal" && controller.driverClientId !== null
        ? `You reached ${String(battle.board.sides.player.score)} ⍟.`
        : null,
  };
}

import { battleGameCardModel } from "../../battle/ui/battle-game-card-model";
import { dreamwellCardModel } from "../../battle/ui/dreamwell-card-model";
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
  const dreamwellPromptSource = prompt === null
    ? null
    : mobile.dreamwell?.model ?? null;
  const confirmedHumanPrompt = controller.status === "driver" &&
    controller.isCurrentClientDriver &&
    controller.requiresHumanDecision &&
    prompt !== null &&
    confirmedPromptId === prompt.promptId;
  return {
    battle: {
      ...mobile,
      result: null,
      ...(dreamwellPromptSource === null
        ? {}
        : {
            cardPicker: mobile.cardPicker === null
              ? null
              : {
                  ...mobile.cardPicker,
                  label: `${mobile.cardPicker.label} — ${dreamwellPromptSource.displaySnapshot.name}`,
                },
            choicePrompt: mobile.choicePrompt === null
              ? null
              : {
                  ...mobile.choicePrompt,
                  label: `${mobile.choicePrompt.label} — ${dreamwellPromptSource.displaySnapshot.name}`,
                },
          }),
    },
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
    dreamwellPromptSource,
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
        : presentation?.kind === "dreamwell-reveal"
          ? (() => {
              const definition = battle.init.dreamwellDeck.find(
                (candidate) => candidate.id === presentation.cardId,
              );
              return definition === undefined
                ? null
                : {
                    kind: presentation.kind,
                    cardId: presentation.cardId,
                    side: presentation.side,
                    model: dreamwellCardModel(definition),
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

import { useCallback, useEffect, useMemo } from "react";
import { useTutorialBattleController } from "../../state/use-tutorial-battle-controller";
import { useTutorialBattleInteractions } from "../../state/use-tutorial-battle-interactions";
import { TutorialBattleScreen } from "../../cumulus/screens/TutorialBattleScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import { buildTutorialBattleView } from "./tutorial-battle-view-model";
import { useBattleTutorialGuidance } from "../../state/use-battle-tutorial-guidance";
import { buildBattleTutorialGuidanceView } from "./battle-tutorial-guidance-view-model";
import type { BattlefieldDividerVariation } from "../../runtime/runtime-config";

/** Live, controller-owned continuation of the standalone tutorial handoff. */
export function TutorialBattleScreenAdapter({
  previewVictory = false,
  battlefieldDividerVariation = "space",
}: {
  readonly previewVictory?: boolean;
  readonly battlefieldDividerVariation?: BattlefieldDividerVariation;
}) {
  const { battle: contextBattle, mutations } = useFrontDoor();
  const battle = contextBattle ?? null;
  const controller = useTutorialBattleController({ paused: previewVictory });
  const guidanceController = useBattleTutorialGuidance();
  const {
    interactions,
    confirmedPromptId,
    movementStatusMessage,
    dismissMovementStatus,
    resolvePrompt,
  } = useTutorialBattleInteractions(controller);
  const view = useMemo(
    () =>
      battle === null
        ? null
        : buildTutorialBattleView(
            battle,
            controller,
            confirmedPromptId,
            previewVictory,
          ),
    [battle, confirmedPromptId, controller, previewVictory],
  );
  const guidance = useMemo(
    () => (battle === null ? null : buildBattleTutorialGuidanceView(battle)),
    [battle],
  );
  const battleId = view?.battle.battleId ?? null;
  useEffect(() => {
    if (battleId === null) return;
    logEvent("battlefield_divider_rendered", {
      battleId,
      surface: "tutorial-battle",
      variation: battlefieldDividerVariation,
    });
  }, [battleId, battlefieldDividerVariation]);
  const startNewJourney = useCallback(() => {
    const completedVictory =
      battle?.board.result === "victory" && controller.status === "terminal";
    if (
      battle === null ||
      (!completedVictory && !previewVictory) ||
      !controller.isCurrentClientDriver ||
      !controller.isDriverPresent
    ) {
      return;
    }
    logEvent("tutorial_battle_new_journey_requested", {
      battleId: battle.board.battleId,
      playerScore: battle.board.sides.player.score,
      previewVictory,
    });
    const exitBattle = mutations.exitTutorialBattle;
    if (exitBattle === undefined) return;
    void exitBattle(battle.board.battleId).catch(() => undefined);
  }, [
    battle,
    controller.isCurrentClientDriver,
    controller.isDriverPresent,
    controller.status,
    mutations.exitTutorialBattle,
    previewVictory,
  ]);
  if (view === null) return null;
  return (
    <TutorialBattleScreen
      view={view}
      interactions={interactions}
      battlefieldDividerVariation={battlefieldDividerVariation}
      movementStatusMessage={movementStatusMessage}
      onMovementStatusDismiss={dismissMovementStatus}
      onForeseeConfirm={(resolution) =>
        resolvePrompt({
          kind: "foresee",
          viewedCardIds: [...resolution.viewedCardIds],
          orderedCardIds: [...resolution.orderedCardIds],
          voidCardIds: [...resolution.voidCardIds],
        })
      }
      onNewJourney={startNewJourney}
      guidance={guidance}
      onGuidanceContinue={guidanceController.advance}
      onGuidanceDurationComplete={guidanceController.completeDuration}
      onPresentationVisible={controller.onPresentationVisible}
    />
  );
}

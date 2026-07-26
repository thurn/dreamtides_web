import { useCallback, useMemo } from "react";
import { useTutorialBattleController } from "../../state/use-tutorial-battle-controller";
import { useTutorialBattleInteractions } from "../../state/use-tutorial-battle-interactions";
import { TutorialBattleScreen } from "../../cumulus/screens/TutorialBattleScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import { buildTutorialBattleView } from "./tutorial-battle-view-model";

/** Live, controller-owned continuation of the standalone tutorial handoff. */
export function TutorialBattleScreenAdapter() {
  const { battle: contextBattle, mutations } = useFrontDoor();
  const battle = contextBattle ?? null;
  const controller = useTutorialBattleController();
  const {
    interactions,
    confirmedPromptId,
    movementStatusMessage,
    dismissMovementStatus,
    resolvePrompt,
  } =
    useTutorialBattleInteractions(controller);
  const view = useMemo(
    () => battle === null ? null : buildTutorialBattleView(battle, controller, confirmedPromptId),
    [battle, confirmedPromptId, controller],
  );
  const restart = useCallback(() => {
    if (battle === null || controller.driverClientId === null ||
      (controller.status !== "paused-driver-absent" && !(controller.status === "terminal" && !controller.isDriverPresent))) return;
    logEvent("tutorial_battle_restart_requested", {
      battleId: battle.board.battleId,
      previousDriverClientId: controller.driverClientId,
    });
    const restartBattle = mutations.restartTutorialBattle;
    if (restartBattle === undefined) return;
    void restartBattle(
      battle.board.battleId,
      controller.driverClientId,
    ).catch(() => undefined);
  }, [battle, controller.driverClientId, controller.isDriverPresent, controller.status, mutations.restartTutorialBattle]);
  const exit = useCallback(() => {
    if (battle === null || battle.board.result !== "victory" || controller.status !== "terminal" || !controller.isCurrentClientDriver || !controller.isDriverPresent) return;
    logEvent("tutorial_battle_return_to_main_menu_requested", {
      battleId: battle.board.battleId,
      playerScore: battle.board.sides.player.score,
    });
    const exitBattle = mutations.exitTutorialBattle;
    if (exitBattle === undefined) return;
    void exitBattle(battle.board.battleId).catch(() => undefined);
  }, [battle, controller.isCurrentClientDriver, controller.isDriverPresent, controller.status, mutations.exitTutorialBattle]);
  if (view === null) return null;
  return (
    <TutorialBattleScreen
      view={view}
      interactions={interactions}
      movementStatusMessage={movementStatusMessage}
      onMovementStatusDismiss={dismissMovementStatus}
      onForeseeConfirm={(resolution) => resolvePrompt({
        kind: "foresee",
        viewedCardIds: [...resolution.viewedCardIds],
        orderedCardIds: [...resolution.orderedCardIds],
        voidCardIds: [...resolution.voidCardIds],
      })}
      onRestart={restart}
      onReturnToMainMenu={exit}
    />
  );
}

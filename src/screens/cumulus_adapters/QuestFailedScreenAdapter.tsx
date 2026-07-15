import { useCallback, useEffect, useMemo } from "react";
import { QuestFailedScreen } from "../../cumulus/screens/QuestFailedScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useQuest } from "../../state/quest-context";
import { buildQuestFailedView } from "./quest-failed-view-model";

export function QuestFailedScreenAdapter() {
  const { state, mutations } = useQuest();
  const summary = state.failureSummary;
  const view = useMemo(() => buildQuestFailedView(state), [state]);

  useEffect(() => {
    if (summary === null) return;
    logEventOnce(
      `quest_failed_screen_shown:${summary.battleId}`,
      "quest_failed_screen_shown",
      {
        battleId: summary.battleId,
        result: summary.result,
        reason: summary.reason,
        siteId: summary.siteId,
        dreamscapeIdOrNone: summary.dreamscapeIdOrNone,
        turnNumber: summary.turnNumber,
        playerScore: summary.playerScore,
        enemyScore: summary.enemyScore,
        uiVariant: "cumulus",
      },
    );
  }, [summary]);

  const handleNewQuest = useCallback(() => {
    if (summary === null) return;
    logEvent("quest_failed_start_new_run", {
      battleId: summary.battleId,
      result: summary.result,
      uiVariant: "cumulus",
    });
    mutations.resetQuest();
  }, [mutations, summary]);

  return <QuestFailedScreen view={view} onNewQuest={handleNewQuest} />;
}

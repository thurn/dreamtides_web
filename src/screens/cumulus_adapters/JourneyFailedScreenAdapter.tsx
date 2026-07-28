import { useCallback, useEffect, useMemo } from "react";
import { JourneyFailedScreen } from "../../cumulus/screens/JourneyFailedScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { buildJourneyFailedView } from "./journey-failed-view-model";

export function JourneyFailedScreenAdapter() {
  const { state, mutations } = useJourney();
  const summary = state.failureSummary;
  const view = useMemo(() => buildJourneyFailedView(state), [state]);

  useEffect(() => {
    if (summary === null) return;
    logEventOnce(
      `journey_failed_screen_shown:${summary.battleId}`,
      "journey_failed_screen_shown",
      {
        battleId: summary.battleId,
        result: summary.result,
        reason: summary.reason,
        siteId: summary.siteId,
        dreamscapeIdOrNone: summary.dreamscapeIdOrNone,
        turnNumber: summary.turnNumber,
        playerScore: summary.playerScore,
        enemyScore: summary.enemyScore,
      },
    );
  }, [summary]);

  const handleNewJourney = useCallback(() => {
    if (summary === null) return;
    logEvent("journey_failed_start_new_run", {
      battleId: summary.battleId,
      result: summary.result,
    });
    mutations.resetJourney();
  }, [mutations, summary]);

  return <JourneyFailedScreen view={view} onNewJourney={handleNewJourney} />;
}

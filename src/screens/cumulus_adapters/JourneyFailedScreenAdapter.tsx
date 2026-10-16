import { useCallback, useEffect, useMemo } from "react";
import { JourneyFailedScreen } from "../../cumulus/screens/JourneyFailedScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { buildJourneyFailedView } from "./journey-failed-view-model";

export function JourneyFailedScreenAdapter() {
  const { state, mutations } = useJourney();
  const summary = state.failureSummary;
  const draw = state.journeyDraw;
  const view = useMemo(() => buildJourneyFailedView(state), [state]);

  useEffect(() => {
    if (draw !== undefined) {
      logEventOnce(`journey_draw_screen_shown:${state.runId ?? "unscoped"}:${String(draw.committedSeq)}:${String(draw.cause.ordinal)}`, "journey_failed_screen_shown", { result: draw.result, reason: "mandatory_journey_loop", cause: draw.cause, committedSeq: draw.committedSeq });
      return;
    }
    if (summary === null) return;
    logEventOnce(
      `journey_failed_screen_shown:${summary.battleId}`,
      "journey_failed_screen_shown",
      {
        battleId: summary.battleId,
        result: summary.result,
        reason: summary.reason,
        siteId: summary.siteId,
        dreamscapeIdOrNone: summary.nodeIdOrNone,
        turnNumber: summary.turnNumber,
        playerScore: summary.playerScore,
        enemyScore: summary.enemyScore,
      },
    );
  }, [draw, state.runId, summary]);

  const handleNewJourney = useCallback(() => {
    if (draw !== undefined) {
      logEvent("journey_failed_start_new_run", { result: draw.result, cause: draw.cause, committedSeq: draw.committedSeq });
      mutations.resetJourney();
      return;
    }
    if (summary === null) return;
    logEvent("journey_failed_start_new_run", {
      battleId: summary.battleId,
      result: summary.result,
    });
    mutations.resetJourney();
  }, [draw, mutations, summary]);

  return <JourneyFailedScreen view={view} onNewJourney={handleNewJourney} />;
}

import { useCallback, useEffect, useMemo, useRef } from "react";
import { JourneyCompleteScreen } from "../../cumulus/screens/JourneyCompleteScreen";
import { logEvent } from "../../logging";
import { useJourney } from "../../state/journey-context";
import {
  buildJourneyCompleteCardIds,
  buildJourneyCompleteView,
} from "./journey-complete-view-model";

export function JourneyCompleteScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const hasLoggedRef = useRef(false);
  const view = useMemo(() => buildJourneyCompleteView(state), [state]);
  const cardIds = useMemo(
    () => buildJourneyCompleteCardIds(state.deck, journeyContent.cardDatabase),
    [state.deck, journeyContent.cardDatabase],
  );

  useEffect(() => {
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;
    logEvent("journey_completed", {
      runId: state.runId,
      avatarId: state.avatar?.id ?? null,
      battlesWon: state.completionLevel,
      completedDreamscapeIds: Object.values(state.atlas.nodes)
        .filter((node) => node.state === "completed")
        .map((node) => node.id),
      deckEntryIds: state.deck.map((entry) => entry.entryId),
      cardIds,
      essenceRemaining: state.essence,
      dreamsignIds: state.dreamsigns.flatMap((dreamsign) =>
        dreamsign.id === undefined ? [] : [dreamsign.id],
      ),
    });
  }, [cardIds, state]);

  const handleNewJourney = useCallback(() => {
    logEvent("journey_complete_new_journey_clicked", {});
    mutations.resetJourney();
  }, [mutations]);
  return <JourneyCompleteScreen view={view} onNewJourney={handleNewJourney} />;
}

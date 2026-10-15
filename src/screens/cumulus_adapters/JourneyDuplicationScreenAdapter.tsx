import { useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { JourneyDuplicationScreen } from "../../cumulus/screens/JourneyDuplicationScreen";
import { buildJourneyDuplicationView } from "./journey-duplication-view-model";

/** Wire one exact earned permission to an ordinary intent. */
export function JourneyDuplicationScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const view = useMemo(() => buildJourneyDuplicationView(state, journeyContent), [state, journeyContent]);
  if (view === null) return null;
  return <JourneyDuplicationScreen key={`${view.siteId}:${String(view.heldIndex)}:${String(view.choiceIndex)}:${String(view.earnedSeq)}`}
    view={view} onConfirm={(entryId) => mutations.resolveJourneyDuplication(view.siteId, view.dreamsignId,
      view.heldIndex, view.choiceIndex, view.earnedSeq, entryId)} />;
}

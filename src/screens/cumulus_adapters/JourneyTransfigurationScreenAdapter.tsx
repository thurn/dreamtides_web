import { useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { JourneyTransfigurationScreen } from "../../cumulus/screens/JourneyTransfigurationScreen";
import { buildJourneyTransfigurationView } from "./journey-transfiguration-view-model";

export function JourneyTransfigurationScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const view = useMemo(() => buildJourneyTransfigurationView(state, journeyContent), [state, journeyContent]);
  if (view === null) return null;
  return <JourneyTransfigurationScreen key={`${view.siteId}:${String(view.heldIndex)}:${String(view.choiceIndex)}`}
    view={view} onConfirm={(ids) => mutations.resolveJourneyTransfiguration(view.siteId, view.dreamsignId, view.heldIndex, view.choiceIndex, ids)} />;
}

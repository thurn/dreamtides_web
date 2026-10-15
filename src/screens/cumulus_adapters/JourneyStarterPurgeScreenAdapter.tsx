import { useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { JourneyStarterPurgeScreen } from "../../cumulus/screens/JourneyStarterPurgeScreen";
import { buildJourneyStarterPurgeView } from "./journey-starter-purge-view-model";
export function JourneyStarterPurgeScreenAdapter() {
  const { state, journeyContent, mutations } = useJourney();
  const view = useMemo(() => buildJourneyStarterPurgeView(state, journeyContent), [state, journeyContent]);
  if (view === null) return null;
  return <JourneyStarterPurgeScreen view={view} onConfirm={(ids) => mutations.resolveStarterPurge(view.dreamsignId, view.heldIndex, view.choiceIndex, view.permissionSeq, ids)} />;
}

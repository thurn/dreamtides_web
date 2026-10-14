import { useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { JourneyDreamsignScreen } from "../../cumulus/screens/JourneyDreamsignScreen";
import { buildJourneyDreamsignView } from "./journey-dreamsign-view-model";
export function JourneyDreamsignScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const view = useMemo(() => buildJourneyDreamsignView(state, journeyContent), [state, journeyContent]);
  if (view === null) return null;
  return <JourneyDreamsignScreen key={`${view.sourceDreamsignId}:${view.permissionSeq}:${view.choiceIndex}`} view={view}
    onCopy={(index, id) => mutations.resolveDreamsignCopy(view.sourceDreamsignId, view.heldIndex, view.choiceIndex, view.permissionSeq, index, id)}
    onOffer={(id, purgeIndex) => { if (view.siteId !== null) mutations.resolveAfterBattleDreamsign(view.siteId, view.sourceDreamsignId, view.heldIndex, view.choiceIndex, view.permissionSeq, id, purgeIndex); }} />;
}

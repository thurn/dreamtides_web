import { useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { JourneyOpeningHandScreen } from "../../cumulus/screens/JourneyOpeningHandScreen";
import { buildJourneyOpeningHandView } from "./journey-opening-hand-view-model";
import { JourneyDreamsignScreen } from "../../cumulus/screens/JourneyDreamsignScreen";
import { buildJourneyDreamsignView } from "./journey-dreamsign-view-model";
export function JourneyDreamsignScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const view = useMemo(() => buildJourneyDreamsignView(state, journeyContent), [state, journeyContent]);
  const openingView = useMemo(() => {
    if (state.screen.type !== "journeyDreamsign" || state.screen.choice.kind !== "openingHand") return null;
    const choice = state.screen.choice, source = choice.sources[choice.index];
    return source === undefined ? null : buildJourneyOpeningHandView(state, journeyContent, {
      dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq,
    });
  }, [state, journeyContent]);
  if (openingView !== null) return <JourneyOpeningHandScreen view={openingView} onConfirm={(entryId) =>
    mutations.resolveOpeningHandEntry(openingView.dreamsignId, openingView.heldIndex, openingView.choiceIndex, openingView.permissionSeq, entryId)} />;
  if (view === null) return null;
  return <JourneyDreamsignScreen key={`${view.sourceDreamsignId}:${view.permissionSeq}:${view.choiceIndex}`} view={view}
    onSubtype={subtype => mutations.resolveJourneySubtype(view.sourceDreamsignId, view.heldIndex, view.choiceIndex, view.permissionSeq, subtype)}
    onTypeRemap={subtype => mutations.resolveTypeRemap(view.sourceDreamsignId, view.heldIndex, view.choiceIndex, view.permissionSeq, subtype)}
    onCopy={(index, id) => mutations.resolveDreamsignCopy(view.sourceDreamsignId, view.heldIndex, view.choiceIndex, view.permissionSeq, index, id)}
    onOffer={(id, purgeIndex) => { if (view.siteId !== null) mutations.resolveAfterBattleDreamsign(view.siteId, view.sourceDreamsignId, view.heldIndex, view.choiceIndex, view.permissionSeq, id, purgeIndex); }} />;
}

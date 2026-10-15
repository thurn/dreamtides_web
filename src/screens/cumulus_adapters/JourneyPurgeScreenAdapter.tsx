import { useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { JourneyPurgeScreen } from "../../cumulus/screens/JourneyPurgeScreen";
import { buildJourneyPurgeView } from "./journey-purge-view-model";

/** Wire the existing player intents to the exact folded source permission. */
export function JourneyPurgeScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const view = useMemo(() => buildJourneyPurgeView(state, journeyContent), [state, journeyContent]);
  const earnedSeq = state.screen.type === "journeyPurge" && state.screen.choice.kind === "beforeBattle" ? state.screen.choice.earnedSeq : undefined;
  if (view === null) return null;
  return <JourneyPurgeScreen key={`${view.siteId}:${String(view.heldIndex)}:${String(view.choiceIndex)}:${String(earnedSeq)}`}
    view={view} onPurge={(ids) => mutations.resolveJourneyPurge(view.siteId, view.dreamsignId,
      view.heldIndex, view.choiceIndex, ids, earnedSeq)} onCollect={() => mutations.acceptEssenceSite(view.siteId)} />;
}

// Adapter bridging live journey state to the pure Cumulus draft screen
// (`src/cumulus/screens/DraftScreen`). Wiring only: it owns `useJourney()`, the
// draft-site entry intent, the pick mutation, and returning to the dreamscape
// once the pack is exhausted. Domain mapping lives in the builder
// (`draft-view-model.ts`); entering a site is a single `ENTER_DRAFT_SITE`
// intent (`src/coop/actions.ts`) folded by the reducer
// (`src/rules/journey/draft.ts`) — the reducer's optimistic echo paints the
// first offer immediately, so the adapter itself carries no local draft-state
// bootstrap.

import { useCallback, useEffect, useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { logEvent, logEventOnce } from "../../logging";
import { readDraftSiteProgress } from "../../data/draft-site-bootstrap";
import { buildDraftView } from "./draft-view-model";
import { DraftScreen } from "../../cumulus/screens/DraftScreen";

/** Live draft site screen: enters the site, builds the view-model, picks a
 * card, and completes back to the dreamscape once the pack runs out. */
export function DraftSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, cardDatabase, journeyContent } = useJourney();

  // Enter this site whenever the displayed draft state has not advanced to
  // `siteId`. The run-scoped event-log key gives every mount and connected
  // client one shared logical entry intent.
  useEffect(() => {
    if (state.draftState?.activeSiteId === siteId) return;
    mutations.enterDraftSite(siteId);
  }, [siteId, state.draftState?.activeSiteId, mutations]);

  const progress = readDraftSiteProgress(state.draftState, siteId);
  const node =
    state.currentDreamscape !== null
      ? (state.atlas.nodes[state.currentDreamscape] ?? null)
      : null;
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;

  const view = useMemo(
    () =>
      buildDraftView({
        offerCardNumbers: progress.offerCardNumbers,
        cardDatabase,
        sceneNode: node,
        site,
        sitePicksCompleted: progress.sitePicksCompleted,
        journeyState: state,
        tutorialConfiguration: journeyContent.tutorialDraft,
      }),
    [
      progress.offerCardNumbers,
      progress.sitePicksCompleted,
      cardDatabase,
      node,
      site,
      state,
      journeyContent.tutorialDraft,
    ],
  );

  useEffect(() => {
    if (view.tutorial === undefined) return;
    logEventOnce(
      `first-visit-site-tutorial:${view.tutorial.id}`,
      "first_visit_site_tutorial_presented",
      {
        tutorialId: view.tutorial.id,
        siteId,
        siteType: "Draft",
        text: view.tutorial.model.text,
        horizontalOffset: view.tutorial.horizontalOffset,
        verticalOffset: view.tutorial.verticalOffset,
        bubbleWidth: view.tutorial.bubbleWidth,
      },
    );
  }, [siteId, view.tutorial]);

  const handlePick = useCallback(
    (cardNumber: number) => {
      mutations.pickDraftCard(siteId, cardNumber);
    },
    [mutations, siteId],
  );

  const handleReroll = useCallback(() => {
    mutations.rerollDraftOffer?.(siteId);
  }, [mutations, siteId]);

  // The pack is exhausted: log the completed draft and return to the dreamscape,
  // The COMPLETE_SITE run-scoped intent key is the durable once-only owner;
  // every client observing completion may submit this effect.
  useEffect(() => {
    if (!progress.isComplete) return;
    logEvent("draft_site_completed_ui", {
      siteId,
      picksCompleted: progress.sitePicksCompleted,
    });
    mutations.completeSite(siteId, "draft_site_completed");
  }, [progress.isComplete, progress.sitePicksCompleted, mutations, siteId]);

  if (cardDatabase.size === 0) return null;
  if (state.draftState === null) return null;
  if (progress.isComplete) return null;

  return (
    <DraftScreen view={view} onPick={handlePick} onReroll={handleReroll} />
  );
}

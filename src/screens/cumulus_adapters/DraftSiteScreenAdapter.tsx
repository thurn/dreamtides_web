// Adapter bridging live quest state to the pure Cumulus draft screen
// (`src/cumulus/screens/DraftScreen`). Wiring only: it owns `useQuest()`, the
// draft-site entry intent, the pick mutation, and returning to the dreamscape
// once the pack is exhausted. Domain mapping lives in the builder
// (`draft-view-model.ts`); entering a site is a single `ENTER_DRAFT_SITE`
// intent (`src/coop/actions.ts`) folded by the reducer
// (`src/rules/quest/draft.ts`) — the reducer's optimistic echo paints the
// first offer immediately, so the adapter itself carries no local draft-state
// bootstrap.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuest } from "../../state/quest-context";
import { logEvent } from "../../logging";
import { readDraftSiteProgress } from "../../data/draft-site-bootstrap";
import { buildDraftView } from "./draft-view-model";
import { DraftScreen } from "../../cumulus/screens/DraftScreen";

/** Live draft site screen: enters the site, builds the view-model, picks a
 * card, and completes back to the dreamscape once the pack runs out. */
export function DraftSiteScreenAdapter({
  siteId,
}: {
  siteId: string;
}) {
  const { state, mutations, cardDatabase } = useQuest();
  const completedRef = useRef(false);

  // Enter this site once per visit: fire the intent whenever the displayed
  // draft state has not (yet) advanced to `siteId`. Idempotent on the
  // reducer side (ENTER_DRAFT_SITE), so a re-render before the fold catches
  // up simply re-fires a no-op intent rather than re-rolling the offer.
  useEffect(() => {
    if (state.draftState?.activeSiteId === siteId) return;
    mutations.enterDraftSite(siteId);
  }, [siteId, state.draftState?.activeSiteId, mutations]);

  const progress = readDraftSiteProgress(state.draftState, siteId);
  const node =
    state.currentDreamscape !== null
      ? state.atlas.nodes[state.currentDreamscape] ?? null
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
        state,
      }),
    [progress.offerCardNumbers, progress.sitePicksCompleted, cardDatabase, node, site, state],
  );

  const handlePick = useCallback(
    (cardNumber: number) => {
      mutations.pickDraftCard(siteId, cardNumber);
    },
    [mutations, siteId],
  );

  // The pack is exhausted: log the completed draft and return to the dreamscape,
  // guarded so it fires exactly once even as effects re-run.
  useEffect(() => {
    if (!progress.isComplete || completedRef.current) return;
    completedRef.current = true;
    logEvent("draft_site_completed_ui", {
      siteId,
      picksCompleted: progress.sitePicksCompleted,
    });
    mutations.completeSite(siteId, "draft_site_completed");
    mutations.setScreen({ type: "dreamscape" });
  }, [progress.isComplete, progress.sitePicksCompleted, mutations, siteId]);

  if (cardDatabase.size === 0) return null;
  if (state.draftState === null) return null;
  if (progress.isComplete) return null;

  return <DraftScreen view={view} onPick={handlePick} />;
}

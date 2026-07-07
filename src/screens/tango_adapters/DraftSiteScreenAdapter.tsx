// Adapter bridging live quest state to the pure Tango draft screen
// (`src/tango/screens/DraftScreen`). Wiring only: it owns `useQuest()`, the
// draft-state bootstrap for the site (minting and persisting the first offer),
// the pick mutation, and returning to the dreamscape once the pack is
// exhausted. Domain mapping lives in the builder (`draft-view-model.ts`); the
// draft-entry logic lives in `data/draft-site-bootstrap` so the legacy screen
// and this adapter enter a site the same way.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuest } from "../../state/quest-context";
import { logEvent } from "../../logging";
import {
  bootstrapLocalDraftState,
  enterDraftSiteState,
  readDraftSiteProgress,
  resolveDraftConfig,
} from "../../data/draft-site-bootstrap";
import type { DraftState } from "../../types/draft";
import { buildDraftView } from "./draft-view-model";
import { DraftScreen } from "../../tango/screens/DraftScreen";

/** Live draft site screen: enters the site, builds the view-model, picks a
 * card, and completes back to the dreamscape once the pack runs out. */
export function DraftSiteScreenAdapter({
  siteId,
  onViewDeck,
}: {
  siteId: string;
  onViewDeck?: () => void;
}) {
  const { state, mutations, cardDatabase, questContent } = useQuest();

  // A neutral dreamscape yields no bias; an affiliated one pulls the offers
  // toward its signature set.
  const draftConfig = useMemo(() => {
    const nodeId = state.currentDreamscape;
    const node = nodeId === null ? null : state.atlas.nodes[nodeId] ?? null;
    return resolveDraftConfig(
      node,
      questContent.dreamscapes,
      questContent.affiliations,
      questContent.poolContext?.poolData,
      cardDatabase,
    );
  }, [state.currentDreamscape, state.atlas, questContent.dreamscapes, questContent.affiliations, questContent.poolContext, cardDatabase]);

  // Locally-bootstrapped draft state so the first paint shows the real offer
  // before the RTDB write round-trips; cleared once the live state catches up.
  const [localDraftState, setLocalDraftState] = useState<DraftState | null>(() =>
    bootstrapLocalDraftState(
      state.draftState,
      siteId,
      cardDatabase,
      state.deck,
      questContent.fitModel,
      draftConfig,
    ),
  );
  const draftStateRef = useRef<DraftState | null>(null);
  const writtenLocalDraftStateRef = useRef<DraftState | null>(null);
  const completedRef = useRef(false);

  // Enter or resume the draft for this site, issuing the RTDB bootstrap write
  // exactly once per local-state value (a fresh entry rolls a random offer).
  useEffect(() => {
    if (cardDatabase.size === 0 || state.draftState === null) return;
    if (state.draftState.activeSiteId === siteId) {
      draftStateRef.current = state.draftState;
      if (localDraftState !== null) setLocalDraftState(null);
      writtenLocalDraftStateRef.current = null;
      return;
    }
    if (localDraftState !== null && localDraftState.activeSiteId === siteId) {
      draftStateRef.current = localDraftState;
      if (writtenLocalDraftStateRef.current !== localDraftState) {
        writtenLocalDraftStateRef.current = localDraftState;
        mutations.setDraftState(localDraftState, "draft_site_enter");
      }
      return;
    }
    const cloned = enterDraftSiteState(
      state.draftState,
      siteId,
      cardDatabase,
      state.deck,
      questContent.fitModel,
      draftConfig,
    );
    draftStateRef.current = cloned;
    setLocalDraftState(cloned);
    writtenLocalDraftStateRef.current = cloned;
    mutations.setDraftState(cloned, "draft_site_enter");
  }, [siteId, state.draftState, state.deck, cardDatabase, mutations, localDraftState, questContent.fitModel, draftConfig]);

  // Prefer the live state when it targets this site; otherwise the local bootstrap.
  const liveTargetsThisSite = state.draftState?.activeSiteId === siteId;
  const effectiveDraftState: DraftState | null = liveTargetsThisSite
    ? state.draftState
    : (localDraftState ?? state.draftState);
  const progress = readDraftSiteProgress(effectiveDraftState, siteId);
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
  if (state.draftState === null && draftStateRef.current === null) return null;
  if (progress.isComplete) return null;

  return <DraftScreen view={view} onPick={handlePick} onViewDeck={onViewDeck} />;
}

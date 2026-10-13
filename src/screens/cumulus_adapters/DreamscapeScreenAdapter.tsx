import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DreamscapeScreen } from "../../cumulus/screens/DreamscapeScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import {
  buildDreamscapeOverviewLog,
  buildDreamscapeGuidanceLog,
  buildDreamscapeView,
  dreamscapeSceneRef,
  dreamscapeTitle,
  resolveDreamscapeSiteSelection,
} from "./dreamscape-view-model";
import {
  resolveInlineReward,
  resolveEnhancedRewardChoice,
  resolveRewardDecline,
  resolveRewardReplacement,
} from "./inline-reward-view-model";
import type { SiteId } from "../../types/identifiers";
import type { DreamsignId } from "../../types/identifiers";

/** Wires the live journey fold to the pure Cumulus Dreamscape screen. */
export function DreamscapeScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const node =
    state.currentDreamscape === null
      ? undefined
      : state.atlas.nodes[state.currentDreamscape];
  const [replacementSiteId, setReplacementSiteId] = useState<SiteId | null>(
    null,
  );
  const [selectedRewardChoice, setSelectedRewardChoice] = useState<{
    siteId: SiteId; dreamsignId: DreamsignId;
  } | null>(null);
  const view = useMemo(
    () =>
      node === undefined
        ? null
        : buildDreamscapeView(
            node,
            dreamscapeTitle(node, journeyContent),
            dreamscapeSceneRef(node, journeyContent),
            state,
            journeyContent.sitesData,
            journeyContent.draftData.offers.picksPerSite,
            replacementSiteId,
            journeyContent.tutorial.dreamscape,
            undefined,
            selectedRewardChoice,
          ),
    [
      journeyContent.sitesData,
      journeyContent,
      journeyContent.tutorial.dreamscape,
      journeyContent.draftData.offers.picksPerSite,
      node,
      replacementSiteId,
      selectedRewardChoice,
      state,
    ],
  );
  const loggedNodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      node === undefined ||
      view === null ||
      loggedNodeRef.current === node.id
    )
      return;
    loggedNodeRef.current = node.id;
    logEvent(
      "dreamscape_overview_presented",
      buildDreamscapeOverviewLog(node, view, state),
    );
  }, [node, state, view]);

  const handleSelectSite = useCallback(
    (siteId: SiteId) => {
      if (node === undefined) return;
      const selection = resolveDreamscapeSiteSelection(
        node,
        siteId,
        state,
      );
      if (selection === null) return;
      logEvent("site_entered", selection.fields);
      if (selection.site.type === "Essence") {
        if (state.siteRuntime[siteId] === undefined) {
          mutations.ensureEssenceSiteRuntime(siteId, selection.site.isEnhanced);
        }
      } else if (selection.site.type === "Reward") {
        if (state.siteRuntime[siteId]?.kind !== "reward") {
          mutations.ensureRewardSiteRuntime(siteId);
        }
      } else {
        mutations.enterSite(siteId);
      }
    },
    [mutations, node, state],
  );

  const handleInlineRewardAnimationComplete = useCallback(
    (siteId: SiteId) => {
      if (node === undefined) return;
      const site = node.sites.find((candidate) => candidate.id === siteId);
      const resolution = resolveInlineReward(
        site,
        state.siteRuntime[siteId],
        state,
      );
      if (resolution === null) return;
      if (resolution.kind === "replacement") {
        setReplacementSiteId(siteId);
        return;
      }
      logEvent("site_completed", resolution.fields);
      if (resolution.kind === "essence") mutations.acceptEssenceSite(siteId);
      else mutations.acceptRewardSite(siteId);
    },
    [mutations, node, state],
  );

  const handleReplaceDreamsign = useCallback(
    (dreamsignId: DreamsignId) => {
      if (replacementSiteId === null || node === undefined) return;
      const resolution = resolveRewardReplacement(
        node,
        state,
        replacementSiteId,
        dreamsignId,
      );
      if (resolution === null) return;
      logEvent("site_completed", resolution.fields);
      mutations.acceptRewardSite(resolution.siteId, resolution.purgeIndex);
      setReplacementSiteId(null);
    },
    [mutations, node, replacementSiteId, state],
  );

  const handleDeclineReward = useCallback(() => {
    if (replacementSiteId === null || node === undefined) return;
    const resolution = resolveRewardDecline(node, state, replacementSiteId);
    if (resolution === null) return;
    logEvent("reward_declined", resolution.fields);
    mutations.completeSite(resolution.siteId, "reward_site");
    setReplacementSiteId(null);
  }, [mutations, node, replacementSiteId, state]);

  const handleRewardChoice = useCallback((dreamsignId: DreamsignId, heldId?: DreamsignId) => {
    if (node === undefined || view?.rewardChoice === undefined) return;
    const resolution = resolveEnhancedRewardChoice(node, state, view.rewardChoice.siteId, dreamsignId, heldId);
    if (resolution === null) return;
    if (resolution.kind === "replacement") {
      setSelectedRewardChoice({ siteId: resolution.siteId, dreamsignId });
      return;
    }
    mutations.acceptDreamsignOffer(resolution.siteId, resolution.dreamsign, resolution.purgeIndex);
    setSelectedRewardChoice(null);
  }, [mutations, node, state, view?.rewardChoice]);

  const handleDeclineRewardChoice = useCallback(() => {
    if (view?.rewardChoice === undefined) return;
    mutations.rejectDreamsignOffer(view.rewardChoice.siteId);
    setSelectedRewardChoice(null);
  }, [mutations, view?.rewardChoice]);

  const handleGuideDialogueShown = useCallback(() => {
    if (node === undefined || view?.guideDialogue === undefined) return;
    const entry = buildDreamscapeGuidanceLog(
      node.id,
      state,
      view.guideDialogue,
    );
    logEventOnce(entry.key, "tutorial_dreamscape_guidance_shown", entry.fields);
  }, [node, state, view?.guideDialogue]);

  if (view === null) return null;
  return (
    <DreamscapeScreen
      view={view}
      onSelectSite={handleSelectSite}
      onRewardChoice={handleRewardChoice}
      onDeclineRewardChoice={handleDeclineRewardChoice}
      onCancelRewardReplacement={() => setSelectedRewardChoice(null)}
      onInlineRewardAnimationComplete={handleInlineRewardAnimationComplete}
      onReplaceDreamsign={handleReplaceDreamsign}
      onDeclineReward={handleDeclineReward}
      onGuideDialogueShown={handleGuideDialogueShown}
    />
  );
}

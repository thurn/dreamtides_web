import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DreamscapeScreen } from "../../cumulus/screens/DreamscapeScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import {
  buildDreamscapeOverviewLog,
  buildDreamscapeGuidanceLog,
  buildDreamscapeView,
  resolveDreamscapeSiteSelection,
} from "./dreamscape-view-model";
import {
  resolveInlineReward,
  resolveRewardDecline,
  resolveRewardReplacement,
} from "./inline-reward-view-model";

/** Wires the live journey fold to the pure Cumulus Dreamscape screen. */
export function DreamscapeScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const node = state.currentDreamscape === null
    ? undefined
    : state.atlas.nodes[state.currentDreamscape];
  const [replacementSiteId, setReplacementSiteId] = useState<string | null>(null);
  const view = useMemo(
    () => node === undefined
      ? null
      : buildDreamscapeView(
          node,
          state,
          journeyContent.atlasData,
          replacementSiteId,
          journeyContent.tutorialDreamscape,
          journeyContent.draftData.offers.picksPerSite,
        ),
    [
      journeyContent.atlasData,
      journeyContent.tutorialDreamscape,
      journeyContent.draftData.offers.picksPerSite,
      node,
      replacementSiteId,
      state,
    ],
  );
  const loggedNodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (node === undefined || view === null || loggedNodeRef.current === node.id) return;
    loggedNodeRef.current = node.id;
    logEvent(
      "dreamscape_overview_presented",
      buildDreamscapeOverviewLog(node, view, state.completionLevel),
    );
  }, [node, state.completionLevel, view]);

  const handleSelectSite = useCallback((siteId: string) => {
    if (node === undefined) return;
    const selection = resolveDreamscapeSiteSelection(node, siteId, state.essence);
    if (selection === null) return;
    logEvent("site_entered", selection.fields);
    if (selection.site.type === "Essence") {
      if (state.siteRuntime[siteId]?.kind !== "essence") {
        mutations.ensureEssenceSiteRuntime(siteId, selection.site.isEnhanced);
      }
    } else if (selection.site.type === "Reward") {
      if (state.siteRuntime[siteId]?.kind !== "reward") {
        mutations.ensureRewardSiteRuntime(siteId);
      }
    } else {
      mutations.enterSite(siteId);
    }
  }, [mutations, node, state.essence, state.siteRuntime]);

  const handleInlineRewardAnimationComplete = useCallback((siteId: string) => {
    if (node === undefined) return;
    const site = node.sites.find((candidate) => candidate.id === siteId);
    const resolution = resolveInlineReward(site, state.siteRuntime[siteId], state);
    if (resolution === null) return;
    if (resolution.kind === "replacement") {
      setReplacementSiteId(siteId);
      return;
    }
    logEvent("site_completed", resolution.fields);
    if (resolution.kind === "essence") mutations.acceptEssenceSite(siteId);
    else mutations.acceptRewardSite(siteId);
  }, [mutations, node, state]);

  const handleReplaceDreamsign = useCallback((dreamsignId: string) => {
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
  }, [mutations, node, replacementSiteId, state]);

  const handleDeclineReward = useCallback(() => {
    if (replacementSiteId === null || node === undefined) return;
    const resolution = resolveRewardDecline(node, state, replacementSiteId);
    if (resolution === null) return;
    logEvent("reward_declined", resolution.fields);
    mutations.completeSite(resolution.siteId, "reward_site");
    setReplacementSiteId(null);
  }, [mutations, node, replacementSiteId, state]);

  const handleGuideDialogueShown = useCallback(() => {
    if (node === undefined || view?.guideDialogue === undefined) return;
    const entry = buildDreamscapeGuidanceLog(node.id, state, view.guideDialogue);
    logEventOnce(entry.key, "tutorial_dreamscape_guidance_shown", entry.fields);
  }, [node, state, view?.guideDialogue]);

  if (view === null) return null;
  return (
    <DreamscapeScreen
      view={view}
      onSelectSite={handleSelectSite}
      onInlineRewardAnimationComplete={handleInlineRewardAnimationComplete}
      onReplaceDreamsign={handleReplaceDreamsign}
      onDeclineReward={handleDeclineReward}
      onGuideDialogueShown={handleGuideDialogueShown}
    />
  );
}

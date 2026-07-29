import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logEventOnce } from "../../logging";
import type { Dreamsign } from "../../types/journey";
import { requireDreamsignId } from "../../data/dreamsigns";
import { DreamsignRevelationScreen } from "../../cumulus/screens/DreamsignRevelationScreen";
import { useJourney } from "../../state/journey-context";
import { buildDreamsignRevelationView, resolveDreamsignRevelationGuide } from "./dreamsign-revelation-view-model";

const FLY_TO_HUD_MS = 900;

export function DreamsignRevelationScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, journeyContent } = useJourney();
  const node = state.currentDreamscape === null ? null : state.atlas.nodes[state.currentDreamscape] ?? null;
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const runtime = state.siteRuntime[siteId];
  const offerRuntime = runtime?.kind === "dreamsignOffer" ? runtime : null;
  const options = offerRuntime?.offeredDreamsigns ?? null;
  const optionCount = site?.isEnhanced === true ? 4 : 3;
  const remainingDreamsignPoolKey = state.remainingDreamsignPool.join("\u0000");
  const guide = resolveDreamsignRevelationGuide(journeyContent.guides);
  const guideLine = useMemo(
    () => guide?.dialog.length ? guide.dialog[Math.floor(Math.random() * guide.dialog.length)] : null,
    [guide],
  );
  const [claimedIndex, setClaimedIndex] = useState<number | null>(null);
  const [pendingPurgeDreamsign, setPendingPurgeDreamsign] = useState<Dreamsign | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (runtime === undefined) mutations.ensureDreamsignOfferRuntime(siteId, optionCount);
  }, [mutations, optionCount, remainingDreamsignPoolKey, runtime, siteId]);

  useEffect(() => {
    if (options === null || site === null) return;
    logEventOnce(`dreamsign-revelation:${site.id}:site-entered`, "site_entered",
      { siteType: site.type, isEnhanced: site.isEnhanced, optionCount });
  }, [site?.id, site?.type, site?.isEnhanced, optionCount, options]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const view = useMemo(
    () =>
      buildDreamsignRevelationView({ state, sceneNode: node, guide, guideLine,
        offeredDreamsigns: options, pendingPurgeDreamsign,
        tutorialConfiguration: journeyContent.tutorialDreamsignRevelation }),
    [state, node, guide, guideLine, options, pendingPurgeDreamsign,
      journeyContent.tutorialDreamsignRevelation],
  );

  useEffect(() => {
    if (view.tutorial === undefined) {
      if (guide === null || site === null) return;
      logEventOnce(`dreamsign-revelation:${site.id}:guide:${guide.id}`,
        "dream_guide_presented",
        { guideId: guide.id, siteType: site.type, isEnhanced: site.isEnhanced });
      return;
    }
    logEventOnce(
      `first-visit-site-tutorial:${view.tutorial.id}`,
      "first_visit_site_tutorial_presented",
      { tutorialId: view.tutorial.id, siteId, siteType: "DreamsignRevelation",
        text: view.tutorial.model.text,
        horizontalOffset: view.tutorial.horizontalOffset,
        verticalOffset: view.tutorial.verticalOffset,
        bubbleWidth: view.tutorial.bubbleWidth },
    );
  }, [guide, site, siteId, view.tutorial]);

  const handleClaim = useCallback(
    (index: number) => {
      if (claimedIndex !== null || pendingPurgeDreamsign !== null) return;
      const dreamsign = options?.[index];
      if (dreamsign === undefined) return;
      if (state.dreamsigns.length >= state.maxDreamsigns) {
        setPendingPurgeDreamsign(dreamsign);
        return;
      }
      setClaimedIndex(index);
      timeoutRef.current = window.setTimeout(() => {
        mutations.acceptDreamsignOffer(siteId, dreamsign);
      }, FLY_TO_HUD_MS);
    },
    [claimedIndex, mutations, options, pendingPurgeDreamsign, siteId, state],
  );

  const handleSkip = useCallback(() => {
    if (claimedIndex === null && pendingPurgeDreamsign === null) {
      mutations.rejectDreamsignOffer(siteId);
    }
  }, [claimedIndex, mutations, pendingPurgeDreamsign, siteId]);

  const handlePurge = useCallback(
    (dreamsignId: string) => {
      if (pendingPurgeDreamsign === null) return;
      const index = state.dreamsigns.findIndex(
        (dreamsign) => requireDreamsignId(
          dreamsign, "Dreamsign Revelation replacement",
        ) === dreamsignId,
      );
      if (index < 0) return;
      mutations.acceptDreamsignOffer(siteId, pendingPurgeDreamsign, index);
      setPendingPurgeDreamsign(null);
    },
    [mutations, pendingPurgeDreamsign, siteId, state.dreamsigns],
  );

  if (site === null) return null;
  return (
    <DreamsignRevelationScreen
      view={view}
      onClaim={handleClaim}
      onSkip={handleSkip}
      onPurge={handlePurge}
      onCancelPurge={() => setPendingPurgeDreamsign(null)}
      claimedIndex={claimedIndex}
    />
  );
}

// Adapter for the Tango Dreamsign Revelation screen. Wiring only: it acquires
// live quest state, ensures the offer runtime exists, mints the guide line, and
// invokes the quest mutations after the screen's claim animation starts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logEvent } from "../../logging";
import type { Dreamsign } from "../../types/quest";
import { DreamsignRevelationScreen } from "../../tango/screens/DreamsignRevelationScreen";
import { useQuest } from "../../state/quest-context";
import { buildDreamsignRevelationView, resolveDreamsignRevelationGuide } from "./dreamsign-revelation-view-model";

const FLY_TO_HUD_MS = 900;

export function DreamsignRevelationScreenAdapter({
  siteId,
  onViewDeck,
}: {
  siteId: string;
  onViewDeck?: () => void;
}) {
  const { state, mutations, questContent } = useQuest();
  const node = state.currentDreamscape !== null
    ? state.atlas.nodes[state.currentDreamscape] ?? null
    : null;
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const runtime = state.siteRuntime[siteId];
  const offerRuntime = runtime?.kind === "dreamsignOffer" ? runtime : null;
  const options = offerRuntime?.offeredDreamsigns ?? null;
  const optionCount = site?.isEnhanced === true ? 4 : 3;
  const remainingDreamsignPoolKey = state.remainingDreamsignPool.join("\u0000");
  const guide = resolveDreamsignRevelationGuide(questContent.guides);
  const guideLine = useMemo(() => {
    if (guide === null || guide.dialog.length === 0) return null;
    return guide.dialog[Math.floor(Math.random() * guide.dialog.length)];
  }, [guide]);
  const [claimedIndex, setClaimedIndex] = useState<number | null>(null);
  const [pendingPurgeDreamsign, setPendingPurgeDreamsign] = useState<Dreamsign | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureDreamsignOfferRuntime(siteId, optionCount);
    }
  }, [mutations, optionCount, remainingDreamsignPoolKey, runtime, siteId]);

  useEffect(() => {
    if (options === null || site === null) return;
    logEvent("site_entered", { siteType: site.type, isEnhanced: site.isEnhanced, optionCount, ui: "tango" });
  }, [site, optionCount, options]);

  useEffect(() => {
    if (guide === null || site === null) return;
    logEvent("dream_guide_presented", { guideId: guide.id, siteType: site.type, isEnhanced: site.isEnhanced, ui: "tango" });
  }, [guide, site]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const view = useMemo(
    () =>
      buildDreamsignRevelationView({ state, sceneNode: node, guide, guideLine, offeredDreamsigns: options, pendingPurgeDreamsign }),
    [state, node, guide, guideLine, options, pendingPurgeDreamsign],
  );

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
    if (claimedIndex !== null || pendingPurgeDreamsign !== null) return;
    mutations.rejectDreamsignOffer(siteId);
  }, [claimedIndex, mutations, pendingPurgeDreamsign, siteId]);

  const handlePurge = useCallback(
    (index: number) => {
      if (pendingPurgeDreamsign === null) return;
      mutations.acceptDreamsignOffer(siteId, pendingPurgeDreamsign, index);
      setPendingPurgeDreamsign(null);
    },
    [mutations, pendingPurgeDreamsign, siteId],
  );

  if (site === null) return null;
  return (
    <DreamsignRevelationScreen
      view={view}
      onClaim={handleClaim}
      onSkip={handleSkip}
      onViewDeck={onViewDeck}
      onPurge={handlePurge}
      onCancelPurge={() => { setPendingPurgeDreamsign(null); }}
      claimedIndex={claimedIndex}
    />
  );
}

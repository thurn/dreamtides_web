import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GambleSiteScreen } from "../../cumulus/screens/GambleSiteScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { generateJourneySeed } from "../../state/journey-state-actions";
import {
  buildGambleSiteView,
  resolveGambleGuide,
} from "./gamble-site-view-model";

export function GambleSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, journeyContent } = useJourney();
  const node = state.currentDreamscape === null
    ? null
    : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const candidate = node?.sites.find((entry) => entry.id === siteId) ?? null;
  const site =
    candidate?.type === "Gamble"
      ? { ...candidate, type: candidate.type }
      : null;
  const guide = resolveGambleGuide(journeyContent.guides);
  const guideLineRef = useRef<string | null | undefined>(undefined);
  if (guideLineRef.current === undefined) {
    const lines = guide?.dialog ?? [];
    guideLineRef.current =
      lines.length === 0
        ? null
        : lines[Math.floor(Math.random() * lines.length)] ?? null;
  }
  const initialDealSeedRef = useRef<string | null>(null);
  if (initialDealSeedRef.current === null) {
    initialDealSeedRef.current = generateJourneySeed();
  }
  const [dealSeed, setDealSeed] = useState(initialDealSeedRef.current);
  const view = useMemo(
    () =>
      site === null
        ? null
        : buildGambleSiteView({
            sceneNode: node,
            site,
            guide,
            guideLine: guideLineRef.current ?? null,
            dealSeed,
          }),
    [dealSeed, guide, node, site],
  );

  useEffect(() => {
    if (site === null || view === null) return;
    logEventOnce(`Gamble:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
    });
    logEventOnce(
      `Gamble:${site.id}:playing-cards:${view.dealId}`,
      "gamble_playing_cards_dealt",
      {
        siteId: site.id,
        dealSeed: view.dealId,
        cards: view.cards.map((card) => card.id),
      },
    );
  }, [site, view]);

  const handleReroll = useCallback(() => {
    if (site === null) return;
    const nextDealSeed = generateJourneySeed();
    logEvent("gamble_playing_cards_rerolled", {
      siteId: site.id,
      previousDealSeed: dealSeed,
      nextDealSeed,
    });
    setDealSeed(nextDealSeed);
  }, [dealSeed, site]);

  if (view === null) return null;
  return <GambleSiteScreen view={view} onReroll={handleReroll} />;
}

import { useCallback, useEffect, useMemo } from "react";
import { GambleSiteScreen } from "../../cumulus/screens/GambleSiteScreen";
import { useJourney } from "../../state/journey-context";
import type { GravokGateId } from "../../types/gamble";
import {
  logGamblePrepared,
  logGambleReplacement,
  logGambleResolved,
  logGambleSettled,
  logGambleSiteEntered,
} from "./gamble-site-logging-view-model";
import {
  buildGambleSiteView,
  resolveGambleGuide,
} from "./gamble-site-view-model";

export function GambleSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, journeyContent, mutations } = useJourney();
  const node = state.currentDreamscape === null
    ? null
    : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const candidate = node?.sites.find((entry) => entry.id === siteId) ?? null;
  const site = candidate?.type === "Gamble"
    ? { ...candidate, type: candidate.type }
    : null;
  const runtimeCandidate = state.siteRuntime[siteId];
  const runtime = runtimeCandidate?.kind === "gamble" ? runtimeCandidate : null;
  const guide = resolveGambleGuide(journeyContent.guides);
  const view = useMemo(
    () => site === null
      ? null
      : buildGambleSiteView({
          state,
          sceneNode: node,
          site,
          guide,
        }),
    [guide, node, site, state],
  );

  useEffect(() => {
    if (site === null) return;
    mutations.ensureGambleSiteRuntime(site.id);
    logGambleSiteEntered(site);
  }, [mutations, site]);

  useEffect(() => {
    if (runtime === null || view === null) return;
    logGamblePrepared(siteId, runtime, view.gates);
    logGambleResolved(siteId, runtime, view.gates, view.result?.id);
    logGambleSettled(siteId, runtime, view.result?.id);
  }, [runtime, siteId, view]);

  const chooseGate = useCallback(
    (gateId: GravokGateId) => mutations.placeGravokWager(siteId, gateId),
    [mutations, siteId],
  );
  const complete = useCallback(
    () => mutations.completeSite(siteId, "gravok_three_gate_wager"),
    [mutations, siteId],
  );
  const settle = useCallback(
    () => mutations.settleGravokWager(siteId),
    [mutations, siteId],
  );
  const replaceDreamsign = useCallback(
    (dreamsignId: string) => {
      logGambleReplacement(siteId, dreamsignId, runtime?.rewardDreamsign?.id);
      mutations.replaceGravokWagerDreamsign(siteId, dreamsignId);
    },
    [mutations, runtime?.rewardDreamsign?.id, siteId],
  );

  if (view === null) return null;
  return (
    <GambleSiteScreen
      view={view}
      onChooseGate={chooseGate}
      onLeave={complete}
      onOutcomeShown={settle}
      onOutcomeComplete={complete}
      onReplaceDreamsign={replaceDreamsign}
    />
  );
}

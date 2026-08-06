import { useCallback, useEffect, useMemo } from "react";
import { GambleSiteScreen } from "../../cumulus/screens/GambleSiteScreen";
import { useJourney } from "../../state/journey-context";
import type { GambleGameId } from "../../types/gamble";
import {
  logGamblePrepared,
  logGambleReplacement,
  logGambleResolved,
  logGambleSettled,
  logGambleSiteEntered,
} from "./gamble-site-logging-view-model";
import { buildGambleSiteView, resolveGambleGuide } from "./gamble-site-view-model";

export function GambleSiteScreenAdapter({
  siteId,
  gambleGameId,
}: {
  siteId: string;
  gambleGameId: GambleGameId | null;
}) {
  const { state, journeyContent, mutations } = useJourney();
  const node = state.currentDreamscape === null
    ? null
    : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const candidate = node?.sites.find((entry) => entry.id === siteId) ?? null;
  const site = candidate?.type === "Gamble" ? { ...candidate, type: candidate.type } : null;
  const runtimeCandidate = state.siteRuntime[siteId];
  const runtime = runtimeCandidate?.kind === "gamble" ? runtimeCandidate : null;
  const guide = resolveGambleGuide(journeyContent.guides, site?.guideIdOverride);
  const view = useMemo(
    () => site === null
      ? null
      : buildGambleSiteView({ state, sceneNode: node, site, guide }),
    [guide, node, site, state],
  );

  useEffect(() => {
    if (site === null) return;
    mutations.ensureGambleSiteRuntime(
      site.id,
      gambleGameId ?? undefined,
    );
    logGambleSiteEntered(site);
  }, [gambleGameId, mutations, site]);

  useEffect(() => {
    if (runtime === null || view === null) return;
    logGamblePrepared(siteId, runtime, view);
    logGambleResolved(siteId, runtime, view);
    logGambleSettled(siteId, runtime, view);
  }, [runtime, siteId, view]);

  const settleGravok = useCallback(() => {
    if (runtime?.gameId !== "gravok-three-gate-wager") return;
    mutations.settleGravokWager(siteId, runtime.shuffleCommitment);
  }, [mutations, runtime, siteId]);
  const playAgain = useCallback(() => {
    if (runtime?.gameId !== "gravok-three-gate-wager") return;
    mutations.playAgainGravokWager(siteId, runtime.shuffleCommitment);
  }, [mutations, runtime, siteId]);
  const settleLadder = useCallback(() => {
    if (
      runtime?.gameId !== "tidemark-ladder-climb" ||
      runtime.result === null
    ) return;
    const commitment =
      runtime.shuffleCommitments[runtime.result.attemptNumber - 1];
    if (commitment === undefined) return;
    mutations.settleTidemarkLadderClimb(siteId, commitment);
  }, [mutations, runtime, siteId]);
  const settleStarway = useCallback(() => {
    if (runtime?.gameId !== "starway-stairs") return;
    const result = runtime.results[runtime.results.length - 1];
    if (result === undefined) return;
    const commitment = runtime.shuffleCommitments[result.tierNumber - 1];
    if (commitment === undefined) return;
    mutations.settleStarwayStairs(siteId, commitment);
  }, [mutations, runtime, siteId]);
  const replaceDreamsign = useCallback((dreamsignId: string) => {
    if (runtime === null || runtime.gameId === "starway-stairs") return;
    logGambleReplacement(
      siteId,
      runtime.gameId,
      dreamsignId,
      runtime.rewardDreamsign?.id,
    );
    if (runtime.gameId === "tidemark-ladder-climb") {
      mutations.replaceTidemarkLadderClimbDreamsign(siteId, dreamsignId);
    } else {
      mutations.replaceGravokWagerDreamsign(siteId, dreamsignId);
    }
  }, [mutations, runtime, siteId]);

  if (view === null) return null;
  return (
    <GambleSiteScreen
      view={view}
      onChooseGate={(gateId) => mutations.placeGravokWager(siteId, gateId)}
      onLeave={() => mutations.completeSite(siteId, runtime?.gameId ?? "gamble")}
      onOutcomeShown={settleGravok}
      onPlayAgain={playAgain}
      onDrawLadder={() => mutations.drawTidemarkLadderClimb(siteId)}
      onLadderOutcomeShown={settleLadder}
      onDrawStarway={() => mutations.drawStarwayStairs(siteId)}
      onStarwayOutcomeShown={settleStarway}
      onCashOutStarway={() => {
        if (runtime?.gameId !== "starway-stairs") return;
        const result = runtime.results[runtime.results.length - 1];
        if (result === undefined) return;
        const commitment = runtime.shuffleCommitments[result.tierNumber - 1];
        if (commitment !== undefined) {
          mutations.cashOutStarwayStairs(siteId, commitment);
        }
      }}
      onReplaceDreamsign={replaceDreamsign}
    />
  );
}

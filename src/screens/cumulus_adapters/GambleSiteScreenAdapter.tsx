import { useCallback, useEffect, useMemo } from "react";
import { GambleSiteScreen } from "../../cumulus/screens/GambleSiteScreen";
import { useJourney } from "../../state/journey-context";
import type { GambleGameId } from "../../types/gamble";
import { logGamblePrepared, logGambleReplacement, logGambleResolved, logGambleSettled, logGambleSiteEntered } from "./gamble-site-logging-view-model";
import { buildGambleSiteView, resolveGambleGuide } from "./gamble-site-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";

export function GambleSiteScreenAdapter({ siteId, gambleGameId }: { siteId: string; gambleGameId: GambleGameId | null }) {
  const { state, journeyContent, mutations } = useJourney();
  const node = state.currentDreamscape === null ? null : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const candidate = node?.sites.find((entry) => entry.id === siteId) ?? null;
  const site = candidate?.type === "Gamble" ? { ...candidate, type: candidate.type } : null;
  const runtimeCandidate = state.siteRuntime[siteId];
  const runtime = runtimeCandidate?.kind === "gamble" ? runtimeCandidate : null;
  const guide = resolveGambleGuide(journeyContent.guides, site?.guideIdOverride);
  const dialogueContext = site?.randomSite?.materialized === true ? "random-site" : runtime?.gameId === "tidemark-ladder-climb" ? "gamble-ladder-climb" : runtime?.gameId === "starway-stairs" ? "gamble-starway-stairs" : runtime?.gameId === "four-suit-reprise" ? "gamble-four-suit-reprise" : "gamble-three-gate";
  const guideLine = useGuideDialogue(guide, dialogueContext, {
    "win-essence": journeyContent.economyData.gamble.ladderClimb.winEssence,
  });
  const view = useMemo(
    () =>
      site === null
        ? null
        : buildGambleSiteView({
            state,
            sceneNode: node,
            site,
            guide,
            guideLine,
            sitesData: journeyContent.sitesData,
            economyData: journeyContent.economyData,
          }),
    [guide, guideLine, journeyContent.economyData, journeyContent.sitesData, node, site, state],
  );

  useEffect(() => {
    if (site === null) return;
    mutations.ensureGambleSiteRuntime(site.id, gambleGameId ?? undefined);
    logGambleSiteEntered(site);
  }, [gambleGameId, mutations, site]);

  useEffect(() => {
    if (runtime === null || view === null) return;
    logGamblePrepared(siteId, runtime, view, journeyContent.economyData, journeyContent.sitesData);
    logGambleResolved(siteId, runtime, view, journeyContent.economyData, journeyContent.sitesData);
    logGambleSettled(siteId, runtime, view, journeyContent.economyData, journeyContent.sitesData);
  }, [runtime, siteId, view, journeyContent.economyData, journeyContent.sitesData]);

  const settleOutcome = useCallback(() => {
    if (runtime?.gameId === "gravok-three-gate-wager") {
      mutations.settleGravokWager(siteId, runtime.shuffleCommitment);
    } else if (runtime?.gameId === "tidemark-ladder-climb" && runtime.result !== null) {
      const commitment = runtime.shuffleCommitments[runtime.result.attemptNumber - 1];
      if (commitment !== undefined) mutations.settleTidemarkLadderClimb(siteId, commitment);
    } else if (runtime?.gameId === "starway-stairs") {
      const result = runtime.results[runtime.results.length - 1];
      const commitment = result === undefined ? undefined : runtime.shuffleCommitments[result.tierNumber - 1];
      if (commitment !== undefined) mutations.settleStarwayStairs(siteId, commitment);
    } else if (runtime?.gameId === "four-suit-reprise") {
      const commitment = runtime.rounds[runtime.rounds.length - 1]?.shuffleCommitment;
      if (commitment !== undefined) mutations.settleFourSuitReprise(siteId, commitment);
    }
  }, [mutations, runtime, siteId]);
  const playAgain = useCallback(() => {
    if (runtime?.gameId === "gravok-three-gate-wager") {
      mutations.playAgainGravokWager(siteId, runtime.shuffleCommitment);
    } else if (runtime?.gameId === "starway-stairs") {
      const commitment = runtime.shuffleCommitments[0];
      if (commitment !== undefined) mutations.playAgainStarwayStairs(siteId, commitment);
    } else if (runtime?.gameId === "four-suit-reprise") {
      const commitment = runtime.rounds[runtime.rounds.length - 1]?.shuffleCommitment;
      if (commitment !== undefined) mutations.playAgainFourSuitReprise(siteId, commitment);
    }
  }, [mutations, runtime, siteId]);
  const replaceDreamsign = useCallback(
    (dreamsignId: string) => {
      if (runtime?.gameId !== "gravok-three-gate-wager" && runtime?.gameId !== "tidemark-ladder-climb") return;
      logGambleReplacement(siteId, runtime.gameId, dreamsignId, runtime.rewardDreamsign?.id);
      if (runtime.gameId === "tidemark-ladder-climb") {
        mutations.replaceTidemarkLadderClimbDreamsign(siteId, dreamsignId);
      } else {
        mutations.replaceGravokWagerDreamsign(siteId, dreamsignId);
      }
    },
    [mutations, runtime, siteId],
  );

  if (view === null) return null;
  return (
    <GambleSiteScreen
      view={view}
      onChooseGate={(gateId) => mutations.placeGravokWager(siteId, gateId)}
      onLeave={() => mutations.completeSite(siteId, runtime?.gameId ?? "gamble")}
      onOutcomeShown={settleOutcome}
      onPlayAgain={playAgain}
      onDrawLadder={() => mutations.drawTidemarkLadderClimb(siteId)}
      onLadderOutcomeShown={settleOutcome}
      onDrawStarway={() => mutations.drawStarwayStairs(siteId)}
      onStarwayOutcomeShown={settleOutcome}
      onPlayAgainStarway={playAgain}
      onCashOutStarway={() => {
        if (runtime?.gameId !== "starway-stairs") return;
        const result = runtime.results[runtime.results.length - 1];
        if (result === undefined) return;
        const commitment = runtime.shuffleCommitments[result.tierNumber - 1];
        if (commitment !== undefined) {
          mutations.cashOutStarwayStairs(siteId, commitment);
        }
      }}
      onDrawFourSuit={(entryId) => mutations.drawFourSuitReprise(siteId, entryId)}
      onFourSuitOutcomeShown={settleOutcome}
      onChooseFourSuitTransfiguration={(type) => {
        if (runtime?.gameId !== "four-suit-reprise") return;
        const commitment = runtime.rounds[runtime.rounds.length - 1]?.shuffleCommitment;
        if (commitment !== undefined) mutations.chooseFourSuitRepriseTransfiguration(siteId, commitment, type);
      }}
      onPlayAgainFourSuit={playAgain}
      onReplaceDreamsign={replaceDreamsign}
    />
  );
}

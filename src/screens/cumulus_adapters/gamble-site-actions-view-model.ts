import type { GambleSiteScreenProps } from "../../cumulus/screens/GambleSiteScreen";
import type { JourneyMutations } from "../../state/journey-context";
import type { GambleSiteRuntime } from "../../types/journey";
import { logGambleReplacement } from "./gamble-site-logging-view-model";
import type { SiteId } from "../../types/identifiers";
import { parseShuffleCommitment } from "../../types/identifiers";

type Actions = Omit<GambleSiteScreenProps, "view">;

function latestCommitment(runtime: GambleSiteRuntime): string | undefined {
  if (runtime.gameId === "gravok-three-gate-wager")
    return runtime.shuffleCommitment;
  if (runtime.gameId === "tidemark-ladder-climb") {
    return runtime.result === null
      ? undefined
      : runtime.shuffleCommitments[runtime.result.attemptNumber - 1];
  }
  if (runtime.gameId === "starway-stairs") {
    const result = runtime.results[runtime.results.length - 1];
    return result === undefined
      ? undefined
      : runtime.shuffleCommitments[result.tierNumber - 1];
  }
  if (runtime.gameId === "four-suit-reprise")
    return runtime.rounds[runtime.rounds.length - 1]?.shuffleCommitment;
  return runtime.shuffleCommitment;
}

export function gambleSiteActions(
  siteId: SiteId,
  runtime: GambleSiteRuntime | null,
  mutations: JourneyMutations,
): Actions {
  const settle = () => {
    if (runtime === null) return;
    const commitment = latestCommitment(runtime);
    if (commitment === undefined) return;
    if (runtime.gameId === "gravok-three-gate-wager")
      mutations.settleGravokWager(siteId, parseShuffleCommitment(commitment));
    else if (runtime.gameId === "tidemark-ladder-climb")
      mutations.settleTidemarkLadderClimb(
        siteId,
        parseShuffleCommitment(commitment),
      );
    else if (runtime.gameId === "starway-stairs")
      mutations.settleStarwayStairs(siteId, parseShuffleCommitment(commitment));
    else if (runtime.gameId === "four-suit-reprise")
      mutations.settleFourSuitReprise(siteId, parseShuffleCommitment(commitment));
    else mutations.settleBlackjack(siteId, parseShuffleCommitment(commitment));
  };
  const playAgain = () => {
    if (runtime === null) return;
    const commitment =
      runtime.gameId === "starway-stairs"
        ? runtime.shuffleCommitments[0]
        : latestCommitment(runtime);
    if (commitment === undefined) return;
    if (runtime.gameId === "gravok-three-gate-wager")
      mutations.playAgainGravokWager(siteId, parseShuffleCommitment(commitment));
    else if (runtime.gameId === "starway-stairs")
      mutations.playAgainStarwayStairs(siteId, parseShuffleCommitment(commitment));
    else if (runtime.gameId === "four-suit-reprise")
      mutations.playAgainFourSuitReprise(
        siteId,
        parseShuffleCommitment(commitment),
      );
    else if (runtime.gameId === "blackjack")
      mutations.playAgainBlackjack(siteId, parseShuffleCommitment(commitment));
  };
  return {
    onChooseGate: (gateId) => mutations.placeGravokWager(siteId, gateId),
    onLeave: () => mutations.completeSite(siteId, runtime?.gameId ?? "gamble"),
    onOutcomeShown: settle,
    onPlayAgain: playAgain,
    onDrawLadder: () => mutations.drawTidemarkLadderClimb(siteId),
    onLadderOutcomeShown: settle,
    onDrawStarway: () => mutations.drawStarwayStairs(siteId),
    onStarwayOutcomeShown: settle,
    onPlayAgainStarway: playAgain,
    onCashOutStarway: () => {
      if (runtime?.gameId !== "starway-stairs") return;
      const commitment = latestCommitment(runtime);
      if (commitment !== undefined)
        mutations.cashOutStarwayStairs(siteId, parseShuffleCommitment(commitment));
    },
    onDrawFourSuit: (entryId) => mutations.drawFourSuitReprise(siteId, entryId),
    onFourSuitOutcomeShown: settle,
    onChooseFourSuitTransfiguration: (type) => {
      if (runtime?.gameId !== "four-suit-reprise") return;
      const commitment = latestCommitment(runtime);
      if (commitment !== undefined)
        mutations.chooseFourSuitRepriseTransfiguration(
          siteId,
          parseShuffleCommitment(commitment),
          type,
        );
    },
    onPlayAgainFourSuit: playAgain,
    onDealBlackjack: () => mutations.dealBlackjack(siteId),
    onHitBlackjack: () => mutations.hitBlackjack(siteId),
    onStandBlackjack: () => mutations.standBlackjack(siteId),
    onBlackjackOutcomeShown: settle,
    onPlayAgainBlackjack: playAgain,
    onReplaceDreamsign: (dreamsignId) => {
      if (
        runtime?.gameId !== "gravok-three-gate-wager" &&
        runtime?.gameId !== "tidemark-ladder-climb"
      )
        return;
      logGambleReplacement(
        siteId,
        runtime.gameId,
        dreamsignId,
        runtime.rewardDreamsign?.id,
      );
      if (runtime.gameId === "tidemark-ladder-climb")
        mutations.replaceTidemarkLadderClimbDreamsign(siteId, dreamsignId);
      else mutations.replaceGravokWagerDreamsign(siteId, dreamsignId);
    },
  };
}

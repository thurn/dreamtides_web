import type { GambleSiteView } from "../../cumulus/screens/GambleSiteScreen";
import {
  TIDEMARK_PROGRESSIVE_ATTEMPTS,
  tidemarkAttemptCost,
} from "../../data/tidemark-progressive-draw";
import { logEventOnce } from "../../logging";
import type { GambleSiteRuntime, SiteState } from "../../types/journey";

/** Record one Gamble visit without coupling logging payloads to the adapter. */
export function logGambleSiteEntered(site: SiteState & { type: "Gamble" }): void {
  logEventOnce(`Gamble:${site.id}:site-entered`, "site_entered", {
    siteType: site.type,
    isEnhanced: site.isEnhanced,
  });
}

/** Record the complete deterministic game preparation for replay diagnosis. */
export function logGamblePrepared(
  siteId: string,
  runtime: GambleSiteRuntime,
  view: GambleSiteView,
): void {
  if (
    runtime.gameId === "gravok-three-gate-wager" &&
    view.gameId === "gravok-three-gate-wager"
  ) {
    logEventOnce(
      `Gamble:${siteId}:prepared:${runtime.shuffleCommitment}`,
      "gamble_game_prepared",
      {
        siteId,
        gameId: runtime.gameId,
        rulesVersion: runtime.rulesVersion,
        roundNumber: runtime.roundNumber ?? 1,
        playerDecision:
          (runtime.roundNumber ?? 1) === 1 ? "initial" : "play_again",
        isFarpoint: runtime.isFarpoint,
        wagerCost: runtime.wagerCost,
        shuffleCommitment: runtime.shuffleCommitment,
        dreamsignCandidateIds: runtime.dreamsignCandidateIds,
        selectedDreamsignId: runtime.rewardDreamsign?.id ?? null,
        gates: view.gates.map((gate) => ({
          gateId: gate.id,
          chance: gate.chanceLabel,
          oddsNumerator: gate.oddsNumerator,
          oddsDenominator: gate.oddsDenominator,
          rewardEssence: gate.essenceReward,
        })),
      },
    );
    return;
  }

  if (
    runtime.gameId !== "tidemark-progressive-draw" ||
    view.gameId !== "tidemark-progressive-draw"
  ) {
    return;
  }
  logEventOnce(
    `Gamble:${siteId}:prepared:${runtime.shuffleCommitments.join(":")}`,
    "gamble_game_prepared",
    {
      siteId,
      gameId: runtime.gameId,
      rulesVersion: runtime.rulesVersion,
      isFarpoint: runtime.isFarpoint,
      shuffleCommitments: runtime.shuffleCommitments,
      dreamsignCandidates: runtime.dreamsignCandidateScores,
      strongPoolSize: runtime.strongPoolSize,
      strongPoolCutoffScore: runtime.strongPoolCutoffScore,
      selectedDreamsignId: runtime.rewardDreamsign?.id ?? null,
      attempts: TIDEMARK_PROGRESSIVE_ATTEMPTS.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        cost: tidemarkAttemptCost(attempt.attemptNumber, runtime.isFarpoint),
        oddsNumerator: attempt.oddsNumerator,
        oddsDenominator: attempt.oddsDenominator,
        threshold: attempt.threshold,
      })),
    },
  );
}

/** Record each payment, revealed card, and resolved outcome. */
export function logGambleResolved(
  siteId: string,
  runtime: GambleSiteRuntime,
  view: GambleSiteView,
): void {
  if (
    runtime.gameId === "gravok-three-gate-wager" &&
    view.gameId === "gravok-three-gate-wager"
  ) {
    if (runtime.result === null) return;
    const gate = view.gates.find((entry) => entry.id === runtime.result?.gateId);
    logEventOnce(
      `Gamble:${siteId}:result:${view.result?.id ?? "unknown"}`,
      "gamble_wager_resolved",
      {
        siteId,
        gameId: runtime.gameId,
        gateId: runtime.result.gateId,
        odds: gate?.chanceLabel ?? null,
        oddsNumerator: gate?.oddsNumerator ?? null,
        oddsDenominator: gate?.oddsDenominator ?? null,
        payment: runtime.wagerCost,
        revealedCard: runtime.result.card,
        won: runtime.result.won,
        terminalReason: runtime.result.won ? "won" : "bust",
        essenceGained: runtime.result.essenceGained,
        dreamsignId: runtime.rewardDreamsign?.id ?? null,
        pendingDreamsignReplacement:
          runtime.result.pendingDreamsignReplacement,
      },
    );
    return;
  }

  if (runtime.gameId !== "tidemark-progressive-draw") return;
  const result = runtime.result;
  if (result === null) return;
  const attempt = TIDEMARK_PROGRESSIVE_ATTEMPTS[result.attemptNumber - 1];
  logEventOnce(
    `Gamble:${siteId}:progressive-result:${runtime.shuffleCommitments[result.attemptNumber - 1] ?? "unknown"}`,
    "gamble_wager_resolved",
    {
      siteId,
      gameId: runtime.gameId,
      attemptNumber: result.attemptNumber,
      oddsNumerator: attempt?.oddsNumerator ?? null,
      oddsDenominator: attempt?.oddsDenominator ?? null,
      threshold: attempt?.threshold ?? null,
      payment: result.costPaid,
      cumulativeCost: result.cumulativeCost,
      revealedCard: result.card,
      won: result.won,
      terminalReason: result.won
        ? "won"
        : result.attemptNumber === 4
          ? "missed_all"
          : "miss",
    },
  );
}

/** Record when the result presentation applies its authoritative settlement. */
export function logGambleSettled(
  siteId: string,
  runtime: GambleSiteRuntime,
  view: GambleSiteView,
): void {
  if (runtime.gameId === "gravok-three-gate-wager") {
    if (runtime.result?.essenceSettled !== true) return;
    logEventOnce(
      `Gamble:${siteId}:settled:${view.result?.id ?? "unknown"}`,
      "gamble_wager_settled",
      {
        siteId,
        gameId: runtime.gameId,
        gateId: runtime.result.gateId,
        payment: runtime.wagerCost,
        essenceGained: runtime.result.essenceGained,
        essenceChangeAtSettlement: runtime.result.essenceGained,
        netEssenceChange: runtime.result.essenceGained - runtime.wagerCost,
      },
    );
    return;
  }

  if (runtime.result?.resultSettled !== true) return;
  logEventOnce(
    `Gamble:${siteId}:progressive-settled:${runtime.shuffleCommitments[runtime.result.attemptNumber - 1] ?? "unknown"}`,
    "gamble_wager_settled",
    {
      siteId,
      gameId: runtime.gameId,
      attemptNumber: runtime.result.attemptNumber,
      cumulativeCost: runtime.result.cumulativeCost,
      dreamsignId: runtime.result.won
        ? runtime.rewardDreamsign?.id ?? null
        : null,
      dreamsignAwarded: runtime.result.dreamsignAwarded,
      pendingDreamsignReplacement:
        runtime.result.pendingDreamsignReplacement,
    },
  );
}

/** Record the UUID replacement that completed an at-cap Dreamsign win. */
export function logGambleReplacement(
  siteId: string,
  gameId: GambleSiteRuntime["gameId"],
  replacedDreamsignId: string,
  awardedDreamsignId: string | undefined,
): void {
  logEventOnce(
    `Gamble:${siteId}:replacement:${replacedDreamsignId}`,
    "gamble_dreamsign_replaced",
    {
      siteId,
      gameId,
      replacedDreamsignId,
      awardedDreamsignId: awardedDreamsignId ?? null,
    },
  );
}

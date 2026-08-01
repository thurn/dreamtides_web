import type { GambleGateView } from "../../cumulus/screens/GambleSiteScreen";
import { logEventOnce } from "../../logging";
import type { GambleSiteRuntime, SiteState } from "../../types/journey";

/** Record one Gamble visit without coupling logging payloads to the adapter. */
export function logGambleSiteEntered(site: SiteState & { type: "Gamble" }): void {
  logEventOnce(`Gamble:${site.id}:site-entered`, "site_entered", {
    siteType: site.type,
    isEnhanced: site.isEnhanced,
  });
}

/** Record the complete deterministic wager preparation for replay diagnosis. */
export function logGamblePrepared(
  siteId: string,
  runtime: GambleSiteRuntime,
  gates: readonly GambleGateView[],
): void {
  logEventOnce(
    `Gamble:${siteId}:prepared:${runtime.shuffleCommitment}`,
    "gamble_game_prepared",
    {
      siteId,
      gameId: runtime.gameId,
      rulesVersion: runtime.rulesVersion,
      isFarpoint: runtime.isFarpoint,
      wagerCost: runtime.wagerCost,
      shuffleCommitment: runtime.shuffleCommitment,
      dreamsignCandidateIds: runtime.dreamsignCandidateIds,
      selectedDreamsignId: runtime.rewardDreamsign?.id ?? null,
      gates: gates.map((gate) => ({
        gateId: gate.id,
        chance: gate.chanceLabel,
        oddsNumerator: gate.oddsNumerator,
        oddsDenominator: gate.oddsDenominator,
        rewardEssence: gate.essenceReward,
      })),
    },
  );
}

/** Record the payment, revealed draw, and terminal wager outcome. */
export function logGambleResolved(
  siteId: string,
  runtime: GambleSiteRuntime,
  gates: readonly GambleGateView[],
  resultId: string | undefined,
): void {
  if (runtime.result === null) return;
  const gate = gates.find((entry) => entry.id === runtime.result?.gateId);
  logEventOnce(
    `Gamble:${siteId}:result:${resultId ?? "unknown"}`,
    "gamble_wager_resolved",
    {
      siteId,
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
      pendingDreamsignReplacement: runtime.result.pendingDreamsignReplacement,
    },
  );
}

/** Record when the result presentation applies the wager's net Essence. */
export function logGambleSettled(
  siteId: string,
  runtime: GambleSiteRuntime,
  resultId: string | undefined,
): void {
  if (runtime.result?.essenceSettled !== true) return;
  logEventOnce(
    `Gamble:${siteId}:settled:${resultId ?? "unknown"}`,
    "gamble_wager_settled",
    {
      siteId,
      gateId: runtime.result.gateId,
      payment: runtime.wagerCost,
      essenceGained: runtime.result.essenceGained,
      netEssenceChange: runtime.result.essenceGained - runtime.wagerCost,
    },
  );
}

/** Record the UUID replacement that completed an at-cap jackpot. */
export function logGambleReplacement(
  siteId: string,
  replacedDreamsignId: string,
  awardedDreamsignId: string | undefined,
): void {
  logEventOnce(
    `Gamble:${siteId}:replacement:${replacedDreamsignId}`,
    "gamble_dreamsign_replaced",
    {
      siteId,
      replacedDreamsignId,
      awardedDreamsignId: awardedDreamsignId ?? null,
    },
  );
}

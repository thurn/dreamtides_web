import type { GambleSiteView } from "../../cumulus/screens/GambleSiteScreen";
import {
  TIDEMARK_LADDER_CLIMB_ATTEMPTS,
  tidemarkLadderClimbAttemptCost,
} from "../../data/tidemark-ladder-climb";
import {
  STARWAY_STAIRS_TIERS,
  starwayStairsEssenceReward,
  starwayStairsTierRule,
} from "../../data/starway-stairs";
import {
  FOUR_SUIT_REPRISE_OUTCOMES,
  FOUR_SUIT_REPRISE_ODDS_DENOMINATOR,
  FOUR_SUIT_REPRISE_ODDS_NUMERATOR,
} from "../../data/four-suit-reprise";
import { logEventOnce } from "../../logging";
import type { GambleSiteRuntime, SiteState } from "../../types/journey";
import type { EconomyData } from "../../types/economy-data";

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
  economyData: EconomyData,
): void {
  if (
    runtime.gameId === "four-suit-reprise" &&
    view.gameId === "four-suit-reprise"
  ) {
    logEventOnce(
      `Gamble:${siteId}:prepared:${runtime.shuffleCommitments.join(":")}`,
      "gamble_game_prepared",
      {
        siteId,
        gameId: runtime.gameId,
        rulesVersion: runtime.rulesVersion,
        isFarpoint: runtime.isFarpoint,
        drawCost: runtime.drawCost,
        maxRounds: runtime.shuffleCommitments.length,
        shuffleCommitments: runtime.shuffleCommitments,
        targetCandidates: runtime.targets.map((target) => ({
          entryId: target.entryId,
          cardId: target.cardId,
          transfigurationTypes: target.transfigurationOffers.map(
            (offer) => offer.type,
          ),
        })),
        outcomes: FOUR_SUIT_REPRISE_OUTCOMES.map((rule) => ({
          suit: rule.suit,
          outcome: rule.outcome,
        })),
        oddsNumerator: FOUR_SUIT_REPRISE_ODDS_NUMERATOR,
        oddsDenominator: FOUR_SUIT_REPRISE_ODDS_DENOMINATOR,
      },
    );
    if (runtime.phase === "choose" && runtime.rounds.length > 0) {
      const previous = runtime.rounds[runtime.rounds.length - 1];
      logEventOnce(
        `Gamble:${siteId}:four-suit-play-again:${previous?.shuffleCommitment ?? "unknown"}`,
        "gamble_game_prepared",
        {
          siteId,
          gameId: runtime.gameId,
          playerDecision: "play_again",
          completedRounds: runtime.rounds.length,
          remainingTargetCardIds: view.cards.map((card) => card.cardId),
        },
      );
    }
    return;
  }
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
    runtime.gameId === "starway-stairs" &&
    view.gameId === "starway-stairs"
  ) {
    logEventOnce(
      `Gamble:${siteId}:prepared:${runtime.shuffleCommitments.join(":")}`,
      "gamble_game_prepared",
      {
        siteId,
        gameId: runtime.gameId,
        rulesVersion: runtime.rulesVersion,
        roundNumber: runtime.roundNumber,
        playerDecision: runtime.roundNumber === 1 ? "initial" : "play_again",
        isFarpoint: runtime.isFarpoint,
        wagerAmount: runtime.wagerAmount,
        shuffleCommitments: runtime.shuffleCommitments,
        tiers: STARWAY_STAIRS_TIERS.map((tier) => ({
          tierNumber: tier.tierNumber,
          bustOddsNumerator: tier.bustOddsNumerator,
          oddsDenominator: tier.oddsDenominator,
          highestBustRank: tier.highestBustRank,
          rewardEssence: starwayStairsEssenceReward(economyData.gamble.starwayStairs, tier.tierNumber),
        })),
      },
    );
    return;
  }

  if (
    runtime.gameId !== "tidemark-ladder-climb" ||
    view.gameId !== "tidemark-ladder-climb"
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
      rewardEssence: economyData.gamble.ladderClimb.winEssence,
      attempts: TIDEMARK_LADDER_CLIMB_ATTEMPTS.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        cost: tidemarkLadderClimbAttemptCost(economyData.gamble.ladderClimb, attempt.attemptNumber, runtime.isFarpoint),
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
  economyData: EconomyData,
): void {
  if (runtime.gameId === "four-suit-reprise") {
    const result = runtime.rounds[runtime.rounds.length - 1];
    if (result === undefined) return;
    logEventOnce(
      `Gamble:${siteId}:four-suit-result:${result.shuffleCommitment}`,
      "gamble_wager_resolved",
      {
        siteId,
        gameId: runtime.gameId,
        rulesVersion: runtime.rulesVersion,
        roundNumber: result.roundNumber,
        payment: result.costPaid,
        selectedEntryId: result.targetEntryId,
        selectedCardId: result.targetCardId,
        revealedCard: result.card,
        resolvedSuitOutcome: result.outcome,
        oddsNumerator: FOUR_SUIT_REPRISE_ODDS_NUMERATOR,
        oddsDenominator: FOUR_SUIT_REPRISE_ODDS_DENOMINATOR,
      },
    );
    return;
  }
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

  if (runtime.gameId === "starway-stairs") {
    const result = runtime.results[runtime.results.length - 1];
    if (result === undefined) return;
    const tier = starwayStairsTierRule(result.tierNumber);
    logEventOnce(
      `Gamble:${siteId}:starway-result:${runtime.shuffleCommitments[result.tierNumber - 1] ?? "unknown"}`,
      "gamble_wager_resolved",
      {
        siteId,
        gameId: runtime.gameId,
        roundNumber: runtime.roundNumber,
        tierNumber: result.tierNumber,
        bustOddsNumerator: tier.bustOddsNumerator,
        oddsDenominator: tier.oddsDenominator,
        highestBustRank: tier.highestBustRank,
        payment: runtime.wagerAmount,
        revealedCard: result.card,
        busted: result.busted,
        prizeAtRisk: starwayStairsEssenceReward(economyData.gamble.starwayStairs, result.tierNumber),
      },
    );
    return;
  }

  if (runtime.gameId !== "tidemark-ladder-climb") return;
  const result = runtime.result;
  if (result === null) return;
  const attempt = TIDEMARK_LADDER_CLIMB_ATTEMPTS[result.attemptNumber - 1];
  logEventOnce(
    `Gamble:${siteId}:ladder-result:${runtime.shuffleCommitments[result.attemptNumber - 1] ?? "unknown"}`,
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
      essenceGained: result.won
        ? economyData.gamble.ladderClimb.winEssence
        : 0,
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
  economyData: EconomyData,
): void {
  if (runtime.gameId === "four-suit-reprise") {
    const result = runtime.rounds[runtime.rounds.length - 1];
    if (result === undefined || !result.resultSettled) return;
    logEventOnce(
      `Gamble:${siteId}:four-suit-settled:${result.shuffleCommitment}`,
      "gamble_wager_settled",
      {
        siteId,
        gameId: runtime.gameId,
        roundNumber: result.roundNumber,
        payment: result.costPaid,
        selectedEntryId: result.targetEntryId,
        selectedCardId: result.targetCardId,
        revealedCard: result.card,
        finalEffect: result.outcome,
        essenceGained: result.essenceGained,
        duplicatedEntryId: result.duplicatedEntryId ?? null,
        chosenTransfiguration: result.chosenTransfiguration ?? null,
        terminalReason:
          runtime.rounds.length >= runtime.shuffleCommitments.length
            ? "round_limit"
            : "round_settled",
      },
    );
    return;
  }
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

  if (runtime.gameId === "starway-stairs") {
    const result = runtime.results[runtime.results.length - 1];
    if (result === undefined || !result.resultSettled) return;
    logEventOnce(
      `Gamble:${siteId}:starway-settled:${runtime.shuffleCommitments[result.tierNumber - 1] ?? "unknown"}:${runtime.terminalReason ?? "continue"}`,
      "gamble_wager_settled",
      {
        siteId,
        gameId: runtime.gameId,
        roundNumber: runtime.roundNumber,
        tierNumber: result.tierNumber,
        busted: result.busted,
        terminalReason: runtime.terminalReason,
        prizeAtRisk: starwayStairsEssenceReward(economyData.gamble.starwayStairs, result.tierNumber),
        prizeAwarded: runtime.prizeAwarded,
        payment: runtime.wagerAmount,
      },
    );
    return;
  }

  if (
    runtime.gameId !== "tidemark-ladder-climb" ||
    runtime.result?.resultSettled !== true
  ) return;
  logEventOnce(
    `Gamble:${siteId}:ladder-settled:${runtime.shuffleCommitments[runtime.result.attemptNumber - 1] ?? "unknown"}`,
    "gamble_wager_settled",
    {
      siteId,
      gameId: runtime.gameId,
      attemptNumber: runtime.result.attemptNumber,
      cumulativeCost: runtime.result.cumulativeCost,
      essenceGained: runtime.result.won
        ? economyData.gamble.ladderClimb.winEssence
        : 0,
      essenceChangeAtSettlement: runtime.result.won
        ? economyData.gamble.ladderClimb.winEssence
        : 0,
      netEssenceChange:
        (runtime.result.won ? economyData.gamble.ladderClimb.winEssence : 0) -
        runtime.result.cumulativeCost,
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

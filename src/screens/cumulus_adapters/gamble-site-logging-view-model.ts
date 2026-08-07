import type { GambleSiteView } from "../../cumulus/screens/GambleSiteScreen";
import { tidemarkLadderClimbAttemptCost } from "../../data/tidemark-ladder-climb";
import {
  starwayStairsEssenceReward,
  starwayStairsTierRule,
} from "../../data/starway-stairs";
import {
  BLACKJACK_MAX_ATTEMPTS,
  blackjackHandTotal,
} from "../../data/blackjack";
import { logEventOnce } from "../../logging";
import type { GambleSiteRuntime, SiteState } from "../../types/journey";
import type { EconomyData } from "../../types/economy-data";
import type { SitesData } from "../../types/sites-data";

/** Record one Gamble visit without coupling logging payloads to the adapter. */
export function logGambleSiteEntered(
  site: SiteState & { type: "Gamble" },
): void {
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
  sitesData: SitesData,
): void {
  if (runtime.gameId === "blackjack" && view.gameId === "blackjack") {
    logEventOnce(
      `Gamble:${siteId}:blackjack-prepared:${runtime.shuffleCommitment}`,
      "gamble_game_prepared",
      {
        siteId,
        gameId: runtime.gameId,
        rulesVersion: runtime.rulesVersion,
        sitesFoldHash: sitesData.foldHash,
        isFarpoint: runtime.isFarpoint,
        wagerCost: runtime.wagerCost,
        prizeEssence: runtime.prizeEssence,
        attemptNumber: runtime.attemptNumber,
        maxAttempts: BLACKJACK_MAX_ATTEMPTS,
        shuffleCommitment: runtime.shuffleCommitment,
        openingDealOrder: ["player", "dealer", "player", "dealer"],
        dealerRule: "stand-soft-17",
        winReward: economyData.gamble.blackjack.prizeEssence,
        pushReward: runtime.wagerCost,
      },
    );
    return;
  }
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
        sitesFoldHash: sitesData.foldHash,
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
        outcomes: sitesData.gamble.fourSuitReprise.outcomes.map((rule) => ({
          suit: rule.suit,
          outcome: rule.outcome,
        })),
        oddsNumerator: sitesData.gamble.fourSuitReprise.oddsNumerator,
        oddsDenominator: sitesData.gamble.fourSuitReprise.oddsDenominator,
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
        sitesFoldHash: sitesData.foldHash,
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

  if (runtime.gameId === "starway-stairs" && view.gameId === "starway-stairs") {
    logEventOnce(
      `Gamble:${siteId}:prepared:${runtime.shuffleCommitments.join(":")}`,
      "gamble_game_prepared",
      {
        siteId,
        gameId: runtime.gameId,
        rulesVersion: runtime.rulesVersion,
        sitesFoldHash: sitesData.foldHash,
        roundNumber: runtime.roundNumber,
        playerDecision: runtime.roundNumber === 1 ? "initial" : "play_again",
        isFarpoint: runtime.isFarpoint,
        wagerAmount: runtime.wagerAmount,
        shuffleCommitments: runtime.shuffleCommitments,
        tiers: sitesData.gamble.starwayStairs.tiers.map((tier) => ({
          tierNumber: tier.tier,
          bustOddsNumerator: tier.bustOddsNumerator,
          oddsDenominator: tier.oddsDenominator,
          highestBustRank: tier.highestBustRank,
          rewardEssence: starwayStairsEssenceReward(
            economyData.gamble.starwayStairs,
            tier.tier,
          ),
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
      sitesFoldHash: sitesData.foldHash,
      isFarpoint: runtime.isFarpoint,
      shuffleCommitments: runtime.shuffleCommitments,
      dreamsignCandidates: runtime.dreamsignCandidateScores,
      strongPoolSize: runtime.strongPoolSize,
      strongPoolCutoffScore: runtime.strongPoolCutoffScore,
      selectedDreamsignId: runtime.rewardDreamsign?.id ?? null,
      rewardEssence: economyData.gamble.ladderClimb.winEssence,
      attempts: sitesData.gamble.ladderClimb.attempts.map((attempt) => ({
        attemptNumber: attempt.attempt,
        cost: tidemarkLadderClimbAttemptCost(
          economyData.gamble.ladderClimb,
          attempt.attempt,
          runtime.isFarpoint,
        ),
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
  sitesData: SitesData,
): void {
  if (runtime.gameId === "blackjack" && view.gameId === "blackjack") {
    if (!runtime.wagerPaid || runtime.playerDecision === null) return;
    const visibleDealerCards = runtime.dealerRevealed
      ? runtime.dealerCards
      : runtime.dealerCards.slice(0, 1);
    logEventOnce(
      `Gamble:${siteId}:blackjack-state:${runtime.shuffleCommitment}:${String(runtime.deckCursor)}:${runtime.playerDecision}:${runtime.outcome ?? "playing"}`,
      "gamble_wager_resolved",
      {
        siteId,
        gameId: runtime.gameId,
        rulesVersion: runtime.rulesVersion,
        sitesFoldHash: sitesData.foldHash,
        attemptNumber: runtime.attemptNumber,
        playerDecision: runtime.playerDecision,
        payment: runtime.playerDecision === "deal" ? runtime.wagerCost : 0,
        playerCards: runtime.playerCards,
        playerTotal: blackjackHandTotal(runtime.playerCards),
        dealerCards: visibleDealerCards,
        dealerTotal: blackjackHandTotal(visibleDealerCards),
        dealerRevealed: runtime.dealerRevealed,
        deckCursor: runtime.deckCursor,
        outcome: runtime.outcome,
      },
    );
    return;
  }
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
        sitesFoldHash: sitesData.foldHash,
        oddsNumerator: sitesData.gamble.fourSuitReprise.oddsNumerator,
        oddsDenominator: sitesData.gamble.fourSuitReprise.oddsDenominator,
      },
    );
    return;
  }
  if (
    runtime.gameId === "gravok-three-gate-wager" &&
    view.gameId === "gravok-three-gate-wager"
  ) {
    if (runtime.result === null) return;
    const gate = view.gates.find(
      (entry) => entry.id === runtime.result?.gateId,
    );
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
        pendingDreamsignReplacement: runtime.result.pendingDreamsignReplacement,
      },
    );
    return;
  }

  if (runtime.gameId === "starway-stairs") {
    const result = runtime.results[runtime.results.length - 1];
    if (result === undefined) return;
    const tier = starwayStairsTierRule(
      sitesData.gamble.starwayStairs,
      result.tierNumber,
    );
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
        prizeAtRisk: starwayStairsEssenceReward(
          economyData.gamble.starwayStairs,
          result.tierNumber,
        ),
      },
    );
    return;
  }

  if (runtime.gameId !== "tidemark-ladder-climb") return;
  const result = runtime.result;
  if (result === null) return;
  const attempt =
    sitesData.gamble.ladderClimb.attempts[result.attemptNumber - 1];
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
      essenceGained: result.won ? economyData.gamble.ladderClimb.winEssence : 0,
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
  sitesData: SitesData,
): void {
  if (runtime.gameId === "blackjack") {
    if (!runtime.resultSettled) return;
    logEventOnce(
      `Gamble:${siteId}:blackjack-settled:${runtime.shuffleCommitment}`,
      "gamble_wager_settled",
      {
        siteId,
        gameId: runtime.gameId,
        rulesVersion: runtime.rulesVersion,
        sitesFoldHash: sitesData.foldHash,
        attemptNumber: runtime.attemptNumber,
        playerTotal: blackjackHandTotal(runtime.playerCards),
        dealerTotal: blackjackHandTotal(runtime.dealerCards),
        outcome: runtime.outcome,
        wagerPayment: runtime.wagerCost,
        essenceGained: runtime.essenceAwarded,
        netEssenceChange: runtime.essenceAwarded - runtime.wagerCost,
      },
    );
    return;
  }
  if (runtime.gameId === "four-suit-reprise") {
    const result = runtime.rounds[runtime.rounds.length - 1];
    if (result === undefined || !result.resultSettled) return;
    logEventOnce(
      `Gamble:${siteId}:four-suit-settled:${result.shuffleCommitment}`,
      "gamble_wager_settled",
      {
        siteId,
        gameId: runtime.gameId,
        sitesFoldHash: sitesData.foldHash,
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
  if (
    runtime.gameId === "gravok-three-gate-wager" &&
    view.gameId === "gravok-three-gate-wager"
  ) {
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
        prizeAtRisk: starwayStairsEssenceReward(
          economyData.gamble.starwayStairs,
          result.tierNumber,
        ),
        prizeAwarded: runtime.prizeAwarded,
        payment: runtime.wagerAmount,
      },
    );
    return;
  }

  if (
    runtime.gameId !== "tidemark-ladder-climb" ||
    runtime.result?.resultSettled !== true
  )
    return;
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
        ? (runtime.rewardDreamsign?.id ?? null)
        : null,
      dreamsignAwarded: runtime.result.dreamsignAwarded,
      pendingDreamsignReplacement: runtime.result.pendingDreamsignReplacement,
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

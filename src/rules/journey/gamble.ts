// Pure reducer cases for Gravok's Three-Gate Wager.

import {
  gravokGateEssenceReward,
  gravokGateRule,
  rankWinsGravokGate,
} from "../../data/gravok-wager";
import {
  nextTidemarkLadderClimbAttemptNumber,
  rankWinsTidemarkLadderClimbAttempt,
  tidemarkLadderClimbAttemptCost,
} from "../../data/tidemark-ladder-climb";
import {
  rankBustsStarwayStairsTier,
  nextStarwayStairsTierNumber,
  starwayStairsEssenceReward,
} from "../../data/starway-stairs";
import {
  eligibleFourSuitRepriseTargets,
  fourSuitRepriseOutcomeForSuit,
} from "../../data/four-suit-reprise";
import {
  blackjackEssenceAward,
  blackjackHandValue,
  blackjackOpeningOutcome,
  resolveBlackjackDealer,
} from "../../data/blackjack";
import { gambleGameByRulesKind } from "../../data/gamble-data";
import type { GambleRulesKind } from "../../types/gamble-data";
import { isGravokGateId } from "../../types/gamble";
import type {
  DeckEntry,
  FourSuitRepriseRound,
  FourSuitRepriseSiteRuntime,
  GambleSiteRuntime,
  GravokWagerSiteRuntime,
  BlackjackSiteRuntime,
  JourneyState,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
  TransfigurationType,
} from "../../types/journey";
import type { EventContext } from "../../eventlog/types";
import { mintEntryId } from "./deck";
import { findSite, getSiteContentProvider } from "./sites";
import type { SiteId } from "../../types/identifiers";
import { siteIdFromUnknown } from "../../types/identifiers";
import { shuffleCommitmentFromUnknown } from "../../types/identifiers";
import { dreamsignIdFromUnknown } from "../../types/identifiers";
import { deckEntryIdFromUnknown } from "../../types/identifiers";


function configuredGame<Kind extends GambleRulesKind>(kind: Kind) {
  const data = getSiteContentProvider()?.gambleData;
  return data === undefined ? null : gambleGameByRulesKind(data, kind);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function runtimeFor(
  journey: JourneyState,
  siteId: SiteId,
): GambleSiteRuntime | null {
  const site = findSite(journey, siteId);
  const runtime = journey.siteRuntime[siteId];
  if (
    site?.type !== "Gamble" ||
    site.isVisited ||
    journey.visitedSites.includes(siteId) ||
    journey.activeSiteId !== siteId ||
    journey.screen.type !== "site" ||
    journey.screen.siteId !== siteId ||
    runtime?.kind !== "gamble"
  ) {
    return null;
  }
  return runtime;
}

function withRuntime(
  journey: JourneyState,
  siteId: SiteId,
  runtime: GambleSiteRuntime,
): JourneyState {
  return {
    ...journey,
    siteRuntime: { ...journey.siteRuntime, [siteId]: runtime },
  };
}

function gravokRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): GravokWagerSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "gravok-three-gate-wager" ? runtime : null;
}

function tidemarkRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): TidemarkLadderClimbSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "tidemark-ladder-climb" ? runtime : null;
}

function starwayRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): StarwayStairsSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "starway-stairs" ? runtime : null;
}

function fourSuitRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): FourSuitRepriseSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "four-suit-reprise" ? runtime : null;
}

function blackjackRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): BlackjackSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "blackjack" ? runtime : null;
}

function latestFourSuitRound(runtime: FourSuitRepriseSiteRuntime) {
  return runtime.rounds[runtime.rounds.length - 1] ?? null;
}

function remainingFourSuitTargets(
  journey: JourneyState,
  runtime: FourSuitRepriseSiteRuntime,
) {
  return eligibleFourSuitRepriseTargets({
    targets: runtime.targets,
    deck: journey.deck,
    usedCardIds: runtime.rounds.map((round) => round.targetCardId),
  });
}

/** Pay the wager and deal two cards each, leaving the dealer's hole card hidden. */
export function dealBlackjack(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  const runtime = blackjackRuntimeFor(journey, siteId);
  if (
    runtime === null ||
    runtime.wagerPaid ||
    runtime.playerCards.length > 0 ||
    runtime.dealerCards.length > 0 ||
    journey.essence < runtime.wagerCost
  ) {
    return null;
  }
  const playerCards = [runtime.committedDeck[0], runtime.committedDeck[2]];
  const dealerCards = [runtime.committedDeck[1], runtime.committedDeck[3]];
  if (
    playerCards.some((card) => card === undefined) ||
    dealerCards.some((card) => card === undefined)
  ) {
    return null;
  }
  const safePlayerCards = playerCards;
  const safeDealerCards = dealerCards;
  const game = configuredGame("blackjack");
  if (game === null) return null;
  const outcome = blackjackOpeningOutcome(
    safePlayerCards,
    safeDealerCards,
    game.rules.target,
  );
  return withRuntime(
    { ...journey, essence: journey.essence - runtime.wagerCost },
    siteId,
    {
      ...runtime,
      wagerPaid: true,
      deckCursor: 4,
      playerCards: safePlayerCards,
      dealerCards: safeDealerCards,
      dealerRevealed: outcome !== null,
      playerDecision: "deal",
      outcome,
    },
  );
}

/** Reveal one free player card; 21 advances directly through the dealer turn. */
export function hitBlackjack(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  const runtime = blackjackRuntimeFor(journey, siteId);
  if (runtime === null || !runtime.wagerPaid || runtime.outcome !== null) {
    return null;
  }
  const card = runtime.committedDeck[runtime.deckCursor];
  if (card === undefined) return null;
  const playerCards = [...runtime.playerCards, card];
  const game = configuredGame("blackjack");
  if (game === null) return null;
  const playerValue = blackjackHandValue(playerCards, game.rules.target);
  const deckCursor = runtime.deckCursor + 1;
  const dealerResolution =
    playerValue.total === 21 || playerValue.isBust
      ? resolveBlackjackDealer(
          playerCards,
          runtime.dealerCards,
          runtime.committedDeck,
          deckCursor,
          game.rules,
        )
      : null;
  if (
    (playerValue.total === 21 || playerValue.isBust) &&
    dealerResolution === null
  ) {
    return null;
  }
  return withRuntime(journey, siteId, {
    ...runtime,
    deckCursor: dealerResolution?.deckCursor ?? deckCursor,
    playerCards,
    dealerCards: dealerResolution?.dealerCards ?? runtime.dealerCards,
    dealerRevealed: dealerResolution !== null,
    playerDecision: "hit",
    outcome: dealerResolution?.outcome ?? null,
  });
}

/** End the player turn, reveal the hole card, and resolve the dealer's draws. */
export function standBlackjack(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  const runtime = blackjackRuntimeFor(journey, siteId);
  const game = configuredGame("blackjack");
  if (
    runtime === null ||
    game === null ||
    !runtime.wagerPaid ||
    runtime.outcome !== null
  ) {
    return null;
  }
  const resolution = resolveBlackjackDealer(
    runtime.playerCards,
    runtime.dealerCards,
    runtime.committedDeck,
    runtime.deckCursor,
    game.rules,
  );
  if (resolution === null) return null;
  return withRuntime(journey, siteId, {
    ...runtime,
    deckCursor: resolution.deckCursor,
    dealerCards: resolution.dealerCards,
    dealerRevealed: true,
    playerDecision: "stand",
    outcome: resolution.outcome,
  });
}

/** Apply the flat win prize, push refund, or zero dealer-win payout. */
export function settleBlackjack(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const shuffleCommitment = shuffleCommitmentFromUnknown(
    payload.shuffleCommitment,
  );
  if (siteId === null || shuffleCommitment === null) return null;
  const runtime = blackjackRuntimeFor(journey, siteId);
  if (
    runtime === null ||
    runtime.shuffleCommitment !== shuffleCommitment ||
    runtime.outcome === null ||
    runtime.resultSettled
  ) {
    return null;
  }
  const essenceAwarded = blackjackEssenceAward(
    runtime.wagerCost,
    runtime.prizeEssence,
    runtime.outcome,
  );

  return withRuntime(
    {
      ...journey,
      essence: journey.essence + essenceAwarded,
    },
    siteId,
    {
      ...runtime,
      resultSettled: true,
      essenceAwarded,
    },
  );
}

/** Start another paid hand after a push or an eligible loss. */
export function playAgainBlackjack(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const previousShuffleCommitment = shuffleCommitmentFromUnknown(
    payload.previousShuffleCommitment,
  );
  if (siteId === null || previousShuffleCommitment === null) return null;

  const runtime = blackjackRuntimeFor(journey, siteId);
  const site = findSite(journey, siteId);
  const provider = getSiteContentProvider();
  const game = configuredGame("blackjack");
  const consumesAttempt = runtime?.outcome === "dealer-win";
  const replayEligible =
    runtime?.outcome === "push" ||
    (consumesAttempt &&
      game !== null &&
      runtime.attemptNumber < game.rules.maxAttempts);
  if (
    runtime === null ||
    site?.type !== "Gamble" ||
    provider === null ||
    game === null ||
    runtime.shuffleCommitment !== previousShuffleCommitment ||
    !replayEligible ||
    !runtime.resultSettled
  ) {
    return null;
  }

  const generated = provider.openSite({
    journey,
    site,
    rng: ctx.rng,
    gambleGameId: "blackjack",
  });
  if (
    generated?.runtime.kind !== "gamble" ||
    generated.runtime.gameId !== "blackjack"
  ) {
    return null;
  }

  const nextRuntime: BlackjackSiteRuntime = {
    ...generated.runtime,
    attemptNumber: consumesAttempt
      ? runtime.attemptNumber + 1
      : runtime.attemptNumber,
  };
  return dealBlackjack(withRuntime(journey, siteId, nextRuntime), { siteId });
}

/**
 * Commit one chosen gate. The intent carries only the gate id; cost, draw,
 * threshold, payout, and Dreamsign handling derive from the locked runtime.
 */
export function placeGravokWager(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const rawGateId = asString(payload.gateId);
  if (siteId === null || !isGravokGateId(rawGateId)) {
    return null;
  }

  const gateId = rawGateId;
  const runtime = gravokRuntimeFor(journey, siteId);
  if (runtime === null || runtime.result !== null) return null;
  const game = configuredGame("threeGate");
  if (game === null) return null;
  if (journey.essence < runtime.wagerCost) return null;

  const gate = gravokGateRule(game.rules, gateId);
  if (
    gate.awardsDreamsign &&
    (runtime.rewardDreamsign === null || journey.maxDreamsigns === 0)
  ) {
    return null;
  }

  const won = rankWinsGravokGate(
    game.rules,
    runtime.committedCard.rank,
    gateId,
  );
  const essenceGained = won ? gravokGateEssenceReward(game.economy, gateId) : 0;
  const winsDreamsign = won && gate.awardsDreamsign;
  const needsReplacement =
    winsDreamsign && journey.dreamsigns.length >= journey.maxDreamsigns;
  const rewardDreamsign = winsDreamsign ? runtime.rewardDreamsign : null;
  const rewardDreamsignId = rewardDreamsign?.id;
  if (
    winsDreamsign &&
    (rewardDreamsign === null || rewardDreamsignId === undefined)
  ) {
    return null;
  }

  const dreamsigns =
    rewardDreamsign === null || needsReplacement
      ? journey.dreamsigns
      : [...journey.dreamsigns, rewardDreamsign];
  const remainingDreamsignPool =
    rewardDreamsignId === undefined
      ? journey.remainingDreamsignPool
      : journey.remainingDreamsignPool.filter((id) => id !== rewardDreamsignId);
  const nextRuntime: GambleSiteRuntime = {
    ...runtime,
    result: {
      gateId,
      card: runtime.committedCard,
      won,
      essenceGained,
      essenceSettled: false,
      dreamsignAwarded: rewardDreamsign !== null && !needsReplacement,
      pendingDreamsignReplacement: needsReplacement,
    },
  };

  return withRuntime(
    {
      ...journey,
      essence: journey.essence - runtime.wagerCost,
      dreamsigns,
      remainingDreamsignPool,
    },
    siteId,
    nextRuntime,
  );
}

/** Apply the wager's payout when its result announcement appears. */
export function settleGravokWager(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const shuffleCommitment = shuffleCommitmentFromUnknown(
    payload.shuffleCommitment,
  );
  if (siteId === null || shuffleCommitment === null) return null;

  const runtime = gravokRuntimeFor(journey, siteId);
  if (
    runtime === null ||
    runtime.shuffleCommitment !== shuffleCommitment ||
    runtime.result === null ||
    runtime.result.essenceSettled !== false
  ) {
    return null;
  }

  return withRuntime(
    {
      ...journey,
      essence: journey.essence + runtime.result.essenceGained,
    },
    siteId,
    {
      ...runtime,
      result: { ...runtime.result, essenceSettled: true },
    },
  );
}

/** Reassemble the deck and prepare another independently committed wager. */
export function playAgainGravokWager(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const previousShuffleCommitment = shuffleCommitmentFromUnknown(
    payload.previousShuffleCommitment,
  );
  if (siteId === null || previousShuffleCommitment === null) return null;

  const runtime = gravokRuntimeFor(journey, siteId);
  const site = findSite(journey, siteId);
  const provider = getSiteContentProvider();
  const game = configuredGame("threeGate");
  const roundNumber = runtime?.roundNumber ?? 1;
  if (
    runtime === null ||
    site?.type !== "Gamble" ||
    provider === null ||
    game === null ||
    runtime.shuffleCommitment !== previousShuffleCommitment ||
    runtime.result === null ||
    runtime.result.essenceSettled !== true ||
    runtime.result.pendingDreamsignReplacement ||
    roundNumber > game.rules.maxRetries
  ) {
    return null;
  }

  const generated = provider.openSite({
    journey,
    site,
    rng: ctx.rng,
    gambleGameId: "gravok-three-gate-wager",
  });
  if (
    generated?.runtime.kind !== "gamble" ||
    generated.runtime.gameId !== "gravok-three-gate-wager"
  ) {
    return null;
  }

  return withRuntime(journey, siteId, {
    ...generated.runtime,
    roundNumber: roundNumber + 1,
  });
}

/** Replace one held Dreamsign after a winning Jack Gate wager at the cap. */
export function replaceGravokWagerDreamsign(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const replacedDreamsignId = dreamsignIdFromUnknown(
    payload.replacedDreamsignId,
  );
  if (siteId === null || replacedDreamsignId === null) return null;

  const runtime = gravokRuntimeFor(journey, siteId);
  if (
    runtime === null ||
    runtime.rewardDreamsign === null ||
    runtime.result === null ||
    !runtime.result.won ||
    runtime.result.gateId !== "jack" ||
    runtime.result.essenceSettled === false ||
    !runtime.result.pendingDreamsignReplacement
  ) {
    return null;
  }

  const replaceIndex = journey.dreamsigns.findIndex(
    (dreamsign) => dreamsign.id === replacedDreamsignId,
  );
  if (replaceIndex < 0) return null;

  const dreamsigns = journey.dreamsigns.map((dreamsign, index) =>
    index === replaceIndex ? runtime.rewardDreamsign! : dreamsign,
  );
  const nextRuntime: GambleSiteRuntime = {
    ...runtime,
    result: {
      ...runtime.result,
      dreamsignAwarded: true,
      pendingDreamsignReplacement: false,
      replacedDreamsignId,
    },
  };
  return withRuntime({ ...journey, dreamsigns }, siteId, nextRuntime);
}

/** Buy and reveal the next independently committed Ladder Climb attempt. */
export function drawTidemarkLadderClimb(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;

  const runtime = tidemarkRuntimeFor(journey, siteId);
  if (runtime === null) return null;
  const game = configuredGame("ladderClimb");
  if (game === null) return null;
  if (journey.maxDreamsigns === 0) return null;

  const attemptNumber = nextTidemarkLadderClimbAttemptNumber(
    game.rules,
    runtime,
  );
  if (attemptNumber === null) return null;
  const card = runtime.committedCards[attemptNumber - 1];
  const shuffleCommitment = runtime.shuffleCommitments[attemptNumber - 1];
  if (card === undefined || shuffleCommitment === undefined) return null;

  const costPaid = tidemarkLadderClimbAttemptCost(
    game.economy,
    attemptNumber,
    runtime.isFarpoint,
  );
  if (journey.essence < costPaid) return null;
  const cumulativeCost = runtime.cumulativeCost + costPaid;
  const won = rankWinsTidemarkLadderClimbAttempt(
    game.rules,
    card.rank,
    attemptNumber,
  );

  return withRuntime(
    { ...journey, essence: journey.essence - costPaid },
    siteId,
    {
      ...runtime,
      revealedCards: [...runtime.revealedCards, card],
      cumulativeCost,
      result: {
        attemptNumber,
        card,
        won,
        costPaid,
        cumulativeCost,
        resultSettled: false,
        dreamsignAwarded: false,
        pendingDreamsignReplacement: false,
      },
    },
  );
}

/**
 * Settle the revealed Ladder Climb result at the outcome moment, granting
 * its locked Dreamsign only after a win becomes visible.
 */
export function settleTidemarkLadderClimb(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const shuffleCommitment = shuffleCommitmentFromUnknown(
    payload.shuffleCommitment,
  );
  if (siteId === null || shuffleCommitment === null) return null;

  const runtime = tidemarkRuntimeFor(journey, siteId);
  const result = runtime?.result ?? null;
  const game = configuredGame("ladderClimb");
  if (
    runtime === null ||
    game === null ||
    result === null ||
    result.resultSettled ||
    runtime.shuffleCommitments[result.attemptNumber - 1] !== shuffleCommitment
  ) {
    return null;
  }

  if (!result.won) {
    return withRuntime(journey, siteId, {
      ...runtime,
      result: { ...result, resultSettled: true },
    });
  }

  const rewardDreamsign = runtime.rewardDreamsign;
  const rewardDreamsignId = rewardDreamsign.id;
  const needsReplacement = journey.dreamsigns.length >= journey.maxDreamsigns;
  const dreamsigns = needsReplacement
    ? journey.dreamsigns
    : [...journey.dreamsigns, rewardDreamsign];
  const remainingDreamsignPool = journey.remainingDreamsignPool.filter(
    (id) => id !== rewardDreamsignId,
  );

  return withRuntime(
    {
      ...journey,
      essence: journey.essence + game.economy.winEssence,
      dreamsigns,
      remainingDreamsignPool,
    },
    siteId,
    {
      ...runtime,
      result: {
        ...result,
        resultSettled: true,
        dreamsignAwarded: !needsReplacement,
        pendingDreamsignReplacement: needsReplacement,
      },
    },
  );
}

/** Replace one held Dreamsign after a settled Ladder Climb win at the cap. */
export function replaceTidemarkLadderClimbDreamsign(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const replacedDreamsignId = dreamsignIdFromUnknown(
    payload.replacedDreamsignId,
  );
  if (siteId === null || replacedDreamsignId === null) return null;

  const runtime = tidemarkRuntimeFor(journey, siteId);
  if (
    runtime === null ||
    runtime.result === null ||
    !runtime.result.won ||
    !runtime.result.resultSettled ||
    !runtime.result.pendingDreamsignReplacement
  ) {
    return null;
  }

  const replaceIndex = journey.dreamsigns.findIndex(
    (dreamsign) => dreamsign.id === replacedDreamsignId,
  );
  if (replaceIndex < 0) return null;
  const dreamsigns = journey.dreamsigns.map((dreamsign, index) =>
    index === replaceIndex ? runtime.rewardDreamsign : dreamsign,
  );

  return withRuntime({ ...journey, dreamsigns }, siteId, {
    ...runtime,
    result: {
      ...runtime.result,
      dreamsignAwarded: true,
      pendingDreamsignReplacement: false,
      replacedDreamsignId,
    },
  });
}

/** Pay the tier wager, when applicable, and reveal the current Starway tier. */
export function drawStarwayStairs(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  const runtime = starwayRuntimeFor(journey, siteId);
  const game = configuredGame("starwayStairs");
  if (runtime === null || game === null) return null;

  const tierNumber = nextStarwayStairsTierNumber(game.rules, runtime);
  if (tierNumber === null) return null;
  const card = runtime.committedCards[tierNumber - 1];
  const commitment = runtime.shuffleCommitments[tierNumber - 1];
  if (card === undefined || commitment === undefined) return null;

  if (journey.essence < runtime.wagerAmount) return null;
  const busted = rankBustsStarwayStairsTier(game.rules, card.rank, tierNumber);
  return withRuntime(
    { ...journey, essence: journey.essence - runtime.wagerAmount },
    siteId,
    {
      ...runtime,
      results: [
        ...runtime.results,
        { tierNumber, card, busted, resultSettled: false },
      ],
    },
  );
}

/** Settle the visible Starway result, including a bust or automatic top prize. */
export function settleStarwayStairs(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const shuffleCommitment = shuffleCommitmentFromUnknown(
    payload.shuffleCommitment,
  );
  if (siteId === null || shuffleCommitment === null) return null;
  const runtime = starwayRuntimeFor(journey, siteId);
  const result = runtime?.results[runtime.results.length - 1];
  const game = configuredGame("starwayStairs");
  if (
    runtime === null ||
    game === null ||
    result === undefined ||
    result.resultSettled ||
    runtime.shuffleCommitments[result.tierNumber - 1] !== shuffleCommitment
  ) {
    return null;
  }

  const reachedTop =
    !result.busted && result.tierNumber === game.rules.tiers.length;
  const prizeAwarded = reachedTop
    ? starwayStairsEssenceReward(game.economy, result.tierNumber)
    : 0;
  const nextResults = runtime.results.map((entry, index) =>
    index === runtime.results.length - 1
      ? { ...entry, resultSettled: true }
      : entry,
  );
  return withRuntime(
    { ...journey, essence: journey.essence + prizeAwarded },
    siteId,
    {
      ...runtime,
      results: nextResults,
      terminalReason: result.busted ? "bust" : reachedTop ? "top" : null,
      prizeAwarded,
    },
  );
}

/** Bank the latest safe tier's prize and end the Starway Stairs game. */
export function cashOutStarwayStairs(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const shuffleCommitment = shuffleCommitmentFromUnknown(
    payload.shuffleCommitment,
  );
  if (siteId === null || shuffleCommitment === null) return null;
  const runtime = starwayRuntimeFor(journey, siteId);
  const result = runtime?.results[runtime.results.length - 1];
  const game = configuredGame("starwayStairs");
  if (
    runtime === null ||
    game === null ||
    result === undefined ||
    result.busted ||
    !result.resultSettled ||
    result.tierNumber >= game.rules.tiers.length ||
    runtime.terminalReason !== null ||
    runtime.shuffleCommitments[result.tierNumber - 1] !== shuffleCommitment
  ) {
    return null;
  }
  const prizeAwarded = starwayStairsEssenceReward(
    game.economy,
    result.tierNumber,
  );
  return withRuntime(
    { ...journey, essence: journey.essence + prizeAwarded },
    siteId,
    { ...runtime, terminalReason: "cashed-out", prizeAwarded },
  );
}

/** Prepare another independent configured-tier game after a terminal Starway round. */
export function playAgainStarwayStairs(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const previousShuffleCommitment = shuffleCommitmentFromUnknown(
    payload.previousShuffleCommitment,
  );
  if (siteId === null || previousShuffleCommitment === null) return null;

  const runtime = starwayRuntimeFor(journey, siteId);
  const site = findSite(journey, siteId);
  const provider = getSiteContentProvider();
  const game = configuredGame("starwayStairs");
  const latestResult = runtime?.results[runtime.results.length - 1];
  if (
    runtime === null ||
    site?.type !== "Gamble" ||
    provider === null ||
    game === null ||
    runtime.shuffleCommitments[0] !== previousShuffleCommitment ||
    runtime.terminalReason === null ||
    latestResult === undefined ||
    !latestResult.resultSettled ||
    runtime.roundNumber > game.rules.maxRetries
  ) {
    return null;
  }

  const generated = provider.openSite({
    journey,
    site,
    rng: ctx.rng,
    gambleGameId: "starway-stairs",
  });
  if (
    generated?.runtime.kind !== "gamble" ||
    generated.runtime.gameId !== "starway-stairs"
  ) {
    return null;
  }

  return withRuntime(journey, siteId, {
    ...generated.runtime,
    roundNumber: runtime.roundNumber + 1,
  });
}

/** Pay for one one-shot round and lock a UUID-backed deck target. */
export function drawFourSuitReprise(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (siteId === null || entryId === null) return null;

  const runtime = fourSuitRuntimeFor(journey, siteId);
  const game = configuredGame("fourSuitReprise");
  if (
    runtime === null ||
    game === null ||
    runtime.phase !== "choose" ||
    runtime.rounds.length >= game.rules.maxRounds ||
    journey.essence < runtime.drawCost
  ) {
    return null;
  }
  const target = remainingFourSuitTargets(journey, runtime).find(
    (candidate) => candidate.entryId === entryId,
  );
  const deckEntry = journey.deck.find(
    (candidate) => candidate.entryId === entryId,
  );
  if (
    target === undefined ||
    deckEntry === undefined ||
    deckEntry.cardNumber !== target.cardNumber ||
    deckEntry.isBane ||
    deckEntry.transfiguration !== null
  ) {
    return null;
  }

  const roundIndex = runtime.rounds.length;
  const card = runtime.committedCards[roundIndex];
  const shuffleCommitment = runtime.shuffleCommitments[roundIndex];
  if (card === undefined || shuffleCommitment === undefined) return null;
  const roundNumber = (roundIndex + 1) as 1 | 2 | 3;
  return withRuntime(
    { ...journey, essence: journey.essence - runtime.drawCost },
    siteId,
    {
      ...runtime,
      phase: "result",
      rounds: [
        ...runtime.rounds,
        {
          roundNumber,
          shuffleCommitment,
          card,
          targetEntryId: target.entryId,
          targetCardId: target.cardId,
          costPaid: runtime.drawCost,
          outcome: fourSuitRepriseOutcomeForSuit(game.rules, card.suit),
          resultRevealed: false,
          resultSettled: false,
          essenceGained: 0,
        },
      ],
    },
  );
}

/** Reveal the locked suit and atomically apply every non-Spades outcome. */
export function settleFourSuitReprise(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const shuffleCommitment = shuffleCommitmentFromUnknown(
    payload.shuffleCommitment,
  );
  if (siteId === null || shuffleCommitment === null) return null;

  const runtime = fourSuitRuntimeFor(journey, siteId);
  const game = configuredGame("fourSuitReprise");
  const round = runtime === null ? null : latestFourSuitRound(runtime);
  if (
    runtime === null ||
    game === null ||
    runtime.phase !== "result" ||
    round === null ||
    round.shuffleCommitment !== shuffleCommitment ||
    round.resultRevealed
  ) {
    return null;
  }
  const target = runtime.targets.find(
    (candidate) => candidate.entryId === round.targetEntryId,
  );
  const targetEntry = journey.deck.find(
    (candidate) => candidate.entryId === round.targetEntryId,
  );
  if (
    target === undefined ||
    targetEntry === undefined ||
    targetEntry.cardNumber !== target.cardNumber ||
    targetEntry.isBane ||
    targetEntry.transfiguration !== null
  )
    return null;

  let nextJourney = journey;
  let nextRound: FourSuitRepriseRound = { ...round, resultRevealed: true };
  if (round.outcome === "essence") {
    nextJourney = {
      ...journey,
      essence: journey.essence + game.economy.essenceReward,
    };
    nextRound = {
      ...nextRound,
      resultSettled: true,
      essenceGained: game.economy.essenceReward,
    };
  } else if (round.outcome === "duplication") {
    const duplicatedEntryId = mintEntryId(journey.deck, ctx.seq, 0);
    const copy: DeckEntry = {
      entryId: duplicatedEntryId,
      cardNumber: target.cardNumber,
      transfiguration: null,
      isBane: false,
    };
    nextJourney = { ...journey, deck: [...journey.deck, copy] };
    nextRound = {
      ...nextRound,
      resultSettled: true,
      duplicatedEntryId: duplicatedEntryId,
    };
  } else if (round.outcome === "purge") {
    nextJourney = {
      ...journey,
      deck: journey.deck.filter(
        (candidate) => candidate.entryId !== round.targetEntryId,
      ),
    };
    nextRound = { ...nextRound, resultSettled: true };
  }

  return withRuntime(nextJourney, siteId, {
    ...runtime,
    rounds: runtime.rounds.map((candidate, index) =>
      index === runtime.rounds.length - 1 ? nextRound : candidate,
    ),
  });
}

/** Apply the player's free chosen form after a Spades reveal. */
export function chooseFourSuitRepriseTransfiguration(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const shuffleCommitment = shuffleCommitmentFromUnknown(
    payload.shuffleCommitment,
  );
  const type = asString(payload.type) as TransfigurationType | null;
  if (siteId === null || shuffleCommitment === null || type === null) {
    return null;
  }

  const runtime = fourSuitRuntimeFor(journey, siteId);
  const game = configuredGame("fourSuitReprise");
  const round = runtime === null ? null : latestFourSuitRound(runtime);
  if (
    runtime === null ||
    game === null ||
    runtime.phase !== "result" ||
    round === null ||
    round.shuffleCommitment !== shuffleCommitment ||
    round.outcome !== "transfiguration" ||
    !round.resultRevealed ||
    round.resultSettled
  ) {
    return null;
  }
  const target = runtime.targets.find(
    (candidate) => candidate.entryId === round.targetEntryId,
  );
  const offer = target?.transfigurationOffers.find(
    (candidate) => candidate.type === type,
  );
  const targetEntry = journey.deck.find(
    (candidate) => candidate.entryId === round.targetEntryId,
  );
  if (
    target === undefined ||
    offer === undefined ||
    offer.essenceCost !== 0 ||
    targetEntry === undefined ||
    targetEntry.cardNumber !== target.cardNumber ||
    targetEntry.isBane ||
    targetEntry.transfiguration !== null
  ) {
    return null;
  }

  return withRuntime(
    {
      ...journey,
      deck: journey.deck.map((entry) =>
        entry.entryId === targetEntry.entryId
          ? { ...entry, transfiguration: offer.type }
          : entry,
      ),
    },
    siteId,
    {
      ...runtime,
      rounds: runtime.rounds.map((candidate, index) =>
        index === runtime.rounds.length - 1
          ? {
              ...candidate,
              resultSettled: true,
              chosenTransfiguration: offer.type,
            }
          : candidate,
      ),
    },
  );
}

/** Advance every client to a new card choice after a settled round. */
export function playAgainFourSuitReprise(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const previousShuffleCommitment = shuffleCommitmentFromUnknown(
    payload.previousShuffleCommitment,
  );
  if (siteId === null || previousShuffleCommitment === null) return null;

  const runtime = fourSuitRuntimeFor(journey, siteId);
  const game = configuredGame("fourSuitReprise");
  const round = runtime === null ? null : latestFourSuitRound(runtime);
  if (
    runtime === null ||
    game === null ||
    runtime.phase !== "result" ||
    round === null ||
    round.shuffleCommitment !== previousShuffleCommitment ||
    !round.resultSettled ||
    runtime.rounds.length >= game.rules.maxRounds ||
    remainingFourSuitTargets(journey, runtime).length === 0
  ) {
    return null;
  }
  return withRuntime(journey, siteId, { ...runtime, phase: "choose" });
}

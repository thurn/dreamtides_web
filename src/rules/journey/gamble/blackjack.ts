// Pure reducer cases for Blackjack.

import {
  blackjackEssenceAward,
  blackjackHandValue,
  blackjackOpeningOutcome,
  resolveBlackjackDealer,
} from "../../../data/blackjack";
import type { EventContext } from "../../../eventlog/types";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import type {
  BlackjackSiteRuntime,
  JourneyState,
} from "../../../types/journey";
import type { SiteId } from "../../../types/identifiers";
import {
  shuffleCommitmentFromUnknown,
  siteIdFromUnknown,
} from "../../../types/identifiers";
import { findSite, getSiteContentProvider } from "../sites";
import { configuredGame, runtimeFor, withRuntime } from "./shared";

function blackjackRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): BlackjackSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "blackjack" ? runtime : null;
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
    selectionRulesVersion: SELECTION_RULES_VERSION,
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

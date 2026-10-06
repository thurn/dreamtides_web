// Pure reducer cases for Starway Stairs.

import {
  nextStarwayStairsTierNumber,
  rankBustsStarwayStairsTier,
  starwayStairsEssenceReward,
} from "../../../data/starway-stairs";
import type { EventContext } from "../../../eventlog/types";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import type {
  JourneyState,
  StarwayStairsSiteRuntime,
} from "../../../types/journey";
import type { SiteId } from "../../../types/identifiers";
import {
  shuffleCommitmentFromUnknown,
  siteIdFromUnknown,
} from "../../../types/identifiers";
import { findSite, getSiteContentProvider } from "../sites";
import { configuredGame, runtimeFor, withRuntime } from "./shared";

function starwayRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): StarwayStairsSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "starway-stairs" ? runtime : null;
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
    selectionRulesVersion: SELECTION_RULES_VERSION,
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

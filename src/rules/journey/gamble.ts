// Pure reducer cases for Gravok's Three-Gate Wager.

import {
  gravokGateEssenceReward,
  gravokGateRule,
  GRAVOK_WAGER_MAX_RETRIES,
  rankWinsGravokGate,
} from "../../data/gravok-wager";
import {
  nextTidemarkLadderClimbAttemptNumber,
  rankWinsTidemarkLadderClimbAttempt,
  tidemarkLadderClimbAttemptCost,
} from "../../data/tidemark-ladder-climb";
import {
  rankBustsStarwayStairsTier,
  STARWAY_STAIRS_MAX_RETRIES,
  STARWAY_STAIRS_TIERS,
  nextStarwayStairsTierNumber,
  starwayStairsEssenceReward,
} from "../../data/starway-stairs";
import type {
  GravokGateId,
} from "../../types/gamble";
import type {
  GambleSiteRuntime,
  GravokWagerSiteRuntime,
  JourneyState,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
} from "../../types/journey";
import type { EventContext } from "../../eventlog/types";
import { findSite, getSiteContentProvider } from "./sites";

const GATE_IDS: ReadonlySet<string> = new Set(["six", "nine", "jack"]);

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function runtimeFor(
  journey: JourneyState,
  siteId: string,
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
  siteId: string,
  runtime: GambleSiteRuntime,
): JourneyState {
  return {
    ...journey,
    siteRuntime: { ...journey.siteRuntime, [siteId]: runtime },
  };
}

function gravokRuntimeFor(
  journey: JourneyState,
  siteId: string,
): GravokWagerSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "gravok-three-gate-wager" ? runtime : null;
}

function tidemarkRuntimeFor(
  journey: JourneyState,
  siteId: string,
): TidemarkLadderClimbSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "tidemark-ladder-climb" ? runtime : null;
}

function starwayRuntimeFor(
  journey: JourneyState,
  siteId: string,
): StarwayStairsSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "starway-stairs" ? runtime : null;
}

/**
 * Commit one chosen gate. The intent carries only the gate id; cost, draw,
 * threshold, payout, and Dreamsign handling derive from the locked runtime.
 */
export function placeGravokWager(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const rawGateId = asString(payload.gateId);
  if (
    siteId === null ||
    rawGateId === null ||
    !GATE_IDS.has(rawGateId)
  ) {
    return null;
  }

  const gateId = rawGateId as GravokGateId;
  const runtime = gravokRuntimeFor(journey, siteId);
  if (runtime === null || runtime.result !== null) return null;
  const economy = getSiteContentProvider()?.economyData?.gamble.threeGate;
  if (economy === undefined) return null;
  if (journey.essence < runtime.wagerCost) return null;

  const gate = gravokGateRule(gateId);
  if (
    gate.awardsDreamsign &&
    (runtime.rewardDreamsign === null || journey.maxDreamsigns === 0)
  ) {
    return null;
  }

  const won = rankWinsGravokGate(runtime.committedCard.rank, gateId);
  const essenceGained = won ? gravokGateEssenceReward(economy, gateId) : 0;
  const winsDreamsign = won && gate.awardsDreamsign;
  const needsReplacement =
    winsDreamsign && journey.dreamsigns.length >= journey.maxDreamsigns;
  const rewardDreamsign = winsDreamsign ? runtime.rewardDreamsign : null;
  const rewardDreamsignId = rewardDreamsign?.id;
  if (winsDreamsign && (rewardDreamsign === null || rewardDreamsignId === undefined)) {
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
  const siteId = asString(payload.siteId);
  const shuffleCommitment = asString(payload.shuffleCommitment);
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
  const siteId = asString(payload.siteId);
  const previousShuffleCommitment = asString(
    payload.previousShuffleCommitment,
  );
  if (siteId === null || previousShuffleCommitment === null) return null;

  const runtime = gravokRuntimeFor(journey, siteId);
  const site = findSite(journey, siteId);
  const provider = getSiteContentProvider();
  const roundNumber = runtime?.roundNumber ?? 1;
  if (
    runtime === null ||
    site?.type !== "Gamble" ||
    provider === null ||
    runtime.shuffleCommitment !== previousShuffleCommitment ||
    runtime.result === null ||
    runtime.result.essenceSettled !== true ||
    runtime.result.pendingDreamsignReplacement ||
    roundNumber > GRAVOK_WAGER_MAX_RETRIES
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
  const siteId = asString(payload.siteId);
  const replacedDreamsignId = asString(payload.replacedDreamsignId);
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
  return withRuntime(
    { ...journey, dreamsigns },
    siteId,
    nextRuntime,
  );
}

/** Buy and reveal the next independently committed Ladder Climb attempt. */
export function drawTidemarkLadderClimb(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;

  const runtime = tidemarkRuntimeFor(journey, siteId);
  if (runtime === null) return null;
  const economy = getSiteContentProvider()?.economyData?.gamble.ladderClimb;
  if (economy === undefined) return null;
  if (journey.maxDreamsigns === 0) return null;

  const attemptNumber = nextTidemarkLadderClimbAttemptNumber(runtime);
  if (attemptNumber === null) return null;
  const card = runtime.committedCards[attemptNumber - 1];
  const shuffleCommitment = runtime.shuffleCommitments[attemptNumber - 1];
  if (card === undefined || shuffleCommitment === undefined) return null;

  const costPaid = tidemarkLadderClimbAttemptCost(economy, attemptNumber, runtime.isFarpoint);
  if (journey.essence < costPaid) return null;
  const cumulativeCost = runtime.cumulativeCost + costPaid;
  const won = rankWinsTidemarkLadderClimbAttempt(card.rank, attemptNumber);

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
  const siteId = asString(payload.siteId);
  const shuffleCommitment = asString(payload.shuffleCommitment);
  if (siteId === null || shuffleCommitment === null) return null;

  const runtime = tidemarkRuntimeFor(journey, siteId);
  const result = runtime?.result ?? null;
  const economy = getSiteContentProvider()?.economyData?.gamble.ladderClimb;
  if (
    runtime === null || economy === undefined ||
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
  const needsReplacement =
    journey.dreamsigns.length >= journey.maxDreamsigns;
  const dreamsigns = needsReplacement
    ? journey.dreamsigns
    : [...journey.dreamsigns, rewardDreamsign];
  const remainingDreamsignPool = journey.remainingDreamsignPool.filter(
    (id) => id !== rewardDreamsignId,
  );

  return withRuntime(
    {
      ...journey,
      essence: journey.essence + economy.winEssence,
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
  const siteId = asString(payload.siteId);
  const replacedDreamsignId = asString(payload.replacedDreamsignId);
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

  return withRuntime(
    { ...journey, dreamsigns },
    siteId,
    {
      ...runtime,
      result: {
        ...runtime.result,
        dreamsignAwarded: true,
        pendingDreamsignReplacement: false,
        replacedDreamsignId,
      },
    },
  );
}

/** Pay the tier wager, when applicable, and reveal the current Starway tier. */
export function drawStarwayStairs(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  const runtime = starwayRuntimeFor(journey, siteId);
  if (runtime === null) return null;

  const tierNumber = nextStarwayStairsTierNumber(runtime);
  if (tierNumber === null) return null;
  const card = runtime.committedCards[tierNumber - 1];
  const commitment = runtime.shuffleCommitments[tierNumber - 1];
  if (card === undefined || commitment === undefined) return null;

  if (journey.essence < runtime.wagerAmount) return null;
  const busted = rankBustsStarwayStairsTier(card.rank, tierNumber);
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
  const siteId = asString(payload.siteId);
  const shuffleCommitment = asString(payload.shuffleCommitment);
  if (siteId === null || shuffleCommitment === null) return null;
  const runtime = starwayRuntimeFor(journey, siteId);
  const result = runtime?.results[runtime.results.length - 1];
  const economy = getSiteContentProvider()?.economyData?.gamble.starwayStairs;
  if (
    runtime === null || economy === undefined ||
    result === undefined ||
    result.resultSettled ||
    runtime.shuffleCommitments[result.tierNumber - 1] !== shuffleCommitment
  ) {
    return null;
  }

  const reachedTop =
    !result.busted && result.tierNumber === STARWAY_STAIRS_TIERS.length;
  const prizeAwarded = reachedTop
    ? starwayStairsEssenceReward(economy, result.tierNumber)
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
  const siteId = asString(payload.siteId);
  const shuffleCommitment = asString(payload.shuffleCommitment);
  if (siteId === null || shuffleCommitment === null) return null;
  const runtime = starwayRuntimeFor(journey, siteId);
  const result = runtime?.results[runtime.results.length - 1];
  const economy = getSiteContentProvider()?.economyData?.gamble.starwayStairs;
  if (
    runtime === null || economy === undefined ||
    result === undefined ||
    result.busted ||
    !result.resultSettled ||
    result.tierNumber >= STARWAY_STAIRS_TIERS.length ||
    runtime.terminalReason !== null ||
    runtime.shuffleCommitments[result.tierNumber - 1] !== shuffleCommitment
  ) {
    return null;
  }
  const prizeAwarded = starwayStairsEssenceReward(economy, result.tierNumber);
  return withRuntime(
    { ...journey, essence: journey.essence + prizeAwarded },
    siteId,
    { ...runtime, terminalReason: "cashed-out", prizeAwarded },
  );
}

/** Prepare another independent three-tier game after a terminal Starway round. */
export function playAgainStarwayStairs(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const previousShuffleCommitment = asString(
    payload.previousShuffleCommitment,
  );
  if (siteId === null || previousShuffleCommitment === null) return null;

  const runtime = starwayRuntimeFor(journey, siteId);
  const site = findSite(journey, siteId);
  const provider = getSiteContentProvider();
  const latestResult = runtime?.results[runtime.results.length - 1];
  if (
    runtime === null ||
    site?.type !== "Gamble" ||
    provider === null ||
    runtime.shuffleCommitments[0] !== previousShuffleCommitment ||
    runtime.terminalReason === null ||
    latestResult === undefined ||
    !latestResult.resultSettled ||
    runtime.roundNumber > STARWAY_STAIRS_MAX_RETRIES
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

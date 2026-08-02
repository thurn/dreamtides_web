// Pure reducer cases for Gravok's Three-Gate Wager.

import {
  gravokGateRule,
  GRAVOK_WAGER_MAX_RETRIES,
  rankWinsGravokGate,
} from "../../data/gravok-wager";
import {
  nextTidemarkAttemptNumber,
  rankWinsTidemarkAttempt,
  tidemarkAttemptCost,
} from "../../data/tidemark-progressive-draw";
import type { GravokGateId } from "../../types/gamble";
import type {
  GambleSiteRuntime,
  GravokWagerSiteRuntime,
  JourneyState,
  TidemarkProgressiveSiteRuntime,
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
): TidemarkProgressiveSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "tidemark-progressive-draw" ? runtime : null;
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
  if (journey.essence < runtime.wagerCost) return null;

  const gate = gravokGateRule(gateId);
  if (
    gate.awardsDreamsign &&
    (runtime.rewardDreamsign === null || journey.maxDreamsigns === 0)
  ) {
    return null;
  }

  const won = rankWinsGravokGate(runtime.committedCard.rank, gateId);
  const essenceGained = won ? gate.essenceReward : 0;
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

/** Buy and reveal the next independently committed Progressive Draw attempt. */
export function drawTidemarkProgressive(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;

  const runtime = tidemarkRuntimeFor(journey, siteId);
  if (runtime === null || runtime.rewardDreamsign === null) return null;
  if (journey.maxDreamsigns === 0) return null;

  const attemptNumber = nextTidemarkAttemptNumber(runtime);
  if (attemptNumber === null) return null;
  const card = runtime.committedCards[attemptNumber - 1];
  const shuffleCommitment = runtime.shuffleCommitments[attemptNumber - 1];
  if (card === undefined || shuffleCommitment === undefined) return null;

  const costPaid = tidemarkAttemptCost(attemptNumber, runtime.isFarpoint);
  if (journey.essence < costPaid) return null;
  const cumulativeCost = runtime.cumulativeCost + costPaid;
  const won = rankWinsTidemarkAttempt(card.rank, attemptNumber);

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
 * Settle the revealed Progressive Draw result at the outcome moment, granting
 * its locked Dreamsign only after a win becomes visible.
 */
export function settleTidemarkProgressive(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const shuffleCommitment = asString(payload.shuffleCommitment);
  if (siteId === null || shuffleCommitment === null) return null;

  const runtime = tidemarkRuntimeFor(journey, siteId);
  const result = runtime?.result ?? null;
  if (
    runtime === null ||
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
  const rewardDreamsignId = rewardDreamsign?.id;
  if (rewardDreamsign === null || rewardDreamsignId === undefined) return null;
  const needsReplacement =
    journey.dreamsigns.length >= journey.maxDreamsigns;
  const dreamsigns = needsReplacement
    ? journey.dreamsigns
    : [...journey.dreamsigns, rewardDreamsign];
  const remainingDreamsignPool = journey.remainingDreamsignPool.filter(
    (id) => id !== rewardDreamsignId,
  );

  return withRuntime(
    { ...journey, dreamsigns, remainingDreamsignPool },
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

/** Replace one held Dreamsign after a settled Progressive Draw win at the cap. */
export function replaceTidemarkProgressiveDreamsign(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const replacedDreamsignId = asString(payload.replacedDreamsignId);
  if (siteId === null || replacedDreamsignId === null) return null;

  const runtime = tidemarkRuntimeFor(journey, siteId);
  if (
    runtime === null ||
    runtime.rewardDreamsign === null ||
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
    index === replaceIndex ? runtime.rewardDreamsign! : dreamsign,
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

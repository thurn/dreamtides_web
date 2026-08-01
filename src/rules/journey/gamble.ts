// Pure reducer cases for Gravok's Three-Gate Wager.

import {
  gravokGateRule,
  GRAVOK_WAGER_MAX_RETRIES,
  rankWinsGravokGate,
} from "../../data/gravok-wager";
import type { GravokGateId } from "../../types/gamble";
import type {
  GambleSiteRuntime,
  JourneyState,
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
  const runtime = runtimeFor(journey, siteId);
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
      dreamsigns,
      remainingDreamsignPool,
    },
    siteId,
    nextRuntime,
  );
}

/** Apply the wager's cost and payout when its result announcement appears. */
export function settleGravokWager(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const shuffleCommitment = asString(payload.shuffleCommitment);
  if (siteId === null || shuffleCommitment === null) return null;

  const runtime = runtimeFor(journey, siteId);
  if (
    runtime === null ||
    runtime.shuffleCommitment !== shuffleCommitment ||
    runtime.result === null ||
    runtime.result.essenceSettled !== false ||
    journey.essence < runtime.wagerCost
  ) {
    return null;
  }

  return withRuntime(
    {
      ...journey,
      essence:
        journey.essence - runtime.wagerCost + runtime.result.essenceGained,
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

  const runtime = runtimeFor(journey, siteId);
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

  const generated = provider.openSite({ journey, site, rng: ctx.rng });
  if (generated?.runtime.kind !== "gamble") return null;

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

  const runtime = runtimeFor(journey, siteId);
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

// Pure reducer cases for Gravok's Three-Gate Wager.

import {
  gravokGateRule,
  rankWinsGravokGate,
} from "../../data/gravok-wager";
import type { GravokGateId } from "../../types/gamble";
import type {
  GambleSiteRuntime,
  JourneyState,
} from "../../types/journey";
import { completeJourneySite, findSite } from "./sites";

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
  const essenceAfterCost = journey.essence - runtime.wagerCost;
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
      dreamsignAwarded: rewardDreamsign !== null && !needsReplacement,
      pendingDreamsignReplacement: needsReplacement,
    },
  };

  return withRuntime(
    {
      ...journey,
      essence: essenceAfterCost + essenceGained,
      dreamsigns,
      remainingDreamsignPool,
    },
    siteId,
    nextRuntime,
  );
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
  const resolved = withRuntime(
    { ...journey, dreamsigns },
    siteId,
    nextRuntime,
  );
  return {
    ...completeJourneySite(resolved, siteId),
    screen: { type: "dreamscape" },
    activeSiteId: null,
  };
}

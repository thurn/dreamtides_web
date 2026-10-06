// Pure reducer cases for Gravok's Three-Gate Wager.

import {
  gravokGateEssenceReward,
  gravokGateRule,
  rankWinsGravokGate,
} from "../../../data/gravok-wager";
import type { EventContext } from "../../../eventlog/types";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import { isGravokGateId } from "../../../types/gamble";
import type {
  GambleSiteRuntime,
  GravokWagerSiteRuntime,
  JourneyState,
} from "../../../types/journey";
import type { SiteId } from "../../../types/identifiers";
import {
  dreamsignIdFromUnknown,
  shuffleCommitmentFromUnknown,
  siteIdFromUnknown,
} from "../../../types/identifiers";
import { findSite, getSiteContentProvider } from "../sites";
import { asString, configuredGame, runtimeFor, withRuntime } from "./shared";

function gravokRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): GravokWagerSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "gravok-three-gate-wager" ? runtime : null;
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
    selectionRulesVersion: SELECTION_RULES_VERSION,
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

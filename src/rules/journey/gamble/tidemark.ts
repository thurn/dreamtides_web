// Pure reducer cases for Tidemark's Ladder Climb.

import {
  nextTidemarkLadderClimbAttemptNumber,
  rankWinsTidemarkLadderClimbAttempt,
  tidemarkLadderClimbAttemptCost,
} from "../../../data/tidemark-ladder-climb";
import type {
  JourneyState,
  TidemarkLadderClimbSiteRuntime,
} from "../../../types/journey";
import type { SiteId } from "../../../types/identifiers";
import {
  dreamsignIdFromUnknown,
  shuffleCommitmentFromUnknown,
  siteIdFromUnknown,
} from "../../../types/identifiers";
import { configuredGame, runtimeFor, withRuntime } from "./shared";

function tidemarkRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): TidemarkLadderClimbSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "tidemark-ladder-climb" ? runtime : null;
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

// Pure reducer cases for Four-Suit Reprise.

import {
  eligibleFourSuitRepriseTargets,
  fourSuitRepriseOutcomeForSuit,
} from "../../../data/four-suit-reprise";
import type { EventContext } from "../../../eventlog/types";
import type {
  DeckEntry,
  FourSuitRepriseRound,
  FourSuitRepriseSiteRuntime,
  JourneyState,
  TransfigurationType,
} from "../../../types/journey";
import type { SiteId } from "../../../types/identifiers";
import {
  deckEntryIdFromUnknown,
  shuffleCommitmentFromUnknown,
  siteIdFromUnknown,
} from "../../../types/identifiers";
import { mintEntryId } from "../deck";
import { asString, configuredGame, runtimeFor, withRuntime } from "./shared";

function fourSuitRuntimeFor(
  journey: JourneyState,
  siteId: SiteId,
): FourSuitRepriseSiteRuntime | null {
  const runtime = runtimeFor(journey, siteId);
  return runtime?.gameId === "four-suit-reprise" ? runtime : null;
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

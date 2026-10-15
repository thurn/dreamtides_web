/** Optional historical Four-Suit prevention receipts have one bounded intake contract. */
import { STANDARD_PLAYING_CARD_DECK } from "../../data/gravok-wager";
import { cardIdFromUnknown } from "../../types/card-identity";
import { deckEntryIdFromUnknown, dreamsignIdFromUnknown, shuffleCommitmentFromUnknown } from "../../types/identifiers";
import type { JourneyModifierRegistry } from "./modifier-registry";

type Lookup = JourneyModifierRegistry["lookup"];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Absent legacy receipts impose no new requirements on the surrounding runtime. */
export function validCommittedPurgePrevention(runtime: unknown, lookup: Lookup): boolean {
  if (!record(runtime) || runtime.kind !== "gamble" || runtime.gameId !== "four-suit-reprise") return true;
  if (!Array.isArray(runtime.rounds)) return !(record(runtime.rounds) && ("purgePreventedBy" in runtime.rounds || Object.values(runtime.rounds).some(round => record(round) && "purgePreventedBy" in round)));
  return runtime.rounds.every((round, index) => {
    if (!record(round) || !("purgePreventedBy" in round)) return true;
    const source = round.purgePreventedBy;
    if (!record(source)) return false;
    const sourceId = dreamsignIdFromUnknown(source.dreamsignId);
    const targetId = deckEntryIdFromUnknown(round.targetEntryId), cardId = cardIdFromUnknown(round.targetCardId);
    const commitment = shuffleCommitmentFromUnknown(round.shuffleCommitment);
    if (sourceId === null || lookup(sourceId)?.journeyPurge?.kind !== "preventPurge" ||
      typeof source.heldIndex !== "number" || !Number.isSafeInteger(source.heldIndex) || source.heldIndex < 0 ||
      targetId === null || cardId === null || commitment === null ||
      round.outcome !== "purge" || round.resultRevealed !== true || round.resultSettled !== true ||
      round.essenceGained !== 0 || round.duplicatedEntryId !== undefined || round.chosenTransfiguration !== undefined ||
      round.roundNumber !== index + 1 || !record(round.card) ||
      !STANDARD_PLAYING_CARD_DECK.some(card => record(round.card) && card.suit === round.card.suit && card.rank === round.card.rank) ||
      !Array.isArray(runtime.targets) || !Array.isArray(runtime.shuffleCommitments) || !Array.isArray(runtime.committedCards)) return false;
    const target: unknown = runtime.targets.find(candidate => record(candidate) && candidate.entryId === targetId);
    const committedCard: unknown = runtime.committedCards[index];
    return record(target) && target.cardId === cardId &&
      runtime.shuffleCommitments[index] === commitment && record(committedCard) &&
      committedCard.suit === round.card.suit && committedCard.rank === round.card.rank;
  });
}

/** Reject malformed present receipts so verifiedCheckpoint can replay preserved intents. */
export function assertCommittedPurgePreventionCheckpoint(value: unknown, lookup: Lookup): void {
  if (!record(value) || !record(value.journey) || !record(value.journey.siteRuntime)) return;
  if (Object.values(value.journey.siteRuntime).some(runtime => !validCommittedPurgePrevention(runtime, lookup))) {
    throw new Error("Committed purge checkpoint requires a coherent historical prevention receipt");
  }
}

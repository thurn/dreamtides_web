import type { StandardPlayingCardSuit } from "../types/gamble";
import type {
  FourSuitRepriseGame,
  FourSuitRepriseOutcome,
} from "../types/gamble-data";
import type { DeckEntryId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";

export type { FourSuitRepriseOutcome } from "../types/gamble-data";
export type FourSuitRepriseOutcomeRule =
  FourSuitRepriseGame["rules"]["outcomes"][number];

interface FourSuitRepriseTargetIdentity {
  entryId: DeckEntryId;
  cardId: CardId;
  cardNumber: number;
}

interface FourSuitRepriseDeckEntryState {
  entryId: DeckEntryId;
  cardNumber: number;
  isBane: boolean;
  transfiguration: unknown;
}

/** Essence paid for each one-shot round. */
export function fourSuitRepriseDrawCost(
  config: FourSuitRepriseGame["economy"],
  isFarpoint: boolean,
): number {
  return isFarpoint ? config.enhancedDrawPrice : config.standardDrawPrice;
}

/** Resolve a playing-card suit into the deck effect it commits. */
export function fourSuitRepriseOutcomeForSuit(
  config: FourSuitRepriseGame["rules"],
  suit: StandardPlayingCardSuit,
): FourSuitRepriseOutcome {
  const rule = config.outcomes.find((candidate) => candidate.suit === suit);
  if (rule === undefined) {
    throw new Error(`Missing Four-Suit Reprise outcome for ${suit}`);
  }
  return rule.outcome;
}

/** Keep unused UUID-backed targets whose concrete deck entry is still legal. */
export function eligibleFourSuitRepriseTargets<
  Target extends FourSuitRepriseTargetIdentity,
>(params: {
  targets: readonly Target[];
  deck: readonly FourSuitRepriseDeckEntryState[];
  usedCardIds: readonly CardId[];
}): Target[] {
  const usedCardIds = new Set(params.usedCardIds);
  const liveEntries = new Map(
    params.deck.map((entry) => [entry.entryId, entry]),
  );
  return params.targets.filter((target) => {
    const entry = liveEntries.get(target.entryId);
    return (
      !usedCardIds.has(target.cardId) &&
      entry?.cardNumber === target.cardNumber &&
      !entry.isBane &&
      entry.transfiguration === null
    );
  });
}

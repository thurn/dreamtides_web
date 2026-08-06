import type {
  StandardPlayingCardSuit,
} from "../types/gamble";

export const FOUR_SUIT_REPRISE_RULES_VERSION = "four-suit-reprise-v1";
export const FOUR_SUIT_REPRISE_MAX_ROUNDS = 3;
export const FOUR_SUIT_REPRISE_ESSENCE_REWARD = 50;
export const FOUR_SUIT_REPRISE_ODDS_NUMERATOR = 13;
export const FOUR_SUIT_REPRISE_ODDS_DENOMINATOR = 52;

/** The authoritative card effect attached to one playing-card suit. */
export type FourSuitRepriseOutcome =
  | "transfiguration"
  | "essence"
  | "duplication"
  | "purge";

export interface FourSuitRepriseOutcomeRule {
  suit: StandardPlayingCardSuit;
  outcome: FourSuitRepriseOutcome;
  label: string;
}

interface FourSuitRepriseTargetIdentity {
  entryId: string;
  cardId: string;
  cardNumber: number;
}

interface FourSuitRepriseDeckEntryState {
  entryId: string;
  cardNumber: number;
  isBane: boolean;
  transfiguration: unknown;
}

/** Stable suit order and exact outcome mapping shown by the wager object. */
export const FOUR_SUIT_REPRISE_OUTCOMES: readonly FourSuitRepriseOutcomeRule[] = [
  { suit: "spades", outcome: "transfiguration", label: "Transfigure for free" },
  { suit: "diamonds", outcome: "essence", label: "Unchanged + 50 Essence" },
  { suit: "hearts", outcome: "duplication", label: "Duplicate" },
  { suit: "clubs", outcome: "purge", label: "Purge" },
];

/** Essence paid for each one-shot round. */
export function fourSuitRepriseDrawCost(isFarpoint: boolean): number {
  return isFarpoint ? 15 : 25;
}

/** Resolve a playing-card suit into the deck effect it commits. */
export function fourSuitRepriseOutcomeForSuit(
  suit: StandardPlayingCardSuit,
): FourSuitRepriseOutcome {
  const rule = FOUR_SUIT_REPRISE_OUTCOMES.find(
    (candidate) => candidate.suit === suit,
  );
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
  usedCardIds: readonly string[];
}): Target[] {
  const usedCardIds = new Set(params.usedCardIds);
  const liveEntries = new Map(
    params.deck.map((entry) => [entry.entryId, entry]),
  );
  return params.targets.filter((target) => {
    const entry = liveEntries.get(target.entryId);
    return !usedCardIds.has(target.cardId) &&
      entry?.cardNumber === target.cardNumber &&
      !entry.isBane &&
      entry.transfiguration === null;
  });
}

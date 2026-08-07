import type { StandardPlayingCardSuit } from "../types/gamble";
import type { EconomyData } from "../types/economy-data";
import type { SitesData, FourSuitRepriseOutcome } from "../types/sites-data";

export const FOUR_SUIT_REPRISE_RULES_VERSION = "four-suit-reprise-v1";
export type { FourSuitRepriseOutcome } from "../types/sites-data";
export type FourSuitRepriseOutcomeRule =
  SitesData["gamble"]["fourSuitReprise"]["outcomes"][number];

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

/** Essence paid for each one-shot round. */
export function fourSuitRepriseDrawCost(
  config: EconomyData["gamble"]["fourSuitReprise"],
  isFarpoint: boolean,
): number {
  return isFarpoint ? config.enhancedDrawPrice : config.standardDrawPrice;
}

/** Resolve a playing-card suit into the deck effect it commits. */
export function fourSuitRepriseOutcomeForSuit(
  config: SitesData["gamble"]["fourSuitReprise"],
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
  usedCardIds: readonly string[];
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

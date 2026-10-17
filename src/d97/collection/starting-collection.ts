// The Standard starting package (Appendix A §A17 at d = 1, decision P29):
// starting Essence and the starting collection, chosen by the unified tide
// affinity picker over reward bag v0. Pure: content and randomness arrive as
// arguments.

import {
  iterativeAffinityPicks,
  type AffinityPickCandidate,
} from "../../battle/integration/tide-opponent-deck";
import type { D97StartingPackageTuning } from "../../content/d97/collection";
import {
  addTideIds,
  cardAffinity,
  type TideAffinityIndex,
} from "../../selection/tide-affinity";
import type { CardId } from "../../types/card-identity";
import type { Rarity } from "../../types/cards";
import type { TideId } from "../../types/identifiers";
import { bagCardIds } from "./reward-bag";
import type { D97RewardBag } from "./types";

/** The card facts the starting collection reads. */
export interface D97StartingCollectionContent {
  readonly tideAffinityIndex: TideAffinityIndex;
  /** A catalog card's rarity, or null for an unknown card. */
  readonly cardRarity: (cardId: CardId) => Rarity | null;
  /** The distinct Starter cards, in a stable catalog order. */
  readonly starterCardIds: readonly CardId[];
}

/** The chosen starting collection: one copy of each card. */
export interface D97StartingCollection {
  /** The kept affinity picks, in pick order; each is drawn from the bag. */
  readonly keptCardIds: readonly CardId[];
  /** The lowest-affinity picks that starter dilution cut. */
  readonly cutCardIds: readonly CardId[];
  /** The Starter cards added in their place, in seeded random order. */
  readonly starterCardIds: readonly CardId[];
}

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Starting Essence: `(base − d) × perStep`. */
export function startingEssence(tuning: D97StartingPackageTuning): number {
  return (
    (tuning.essenceDifficultyBase - tuning.difficulty) * tuning.essencePerStep
  );
}

/** How many picks starter dilution replaces: `base + perDifficulty × d`. */
function starterDilutionCount(tuning: D97StartingPackageTuning): number {
  return tuning.starterBase + tuning.starterPerDifficulty * tuning.difficulty;
}

/**
 * Choose the starting collection: the context gains +1 per joined tide of the
 * dealt pool; the candidates are the bag's distinct cards; iterative picks
 * rank them by [cosine affinity to the context, rarity] and draw uniformly
 * from the top band, adding each pick's tide vector, until `pickCount` are
 * chosen; then the lowest-affinity picks are cut and that many distinct
 * Starter cards join in seeded random order.
 */
export function chooseStartingCollection(args: {
  bag: D97RewardBag;
  content: D97StartingCollectionContent;
  tuning: D97StartingPackageTuning;
  random: () => number;
}): D97StartingCollection {
  const { bag, content, tuning, random } = args;
  const context = new Map<TideId, number>();
  addTideIds(context, bag.joinedTideIds);
  const candidates: AffinityPickCandidate[] = bagCardIds(bag).map((id) => {
    const rarity = content.cardRarity(id);
    return rarity === null ? { id } : { id, rarity };
  });
  const picks = iterativeAffinityPicks({
    candidates,
    context,
    targetSize: tuning.pickCount,
    bandFraction: tuning.bandFraction,
    bandMinimum: tuning.bandMinimum,
    rng: random,
    index: content.tideAffinityIndex,
  });
  const starterCount = Math.min(starterDilutionCount(tuning), picks.length);
  const cut = picks
    .map((card) => ({
      id: card.id,
      affinity: cardAffinity(card.id, context, content.tideAffinityIndex),
    }))
    .sort(
      (left, right) =>
        left.affinity - right.affinity || codeUnits(left.id, right.id),
    )
    .slice(0, starterCount)
    .map(({ id }) => id);
  const cutIds = new Set(cut);
  const kept = picks.map((card) => card.id).filter((id) => !cutIds.has(id));
  const keptIds = new Set(kept);
  const starters = [...new Set(content.starterCardIds)]
    .filter((id) => !keptIds.has(id))
    .sort(codeUnits)
    .map((id) => ({ id, key: random() }))
    .sort((left, right) => left.key - right.key || codeUnits(left.id, right.id))
    .slice(0, starterCount)
    .map(({ id }) => id);
  return {
    keptCardIds: kept,
    cutCardIds: cut,
    starterCardIds: starters,
  };
}

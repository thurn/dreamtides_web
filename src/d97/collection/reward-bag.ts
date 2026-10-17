// Reward bag v0 operations (decision P29, Appendix A §A2). Pure functions
// over the stored bag: `w(c) = target(c) − acquired(c)`, where `acquired(c)`
// counts every copy of `c` the run ever acquired, through any channel. Owned
// copies never decrease it, so a sold copy never returns to the bag.

import type { CardId } from "../../types/card-identity";
import type { AvatarId, TideId } from "../../types/identifiers";
import type { D97BagEntry, D97RewardBag } from "./types";

/** One dealt card and its copy count. */
export interface D97DealtCard {
  readonly cardId: CardId;
  readonly copies: number;
}

/** A card taken from the bag, with the bag's state after it. */
export interface D97BagDraw {
  readonly bag: D97RewardBag;
  readonly cardId: CardId;
  /** `w(cardId)` after the draw. */
  readonly remaining: number;
  /** Copies left in the whole bag after the draw. */
  readonly bagSize: number;
}

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * The bag for a dealt pool: each card's target is its dealt count. Duplicate
 * card entries sum; non-positive counts are dropped.
 */
export function createRewardBag(args: {
  avatarId: AvatarId;
  dealSeed: number;
  joinedTideIds: readonly TideId[];
  dealt: readonly D97DealtCard[];
}): D97RewardBag {
  const targets = new Map<CardId, number>();
  for (const { cardId, copies } of args.dealt) {
    if (copies > 0) targets.set(cardId, (targets.get(cardId) ?? 0) + copies);
  }
  const entries: D97BagEntry[] = [...targets]
    .sort(([left], [right]) => codeUnits(left, right))
    .map(([cardId, target]) => ({ cardId, target, acquired: 0 }));
  return {
    avatarId: args.avatarId,
    dealSeed: args.dealSeed,
    joinedTideIds: [...args.joinedTideIds],
    entries,
  };
}

function entryWeight(entry: D97BagEntry): number {
  return Math.max(0, entry.target - entry.acquired);
}

/** `w(cardId)`: the copies of a card the bag can still supply. */
export function bagWeight(bag: D97RewardBag, cardId: CardId): number {
  const entry = bag.entries.find((candidate) => candidate.cardId === cardId);
  return entry === undefined ? 0 : entryWeight(entry);
}

/** The copies left in the whole bag. */
export function bagSize(bag: D97RewardBag): number {
  return bag.entries.reduce((total, entry) => total + entryWeight(entry), 0);
}

/** The distinct cards the bag can still supply, in card-UUID order. */
export function bagCardIds(bag: D97RewardBag): CardId[] {
  return bag.entries
    .filter((entry) => entryWeight(entry) > 0)
    .map((entry) => entry.cardId);
}

/**
 * Count one acquired copy of `cardId`, from any channel. A card outside the
 * bag has a target of zero, so its acquisition leaves the bag unchanged.
 */
export function recordAcquisition(
  bag: D97RewardBag,
  cardId: CardId,
): D97RewardBag {
  if (!bag.entries.some((entry) => entry.cardId === cardId)) return bag;
  return {
    ...bag,
    entries: bag.entries.map((entry) =>
      entry.cardId === cardId
        ? { ...entry, acquired: entry.acquired + 1 }
        : entry,
    ),
  };
}

/**
 * Acquire one copy of a chosen card from the bag, or null when the bag holds
 * none of it.
 */
export function takeFromBag(
  bag: D97RewardBag,
  cardId: CardId,
): D97BagDraw | null {
  if (bagWeight(bag, cardId) === 0) return null;
  const next = recordAcquisition(bag, cardId);
  return {
    bag: next,
    cardId,
    remaining: bagWeight(next, cardId),
    bagSize: bagSize(next),
  };
}

/** Pick an index with probability proportional to its weight. */
function weightedIndex(
  weights: readonly number[],
  random: () => number,
): number | null {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return null;
  let target = Math.floor(random() * total);
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (target < weight) return index;
    target -= weight;
  }
  return null;
}

/**
 * A bag draw: pick card `c` with probability proportional to `w(c)` and
 * acquire that copy. Null when the bag is empty.
 */
export function drawFromBag(
  bag: D97RewardBag,
  random: () => number,
): D97BagDraw | null {
  const index = weightedIndex(bag.entries.map(entryWeight), random);
  const entry = index === null ? undefined : bag.entries[index];
  return entry === undefined ? null : takeFromBag(bag, entry.cardId);
}

/**
 * An offer of up to `count` cards sampled from the bag without removing any
 * copy: each pick is proportional to the copies not yet shown, so one offer
 * never shows a card more than `w(c)` times.
 */
export function sampleBagOffer(
  bag: D97RewardBag,
  count: number,
  random: () => number,
): CardId[] {
  const weights = bag.entries.map(entryWeight);
  const offer: CardId[] = [];
  while (offer.length < count) {
    const index = weightedIndex(weights, random);
    const entry = index === null ? undefined : bag.entries[index];
    if (index === null || entry === undefined) break;
    offer.push(entry.cardId);
    weights[index] = (weights[index] ?? 0) - 1;
  }
  return offer;
}

/**
 * One offered card that passes `eligible` and is not in `exclude`, sampled
 * without removing any copy: proportional to `w(c)`, or, when the bag holds no
 * such card, uniform over the tide set's eligible cards (Appendix A §A2).
 * Null when no card is eligible at all.
 */
export function sampleFilteredOffer(
  bag: D97RewardBag,
  eligible: (cardId: CardId) => boolean,
  exclude: ReadonlySet<CardId>,
  random: () => number,
): CardId | null {
  const candidates = bag.entries.filter((entry) => eligible(entry.cardId) && !exclude.has(entry.cardId));
  const weighted = weightedIndex(candidates.map(entryWeight), random);
  if (weighted !== null) return candidates[weighted]?.cardId ?? null;
  if (candidates.length === 0) return null;
  return candidates[Math.floor(random() * candidates.length)]?.cardId ?? null;
}

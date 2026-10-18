// The reward bag (Appendix A §A2, decision P29), over each Avatar's pinned
// pool. Pure functions: content (the pinned pool's rings, the capacity
// stages) and the run's stored bag state arrive as arguments.
//
// - Ring 1 is the signature tide's eligible cards; ring 2 is the facets'
//   eligible cards outside ring 1. The rings are the tide set's full eligible
//   lists (§A2's text and measured shape), not the pinned dealt pool, so a
//   card's capacity follows the stage table whatever the deal dealt.
// - A card's capacity is its ring's capacity at the run's stage, and
//   `w(c) = capacity(c) − drawn(c)`, where `drawn(c)` counts the copies of `c`
//   acquired from this Avatar's bag (`./acquisition.ts` counts them). Copies
//   acquired through other channels never change `w`, and a sold copy never
//   returns to the bag.
// - Every Avatar's bag exists from run start; the active bag is the run's
//   current Avatar's.

import type { D97BagStageTrigger, D97BagStageTuning, D97RewardBagTuning } from "../../content/d97/collection";
import type { CardId } from "../../types/card-identity";
import type { AvatarId } from "../../types/identifiers";
import type { D97AvatarPool, D97BagEntry, D97RewardBag, D97RewardBags } from "./types";

/** The content a reward bag reads: each Avatar's pinned pool and the capacity stages. */
export interface D97RewardBagContent {
  /** An Avatar's pinned pool, or null for an Avatar without one. */
  readonly rewardPool: (avatarId: AvatarId) => D97AvatarPool | null;
  readonly rewardBagTuning: D97RewardBagTuning;
}

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** The stage tuning in force at `stage`: the latest stage at or below it, or null. */
function stageAt(tuning: D97RewardBagTuning, stage: number): D97BagStageTuning | null {
  let current: D97BagStageTuning | null = null;
  for (const entry of tuning.stages) {
    if (entry.stage <= stage && (current === null || entry.stage > current.stage)) current = entry;
  }
  return current;
}

/** Every Avatar's bag at run start: the run-start stage, nothing drawn. */
export function initialRewardBags(tuning: D97RewardBagTuning): D97RewardBags {
  const first = tuning.stages.find((entry) => entry.opensOn.kind === "runStart");
  return { stage: first?.stage ?? 0, drawn: {} };
}

/** `avatarId`'s bag view at the run's stage, from its pinned pool (empty without one). */
export function rewardBagOf(
  content: D97RewardBagContent,
  bags: D97RewardBags,
  avatarId: AvatarId,
): D97RewardBag {
  const pool = content.rewardPool(avatarId);
  const stage = stageAt(content.rewardBagTuning, bags.stage);
  const drawn = bags.drawn[avatarId] ?? {};
  const entries: D97BagEntry[] = [];
  if (pool !== null) {
    for (const cardId of pool.ring1) entries.push({ cardId, ring: 1, capacity: stage?.ring1Capacity ?? 0, drawn: drawn[cardId] ?? 0 });
    for (const cardId of pool.ring2) entries.push({ cardId, ring: 2, capacity: stage?.ring2Capacity ?? 0, drawn: drawn[cardId] ?? 0 });
  }
  entries.sort((left, right) => codeUnits(left.cardId, right.cardId));
  return { avatarId, stage: bags.stage, entries };
}

/** The run's active bag: its current Avatar's. */
export function activeRewardBag(
  content: D97RewardBagContent,
  run: { readonly avatarId: AvatarId; readonly bags: D97RewardBags },
): D97RewardBag {
  return rewardBagOf(content, run.bags, run.avatarId);
}

/** Count one copy of `cardId` acquired from `avatarId`'s bag. */
export function recordBagDraw(bags: D97RewardBags, avatarId: AvatarId, cardId: CardId): D97RewardBags {
  const own = bags.drawn[avatarId] ?? {};
  const cards = sortedRecord({ ...own, [cardId]: (own[cardId] ?? 0) + 1 });
  return { ...bags, drawn: sortedRecord({ ...bags.drawn, [avatarId]: cards }) };
}

/** `record` with its keys in code-unit order, so every fold writes the same JSON. */
function sortedRecord<K extends string, V>(record: Partial<Record<K, V>>): Partial<Record<K, V>> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => codeUnits(left, right))) as Partial<Record<K, V>>;
}

/** Whether `trigger` names the event `opensOn` describes. */
function sameTrigger(opensOn: D97BagStageTrigger, trigger: D97BagStageTrigger): boolean {
  if (opensOn.kind !== trigger.kind) return false;
  return opensOn.kind !== "actEntered" || (trigger.kind === "actEntered" && opensOn.act === trigger.act);
}

/**
 * Open the stage `trigger` names, raising every card's capacity: the opened
 * stage tuning, or null (and `bags` unchanged) when no stage opens on
 * `trigger` or the run already reached it. Stages never close.
 */
export function openBagStage(
  bags: D97RewardBags,
  trigger: D97BagStageTrigger,
  tuning: D97RewardBagTuning,
): { readonly bags: D97RewardBags; readonly opened: D97BagStageTuning | null } {
  const entry = tuning.stages.find((candidate) => sameTrigger(candidate.opensOn, trigger));
  if (entry === undefined || entry.stage <= bags.stage) return { bags, opened: null };
  return { bags: { ...bags, stage: entry.stage }, opened: entry };
}

function entryWeight(entry: D97BagEntry): number {
  return Math.max(0, entry.capacity - entry.drawn);
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

/** The ring a card sits in, or null outside the tide set. */
export function bagRing(bag: D97RewardBag, cardId: CardId): 1 | 2 | null {
  return bag.entries.find((entry) => entry.cardId === cardId)?.ring ?? null;
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
 * A bag draw's pick: card `c` with probability proportional to `w(c)`, or
 * null when the bag is empty. The pick removes nothing; acquiring the card
 * (`acquireForRun` with source `draw`) counts it against the bag.
 */
export function pickFromBag(
  bag: D97RewardBag,
  random: () => number,
): CardId | null {
  const index = weightedIndex(bag.entries.map(entryWeight), random);
  return index === null ? null : (bag.entries[index]?.cardId ?? null);
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
 * such card, uniform over the tide set's eligible cards (both rings, whatever
 * their capacity; Appendix A §A2). Null when no card is eligible at all.
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

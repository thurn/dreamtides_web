import type { Tides4DecksJson } from "../draft/pool/tides4-io";
import type { Rarity } from "../types/cards";
import type { CardId } from "../types/card-identity";
import { asCardId } from "../types/card-identity";
import type { TideId } from "../types/identifiers";
import { asTideId } from "../types/identifiers";

export type TideVector = ReadonlyMap<TideId, number>;

export interface TideAffinityIndex {
  readonly cardVectors: ReadonlyMap<CardId, TideVector>;
  readonly knownTideIds: ReadonlySet<TideId>;
}

export function buildTideAffinityIndex(
  data: Tides4DecksJson,
): TideAffinityIndex {
  const cardVectors = new Map<CardId, Map<TideId, number>>();
  const knownTideIds = new Set<TideId>();
  for (const tide of data.tides) {
    const tideId = asTideId(tide.id);
    knownTideIds.add(tideId);
    for (const card of tide.cards) {
      const cardId = asCardId(card.id);
      const vector = cardVectors.get(cardId) ?? new Map<TideId, number>();
      vector.set(tideId, card.copies);
      cardVectors.set(cardId, vector);
    }
  }
  return { cardVectors, knownTideIds };
}

export function mutableVector(source?: TideVector): Map<TideId, number> {
  return new Map(source ?? []);
}

export function addTideIds(
  target: Map<TideId, number>,
  tideIds: Iterable<TideId>,
): void {
  for (const tideId of tideIds) {
    target.set(tideId, (target.get(tideId) ?? 0) + 1);
  }
}

export function addCardVector(
  target: Map<TideId, number>,
  cardUuid: CardId,
  index: TideAffinityIndex,
): void {
  for (const [tideId, weight] of index.cardVectors.get(cardUuid) ?? []) {
    target.set(tideId, (target.get(tideId) ?? 0) + weight);
  }
}

export function buildAffinityContext(args: {
  index: TideAffinityIndex;
  joinedTideIds?: Iterable<TideId>;
  deckCardUuids?: Iterable<CardId>;
  dreamsignTideIds?: Iterable<TideId>;
}): Map<TideId, number> {
  const result = new Map<TideId, number>();
  addTideIds(result, args.joinedTideIds ?? []);
  for (const cardUuid of new Set(args.deckCardUuids ?? [])) {
    addCardVector(result, cardUuid, args.index);
  }
  addTideIds(result, args.dreamsignTideIds ?? []);
  return result;
}

export function cosineAffinity(left: TideVector, right: TideVector): number {
  let dot = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (const value of left.values()) leftSquared += value * value;
  for (const value of right.values()) rightSquared += value * value;
  if (leftSquared === 0 || rightSquared === 0) return 0;
  const [small, large] =
    left.size <= right.size ? [left, right] : [right, left];
  for (const [key, value] of small) dot += value * (large.get(key) ?? 0);
  return dot / Math.sqrt(leftSquared * rightSquared);
}

export function cardAffinity(
  cardUuid: CardId,
  context: TideVector,
  index: TideAffinityIndex,
): number {
  return cosineAffinity(index.cardVectors.get(cardUuid) ?? new Map(), context);
}

export function rarityStrength(rarity: Rarity | undefined): number {
  switch (rarity) {
    case "Common":
      return 0;
    case "Uncommon":
      return 1;
    case "Rare":
      return 2;
    case "Legendary":
      return 3;
    case "Starter":
    case "Tutorial":
    case "Special":
    case undefined:
      return -1;
  }
}

export function compareRanks(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Number of candidates exposed by the universal top-band selection rule. */
export function selectionBandSize(
  poolSize: number,
  fraction: number,
  minimum: number,
): number {
  return Math.min(
    poolSize,
    Math.max(Math.ceil(poolSize * fraction), Math.min(poolSize, minimum)),
  );
}

/** Uniformly samples one candidate from the exposed prefix of a ranked list. */
export function sampleSelectionBand<T>(
  ranked: readonly T[],
  size: number,
  rng: () => number,
): T | undefined {
  if (size === 0) return undefined;
  return ranked[Math.min(Math.floor(rng() * size), size - 1)];
}

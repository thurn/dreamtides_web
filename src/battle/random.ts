const HASH_OFFSET_BASIS = 2166136261;
import type { BattleEntryKey } from "../types/identifiers";
const HASH_PRIME = 16777619;

export const BATTLE_RNG_STREAMS = [
  "enemyDescriptor",
  "enemyDeckOrder",
  "playerDeckOrder",
  "dreamwellDeck",
  "battleCardIds",
] as const;

export type BattleRngStreamName = (typeof BATTLE_RNG_STREAMS)[number];

export interface BattleRng {
  nextFloat: () => number;
  nextInt: (maxExclusive: number) => number;
  shuffle: <T>(items: readonly T[]) => T[];
}

export function deriveBattleSeed(battleEntryKey: BattleEntryKey): number {
  return hashStringToSeed(battleEntryKey);
}

export function createBattleRng(
  seed: number,
  streamName: BattleRngStreamName,
): BattleRng {
  let state = deriveStreamSeed(seed, streamName);

  function nextUint32(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return (mixed ^ (mixed >>> 14)) >>> 0;
  }

  function nextFloat(): number {
    return nextUint32() / 4294967296;
  }

  function nextInt(maxExclusive: number): number {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
      throw new Error(
        `maxExclusive must be a positive finite number, received ${String(maxExclusive)}`,
      );
    }
    return Math.floor(nextFloat() * maxExclusive);
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = nextInt(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  return { nextFloat, nextInt, shuffle };
}

export function createBattleRngStreams(
  seed: number,
): Record<BattleRngStreamName, BattleRng> {
  return {
    enemyDescriptor: createBattleRng(seed, "enemyDescriptor"),
    enemyDeckOrder: createBattleRng(seed, "enemyDeckOrder"),
    playerDeckOrder: createBattleRng(seed, "playerDeckOrder"),
    dreamwellDeck: createBattleRng(seed, "dreamwellDeck"),
    battleCardIds: createBattleRng(seed, "battleCardIds"),
  };
}

function deriveStreamSeed(
  seed: number,
  streamName: BattleRngStreamName,
): number {
  return hashStringToSeed(`${String(seed)}:${streamName}`);
}

function hashStringToSeed(value: string): number {
  let hash = HASH_OFFSET_BASIS;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, HASH_PRIME) >>> 0;
  }
  return hash === 0 ? 1 : hash;
}

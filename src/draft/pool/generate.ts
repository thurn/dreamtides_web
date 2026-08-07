import type { Tides4Tuning } from "../../types/draft-data";
import { buildPoolData } from "./pool-data.ts";
import { makeRng } from "./rng.ts";
import {
  DEFAULT_POOL_VARIANT,
  type GeneratedPool,
  type PoolCard,
  type PoolData,
} from "./types.ts";
import {
  DEFAULT_TIDES4_TUNING,
  generateTides4,
} from "./variant-tides4.ts";

export function generatePool(
  cards: readonly PoolCard[],
  seed?: number,
  dreamAvatarId?: string,
  tides4Tuning?: Tides4Tuning,
): GeneratedPool {
  return generatePoolFromData(
    buildPoolData(cards),
    seed,
    dreamAvatarId,
    tides4Tuning,
  );
}

/** Generate the production tides4 pool for one Dream Avatar. */
export function generatePoolFromData(
  poolData: PoolData,
  seed?: number,
  dreamAvatarId?: string,
  tides4Tuning: Tides4Tuning = DEFAULT_TIDES4_TUNING,
): GeneratedPool {
  const resolvedSeed =
    seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0;
  const generated = generateTides4(
    makeRng(resolvedSeed),
    poolData,
    dreamAvatarId,
    tides4Tuning,
  );
  const counts = new Map(
    [...generated.counts].map(([card, copies]) => [
      card,
      Math.min(tides4Tuning.copyCap, copies),
    ]),
  );
  let size = 0;
  for (const copies of counts.values()) size += copies;
  return {
    counts,
    seed: resolvedSeed,
    size,
    variant: DEFAULT_POOL_VARIANT,
    tideDeckIds: generated.tideDeckIds,
    tides4Provenance: generated.tides4Provenance,
  };
}

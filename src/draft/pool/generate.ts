// Public entry points: assemble a {@link GeneratedPool} by handing a uniform
// request to the strategy the selected variant resolves to (see `registry.ts`)
// and capping copies at 2. This module never branches on which algorithm runs.

import { COLORS } from "./constants.ts";
import { buildPoolData } from "./pool-data.ts";
import { poolStrategyFor } from "./registry.ts";
import { makeRng } from "./rng.ts";
import {
  DEFAULT_POOL_VARIANT,
  type GeneratedPool,
  type PoolCard,
  type PoolData,
  type PoolVariant,
} from "./types.ts";
import { poolSize } from "./util.ts";

/**
 * Generate a fresh random pool from the given card records. Pass a `seed` to
 * reproduce a previous run; omit it for a new random pool each call. Copy counts
 * in the returned map are capped at 2, matching the 2-copy rule the design doc
 * describes. For repeated generation, build `PoolData` once with
 * {@link buildPoolData} and call {@link generatePoolFromData}. Pass `targetSize`
 * to pin the pool to a specific number of copies; omit it for each variant's own
 * default size. Pass `signatureCards` (a Dreamcaller's signature) to steer the
 * `idf3` variant; the other variants ignore it.
 */
export function generatePool(
  cards: readonly PoolCard[],
  seed?: number,
  seedArchetypes?: readonly string[],
  variant: PoolVariant = DEFAULT_POOL_VARIANT,
  themeArchetypes?: readonly string[],
  targetSize?: number,
  signatureCards?: readonly string[],
  dreamcallerId?: string,
): GeneratedPool {
  return generatePoolFromData(
    buildPoolData(cards),
    seed,
    seedArchetypes,
    variant,
    themeArchetypes,
    targetSize,
    signatureCards,
    dreamcallerId,
  );
}

/**
 * Generate a pool from prebuilt {@link PoolData}. Pass `seedArchetypes` (a
 * Dreamcaller's `draftArchetypes`) to seed construction from one of those
 * archetypes; omit it for the unconstrained random pool. Pass `variant` to
 * select the generation algorithm (see {@link PoolVariant}). Pass
 * `themeArchetypes` (a Dreamcaller's mechanic-archetype tide slugs) to bias the
 * `decklists` variant toward that theme; the other variants ignore it. Pass
 * `targetSize` to pin the pool to that many copies; omit it for each variant's
 * own default size band. Pass `signatureCards` (a Dreamcaller's signature) to
 * steer the `idf3` variant toward the Dreamcaller's decks; the other variants
 * ignore it. Pass `dreamcallerId` (the Dreamcaller's UUID) so the `tides`
 * variant can look up the Dreamcaller's baked favored tide decks; the other
 * variants ignore it.
 */
export function generatePoolFromData(
  poolData: PoolData,
  seed?: number,
  seedArchetypes?: readonly string[],
  variant: PoolVariant = DEFAULT_POOL_VARIANT,
  themeArchetypes?: readonly string[],
  targetSize?: number,
  signatureCards?: readonly string[],
  dreamcallerId?: string,
): GeneratedPool {
  const resolvedSeed =
    seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0;
  const rng = makeRng(resolvedSeed);
  const {
    C,
    selected,
    counts,
    starterDeck,
    idf3Provenance,
    seedProvenance,
    tides4Provenance,
  } = poolStrategyFor(variant).generate({
      rng,
      poolData,
      seedArchetypes,
      themeArchetypes,
      signatureCards,
      targetSize,
      dreamcallerId,
    });

  const capped = new Map<string, number>();
  for (const [card, count] of counts) {
    capped.set(card, Math.min(2, count));
  }

  const identity = [...COLORS].filter((c) => C.has(c)).join("");
  return {
    identity,
    themes: selected,
    counts: capped,
    seed: resolvedSeed,
    size: poolSize(counts),
    variant,
    starterDeck: starterDeck ?? [],
    idf3Provenance,
    seedProvenance,
    tides4Provenance,
  };
}

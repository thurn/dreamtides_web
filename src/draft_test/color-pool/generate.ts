// Public entry points: assemble a {@link GeneratedPool} by dispatching to the
// selected variant generator and capping copies at 2.

import { COLORS } from "./constants.ts";
import { buildPoolData } from "./pool-data.ts";
import { makeRng } from "./rng.ts";
import {
  DEFAULT_POOL_VARIANT,
  type GeneratedPool,
  type PoolCard,
  type PoolData,
  type PoolVariant,
  type VariantResult,
} from "./types.ts";
import { poolSize } from "./util.ts";
import { generate } from "./variant-default.ts";
import { generateDecklists } from "./variant-decklists.ts";
import { generateDiverse } from "./variant-diverse.ts";
import { generateIdf } from "./variant-idf.ts";
import { generateIdf2 } from "./variant-idf2.ts";
import { generateMerged } from "./variant-merged.ts";

function runVariant(
  variant: PoolVariant,
  rng: () => number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
  themeArchetypes?: readonly string[],
): VariantResult {
  switch (variant) {
    case "diverse":
      return generateDiverse(rng, poolData, seedArchetypes);
    case "decklists":
      return generateDecklists(rng, poolData, seedArchetypes, themeArchetypes);
    case "merged":
      return generateMerged(rng, poolData, seedArchetypes, themeArchetypes);
    case "idf":
      return generateIdf(rng, poolData);
    case "idf2":
      return generateIdf2(rng, poolData);
    case "default":
      return generate(rng, poolData, seedArchetypes);
  }
}

/**
 * Generate a fresh random pool from the given card records. Pass a `seed` to
 * reproduce a previous run; omit it for a new random pool each call. Copy counts
 * in the returned map are capped at 2, matching the 2-copy rule the design doc
 * describes. For repeated generation, build `PoolData` once with
 * {@link buildPoolData} and call {@link generatePoolFromData}.
 */
export function generatePool(
  cards: readonly PoolCard[],
  seed?: number,
  seedArchetypes?: readonly string[],
  variant: PoolVariant = DEFAULT_POOL_VARIANT,
  themeArchetypes?: readonly string[],
): GeneratedPool {
  return generatePoolFromData(
    buildPoolData(cards),
    seed,
    seedArchetypes,
    variant,
    themeArchetypes,
  );
}

/**
 * Generate a pool from prebuilt {@link PoolData}. Pass `seedArchetypes` (a
 * Dreamcaller's `draftArchetypes`) to seed construction from one of those
 * archetypes; omit it for the unconstrained random pool. Pass `variant` to
 * select the generation algorithm (see {@link PoolVariant}). Pass
 * `themeArchetypes` (a Dreamcaller's mechanic-archetype tide slugs) to bias the
 * `decklists` variant toward that theme; the other variants ignore it.
 */
export function generatePoolFromData(
  poolData: PoolData,
  seed?: number,
  seedArchetypes?: readonly string[],
  variant: PoolVariant = DEFAULT_POOL_VARIANT,
  themeArchetypes?: readonly string[],
): GeneratedPool {
  const resolvedSeed =
    seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0;
  const rng = makeRng(resolvedSeed);
  const { C, selected, counts } = runVariant(
    variant,
    rng,
    poolData,
    seedArchetypes,
    themeArchetypes,
  );

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
  };
}

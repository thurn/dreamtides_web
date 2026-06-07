// The `idf_human` variant: the `idf3` algorithm, unchanged, run over a different
// corpus. Where `idf3` grows its pool from the synthetic decklists in
// `poolData.decklists` (`docs/drafts_anon`), `idf_human` grows from the real
// human Cube Cobra draft records in `poolData.humanDecklists`
// (`docs/human_drafts_anon`). Every step — diversity weighting, signature anchor
// affinity, the capped starter draw, whole-deck growth, and provenance — is
// `idf3`'s; only the source corpus changes.

import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";
import { generate } from "./variant-color-pool.ts";
import { generateIdf3 } from "./variant-idf3.ts";

// A PoolData view whose `decklists` is the human corpus, computed once per
// incoming PoolData. The shared `idf2Corpus`/`idfCorpus` caches key on PoolData
// object identity and carry an O(decks^2) near-twin pass, so handing `generateIdf3`
// a fresh wrapper each call would recompute the corpus every generation. Caching
// the wrapper (exactly as `idf4`'s pruned-pool cache does) keeps the corpus warm.
const humanPoolDataCache = new WeakMap<PoolData, PoolData>();
function humanPoolDataFor(poolData: PoolData): PoolData {
  const cached = humanPoolDataCache.get(poolData);
  if (cached) return cached;
  const derived: PoolData = { ...poolData, decklists: poolData.humanDecklists };
  humanPoolDataCache.set(poolData, derived);
  return derived;
}

// Run `idf3` over the human-draft corpus. With no human decklists the derived
// view has no `decklists`, so `generateIdf3` takes its own no-corpus fallback to
// the `default` algorithm.
export function generateIdfHuman(
  rng: () => number,
  poolData: PoolData,
  signatureCards?: readonly string[],
  targetSize?: number,
): VariantResult {
  if (!poolData.humanDecklists || poolData.humanDecklists.length === 0) {
    return generate(rng, poolData, undefined, targetSize);
  }
  return generateIdf3(rng, humanPoolDataFor(poolData), signatureCards, targetSize);
}

/** Strategy adapter for the `idf_human` algorithm. */
export const idfHumanStrategy: PoolStrategy = {
  id: "idf_human",
  description:
    "idf3's signature-steered decklist pool, grown from the real human Cube " +
    "Cobra draft records (docs/human_drafts_anon) instead of the synthetic corpus.",
  generate: ({ rng, poolData, signatureCards, targetSize }) =>
    generateIdfHuman(rng, poolData, signatureCards, targetSize),
};

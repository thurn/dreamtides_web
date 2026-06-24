// The `embedded` variant: `sigseed`'s pool, grown from the COMMITTED affinity
// corpus instead of the records rebuilt in-browser. It seeds and grows
// identically to `sigseed` — a random subset of the Dreamcaller's signature
// cards expanded by the shared deterministic affinity grower
// ({@link growAffinityPoolFromSeeds}), reducing to `pickcohere` when no signature
// resolves — and differs only in the SOURCE of its {@link AffinityCorpus}.
//
// `sigseed` rebuilds its corpus from the 19 MB draft-record bundle every page
// load; `embedded` reads `poolData.affinityCorpus`, reconstructed from the
// committed `data/affinity_corpus.jsonc` (served as `/affinity-corpus-data.json`).
// That committed corpus IS the same record-derived affinity matrix `sigseed`
// builds (rounded to the precision at which it reproduces `sigseed` byte-for-
// byte), with a committed "resembles" overlay folded in so new and changed cards
// can be authored as a text edit plus a re-bake rather than collected as fresh
// drafts. So `embedded` draws the same pools as `sigseed` from an editable card
// set. See `docs/cards2/affinity_embedding_workflow.md`.
//
// Because the corpus arrives prebuilt, `embedded` does not read the draft
// records: the runtime fetches the committed corpus for this variant in place of
// the records. Cards are identified by UUID throughout, exactly as `sigseed`.

import {
  growAffinityPoolFromSeeds,
  growPoolFromCorpus,
  toVariantResult,
} from "./affinity-grower.ts";
import type { PoolStrategy } from "./strategy.ts";
import { missingPoolData, type PoolData, type VariantResult } from "./types.ts";
import { PICKCOHERE } from "./variant-pickcohere.ts";
import { resolveSignatureToCorpus } from "./variant-picksig.ts";
import { drawSignatureSubset, SIGSEED } from "./variant-sigseed.ts";

// Build an `embedded` pool: resolve the signature onto the committed embedding
// corpus, draw a random subset of those signature cards, and grow one
// deterministic pool anchored on them, emitted keyed by UUID.
// Throws when the embedding was not loaded (no `poolData.affinityCorpus`), and
// reduces to a `pickcohere`-style best-of-K grow over the embedding when the
// signature is empty or none of its cards are in the corpus — exactly the
// `sigseed` fallback, but on the embedded corpus rather than a records rebuild.
export function generateEmbedded(
  rng: () => number,
  poolData: PoolData,
  signatureCards?: readonly string[],
): VariantResult {
  const corpus = poolData.affinityCorpus ?? null;
  if (!corpus || corpus.cards.length === 0) {
    missingPoolData(
      "embedded",
      "its committed affinity corpus was not loaded " +
        "(data/affinity_corpus.jsonc -> /affinity-corpus-data.json)",
    );
  }

  const signatureSet = resolveSignatureToCorpus(corpus, signatureCards ?? []);
  if (signatureSet.size === 0) {
    // No signature anchor in the corpus: grow the unsteered best-of-K base over
    // the committed corpus, the same fallback `sigseed` takes via `pickcohere`.
    return growPoolFromCorpus(
      rng,
      poolData,
      corpus,
      PICKCOHERE.targetSize,
      PICKCOHERE,
      "embedded",
    );
  }

  const keys = [...signatureSet].sort();
  const seeds = drawSignatureSubset(rng, keys, SIGSEED.maxSeedCards);
  const grown = growAffinityPoolFromSeeds(
    corpus,
    seeds,
    SIGSEED.targetSize,
    SIGSEED,
  );
  return toVariantResult(grown.counts, grown.provenance, "embedded");
}

/** Strategy adapter for the `embedded` algorithm. */
export const embeddedStrategy: PoolStrategy = {
  id: "embedded",
  description:
    "Grows the pool exactly like sigseed — from a random subset of a " +
    "Dreamcaller's signature cards expanded by pick-affinity — but reads its " +
    "synergy from the committed affinity corpus (data/affinity_corpus.jsonc) " +
    "instead of rebuilding it from the draft records, so new and changed cards " +
    "can be authored in the affinity overlay. Reduces to pickcohere with no signature.",
  generate: ({ rng, poolData, signatureCards }) =>
    generateEmbedded(rng, poolData, signatureCards),
};

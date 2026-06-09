// The strategy contract for draft-pool construction. Every generation algorithm
// is a {@link PoolStrategy}: it receives one uniform {@link PoolGenerationRequest}
// and returns a {@link VariantResult}. A strategy reads only the request fields
// its algorithm needs and ignores the rest, so callers and the dispatcher in
// `generate.ts` never branch on which algorithm is selected — they hand the same
// request to whichever strategy the `?algo=` parameter resolves to. The set of
// strategies lives in `registry.ts`.

import type { PoolData, PoolVariant, VariantResult } from "./types.ts";

/**
 * The complete set of inputs any pool strategy might read. It is assembled once
 * per generation in `generate.ts` from the public arguments and passed unchanged
 * to the selected strategy; each strategy destructures only the fields its
 * algorithm consumes.
 */
export interface PoolGenerationRequest {
  /** Seeded PRNG for this run, already constructed from the resolved seed. */
  rng: () => number;
  /** The reconstructed generator inputs (core cards, archetype/draft lists, …). */
  poolData: PoolData;
  /**
   * A Dreamcaller's `draftArchetypes`: color+archetype slices that seed the
   * color-walk strategies (`default`, `diverse`) and bias the decklist strategies.
   * Omitted for the unconstrained random pool.
   */
  seedArchetypes?: readonly string[];
  /**
   * A Dreamcaller's mechanic-archetype tide slugs, used by the `decklists`
   * strategy to bias toward that theme. Other strategies ignore it.
   */
  themeArchetypes?: readonly string[];
  /**
   * A Dreamcaller's signature card UUIDs, used by the `idf3` strategy to steer
   * its decklist starter draw and by `picksig` to bias its pick-affinity seed
   * draw toward the Dreamcaller's region of the card space. Other strategies
   * ignore it.
   */
  signatureCards?: readonly string[];
  /**
   * Pin the pool to this many copies; omitted for each strategy's own default
   * size band.
   */
  targetSize?: number;
  /**
   * The Dreamcaller's stable UUID, used by the `tides` strategy to look up the
   * Dreamcaller's baked favored tide decks. Other strategies ignore it; when
   * omitted the `tides` strategy draws all its tide decks at random.
   */
  dreamcallerId?: string;
}

/**
 * One pool-construction algorithm. The `id` is the value the `?algo=` URL
 * parameter uses to select it (and the value recorded on
 * {@link GeneratedPool.variant}); `description` is a one-line summary surfaced in
 * docs and tooling. `generate` runs the algorithm against a uniform request.
 *
 * To add an algorithm: implement its generator, export a `PoolStrategy` for it
 * from the same module, and register it in `registry.ts` (the union in
 * `types.ts` makes the registry exhaustive, so the compiler flags a missing
 * entry). No dispatcher or call site needs to change.
 */
export interface PoolStrategy {
  readonly id: PoolVariant;
  readonly description: string;
  generate(request: PoolGenerationRequest): VariantResult;
}

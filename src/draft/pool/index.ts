// Browser port of `scripts/generate-color-pool.mjs`. It builds a random,
// color-coherent Dreamtides card pool from per-card metadata — see
// `docs/cards2/draft_pool_algorithms.md` for the full design.
//
// The generator's inputs are reconstructed from `cards_v2.toml` records (loaded
// in the browser via `cards-v2-database.ts`): `core` cards seed every pool,
// `tides` supply the mechanic-archetype themes, and `colors` / `draftArchetypes`
// supply the color-combo lists and color+archetype slices. The output is a
// multiset of card *names*; the caller maps those names onto `cards_v2.toml`
// records.
//
// The implementation is split across the `color-pool/` directory: shared
// infrastructure (`constants`, `types`, `rng`, `util`, `pool-data`, `themes`)
// plus one module per generation variant (`variant-color-pool`, `variant-diverse`,
// `variant-decklists`, `variant-idf`, `variant-idf2`, `variant-idf3`). Each
// variant module exports a {@link PoolStrategy}; the
// `registry` collects them and `generate` dispatches through it. This file
// re-exports the public surface so existing importers (including the `.mjs`
// tooling that imports `color-pool.ts` directly) keep a single stable entry
// point.

export { buildPoolData } from "./pool-data.ts";
export { generatePool, generatePoolFromData } from "./generate.ts";
export { poolToLines } from "./util.ts";
export {
  applyOverlay,
  deserializeCorpus,
  serializeCorpus,
  DEFAULT_DECIMALS,
} from "./affinity-corpus-io.ts";
export type {
  AffinityCorpusJson,
  AffinityOverlay,
  AffinityOverlayEntry,
  SerializeCorpusOptions,
} from "./affinity-corpus-io.ts";
export type { AffinityCorpus } from "./affinity-grower.ts";
export { idfCorpus, idfCosine } from "./variant-idf.ts";
export type { IdfCorpus, IdfDeck } from "./variant-idf.ts";
export { validateTideDecks } from "./tides-io.ts";
export type {
  TideDeckCardJson,
  TideDeckJson,
  TideDecksJson,
} from "./tides-io.ts";
export { validateTideRelationships } from "./tide-relationships-io.ts";
export type { TideRelationshipsJson } from "./tide-relationships-io.ts";
export { validateTides3Decks } from "./tides3-io.ts";
export type {
  Tides3DeckJson,
  Tides3DecksJson,
  Tides3DreamcallerPool,
  Tides3Role,
} from "./tides3-io.ts";
export { validateTides4Decks } from "./tides4-io.ts";
export type {
  Tides4DeckJson,
  Tides4DecksJson,
  Tides4DreamcallerPool,
  Tides4Role,
} from "./tides4-io.ts";
export { DEFAULT_POOL_VARIANT } from "./types.ts";
export {
  POOL_STRATEGIES,
  POOL_VARIANT_IDS,
  isPoolVariant,
  poolStrategyFor,
  resolvePoolVariant,
} from "./registry.ts";
export type { PoolGenerationRequest, PoolStrategy } from "./strategy.ts";
export type {
  GeneratedPool,
  PoolCard,
  PoolData,
  PoolVariant,
} from "./types.ts";

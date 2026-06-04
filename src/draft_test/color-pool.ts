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
// plus one module per generation variant (`variant-default`, `variant-diverse`,
// `variant-decklists`, `variant-merged`, `variant-idf`, `variant-idf2`) wired
// together by `generate`. This file re-exports the public surface so existing
// importers (including the `.mjs` tooling that imports `color-pool.ts` directly)
// keep a single stable entry point.

export { buildPoolData } from "./color-pool/pool-data.ts";
export { generatePool, generatePoolFromData } from "./color-pool/generate.ts";
export { poolToLines } from "./color-pool/util.ts";
export { DEFAULT_POOL_VARIANT } from "./color-pool/types.ts";
export type {
  GeneratedPool,
  PoolCard,
  PoolData,
  PoolVariant,
} from "./color-pool/types.ts";

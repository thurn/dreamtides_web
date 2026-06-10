// The registry of pool-construction strategies: the single place that knows
// which generation algorithms exist. `generate.ts` dispatches through it, and
// the `draft_test` harness derives the `?algo=` option set and the variant chip
// cycle from it, so no other code enumerates or branches on individual
// algorithms.
//
// `POOL_STRATEGIES` is typed as `Record<PoolVariant, PoolStrategy>`, so the
// compiler requires exactly one entry per id in the {@link PoolVariant} union —
// adding an id there without registering its strategy (or vice versa) is a type
// error. To add an algorithm: extend the union in `types.ts`, export a
// {@link PoolStrategy} from its variant module, and add it here.

import type { PoolStrategy } from "./strategy.ts";
import { DEFAULT_POOL_VARIANT, type PoolVariant } from "./types.ts";
import { colorPoolStrategy } from "./variant-color-pool.ts";
import { decklistsStrategy } from "./variant-decklists.ts";
import { diverseStrategy } from "./variant-diverse.ts";
import { embeddedStrategy } from "./variant-embedded.ts";
import { idfStrategy } from "./variant-idf.ts";
import { idf2Strategy } from "./variant-idf2.ts";
import { idf3Strategy } from "./variant-idf3.ts";
import { idf4Strategy } from "./variant-idf4.ts";
import { pickChoiceStrategy } from "./variant-pickchoice.ts";
import { pickCohereStrategy } from "./variant-pickcohere.ts";
import { pickEarlyStrategy } from "./variant-pickearly.ts";
import { pickPosStrategy } from "./variant-pickpos.ts";
import { pickSigStrategy } from "./variant-picksig.ts";
import { pickfitStrategy } from "./variant-pickfit.ts";
import { seedStrategy } from "./variant-seed.ts";
import { sigSeedStrategy } from "./variant-sigseed.ts";
import { tidesStrategy } from "./variant-tides.ts";
import { tides2Strategy } from "./variant-tides2.ts";

/** Every registered strategy, keyed by the `?algo=` id that selects it. */
export const POOL_STRATEGIES: Record<PoolVariant, PoolStrategy> = {
  color_pool: colorPoolStrategy,
  diverse: diverseStrategy,
  decklists: decklistsStrategy,
  idf: idfStrategy,
  idf2: idf2Strategy,
  idf3: idf3Strategy,
  idf4: idf4Strategy,
  seed: seedStrategy,
  pickfit: pickfitStrategy,
  pickearly: pickEarlyStrategy,
  pickpos: pickPosStrategy,
  pickchoice: pickChoiceStrategy,
  pickcohere: pickCohereStrategy,
  picksig: pickSigStrategy,
  sigseed: sigSeedStrategy,
  embedded: embeddedStrategy,
  tides: tidesStrategy,
  tides2: tides2Strategy,
};

/**
 * The registered strategy ids, in registration order. This is the authoritative
 * `?algo=` option list and the order the draft-test variant chip cycles through.
 */
export const POOL_VARIANT_IDS = Object.keys(POOL_STRATEGIES) as PoolVariant[];

/** Whether `value` is a registered pool-strategy id. */
export function isPoolVariant(value: unknown): value is PoolVariant {
  return typeof value === "string" && value in POOL_STRATEGIES;
}

/**
 * Resolve a raw `?algo=` value to a registered strategy id. An absent value
 * (null/undefined/empty string) uses {@link DEFAULT_POOL_VARIANT}; any other
 * value must name a registered strategy, or this throws. An unrecognised
 * `?algo=` is a hard error rather than a silent fall-through to the default.
 */
export function resolvePoolVariant(value: unknown): PoolVariant {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_POOL_VARIANT;
  }
  if (!isPoolVariant(value)) {
    throw new Error(
      `Unrecognized ?algo= pool variant: ${JSON.stringify(value)}. ` +
        `Valid variants: ${POOL_VARIANT_IDS.join(", ")}.`,
    );
  }
  return value;
}

/** Look up the strategy for a registered id. */
export function poolStrategyFor(variant: PoolVariant): PoolStrategy {
  return POOL_STRATEGIES[variant];
}

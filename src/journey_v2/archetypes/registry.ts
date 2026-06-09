import { dreamsignBuilder } from "./dreamsign";
import { strongCardBuilder } from "./grant";
import type { MerchantArchetypeBuilder } from "./types";

/**
 * Every registered archetype builder. Stage 1 of the generator weighted-rolls
 * over the eligible subset of this list.
 *
 * Only the two end-to-end archetypes (`strong_card`, `dreamsign`) are
 * registered so far; the remaining 16 land in later tasks, each weighted in
 * `MERCHANT_TUNING.weights` and family-tabled in
 * `MERCHANT_ARCHETYPE_FAMILIES` ahead of registration.
 */
export const MERCHANT_ARCHETYPE_BUILDERS: readonly MerchantArchetypeBuilder[] = [
  strongCardBuilder,
  dreamsignBuilder,
];

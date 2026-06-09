import { dreamsignBuilder } from "./dreamsign";
import {
  cardBundleBuilder,
  categoryDraftKnownBuilder,
  copiesDraftBuilder,
  fitCardDraftBuilder,
  fitCardGrantBuilder,
  premiumDraftBuilder,
  strongCardBuilder,
  transfiguredDraftBuilder,
} from "./grant";
import type { MerchantArchetypeBuilder } from "./types";

/**
 * Every registered archetype builder. Stage 1 of the generator weighted-rolls
 * over the eligible subset of this list.
 *
 * Each builder is weighted in `MERCHANT_TUNING.weights` and family-tabled in
 * `MERCHANT_ARCHETYPE_FAMILIES`; the registry invariant test cross-checks both
 * tables against this list. Archetypes still pending implementation are added
 * here as their family files are filled in.
 */
export const MERCHANT_ARCHETYPE_BUILDERS: readonly MerchantArchetypeBuilder[] = [
  strongCardBuilder,
  fitCardGrantBuilder,
  fitCardDraftBuilder,
  copiesDraftBuilder,
  premiumDraftBuilder,
  categoryDraftKnownBuilder,
  cardBundleBuilder,
  transfiguredDraftBuilder,
  dreamsignBuilder,
];

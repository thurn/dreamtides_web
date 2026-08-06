import { dreamsignBuilder } from "./dreamsign";
import { duplicateBuilder } from "./duplicate";
import {
  cardBundleBuilder,
  categoryDraftKnownBuilder,
  copiesDraftBuilder,
  fitCardDraftBuilder,
  fitCardGrantBuilder,
  strongCardBuilder,
  transfiguredDraftBuilder,
} from "./grant";
import {
  starterTransfigureBuilder,
  transfigureBuilder,
} from "./improve";
import { purgeBuilder } from "./remove";
import { addSiteBuilder } from "./site";
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
  categoryDraftKnownBuilder,
  cardBundleBuilder,
  transfiguredDraftBuilder,
  transfigureBuilder,
  starterTransfigureBuilder,
  purgeBuilder,
  duplicateBuilder,
  dreamsignBuilder,
  addSiteBuilder,
];

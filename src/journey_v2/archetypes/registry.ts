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
 * Each builder is weighted and family-checked against Augury data at encounter
 * generation.
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

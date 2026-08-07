import { dreamsignBuilder, dreamsignDraftBuilder } from "./dreamsign";
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
  keywordModBuilder,
  tribalChangeBuilder,
} from "./improve";
import { purgeBuilder, purgeReplaceBuilder } from "./remove";
import { addSiteBuilder } from "./site";
import type { MerchantArchetypeBuilder } from "./types";

/**
 * Every registered archetype builder. Stage 1 of the generator weighted-rolls
 * over the eligible subset of this list.
 *
 * Each builder is enabled, weighted, and family-checked against augury.toml at
 * encounter generation. Keeping all implementations registered lets a designer
 * activate a dormant archetype with a data edit.
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
  keywordModBuilder,
  tribalChangeBuilder,
  purgeBuilder,
  purgeReplaceBuilder,
  duplicateBuilder,
  dreamsignBuilder,
  dreamsignDraftBuilder,
  addSiteBuilder,
];

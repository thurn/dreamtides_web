/**
 * Every tunable constant for the Dream Merchant lives here and ONLY here.
 *
 * The metrics harness (`scripts/merchant-experiment.ts`) tunes the merchant by
 * editing this object; no other module should bake in a weight, band fraction,
 * blend ratio, or eligibility threshold.
 */
export const MERCHANT_TUNING = {
  /** Stage-1 lottery weight per archetype id. */
  weights: {
    fit_card_grant: 10,
    fit_card_draft: 10,
    copies_draft: 6,
    strong_card: 8,
    premium_draft: 6,
    category_draft_known: 10,
    card_bundle: 8,
    transfigured_draft: 6,
    transfigure: 10,
    starter_transfigure: 6,
    keyword_mod: 8,
    tribal_change: 6,
    purge: 8,
    purge_replace: 8,
    duplicate: 8,
    dreamsign: 8,
    dreamsign_draft: 6,
    add_site: 6,
  },
  /** Default band: keep the top 25% (minimum 5) and uniform-sample within. */
  bandFraction: 0.25,
  bandMinimum: 5,
  /** Tighter bands for the premium/strong archetypes. */
  strongBandFraction: 0.15,
  premiumBandFraction: 0.1,
  /** Loose band for the small dreamsign population. */
  dreamsignBandFraction: 0.4,
  /** Premium draft signal blend over normalized quality and fit. */
  premiumBlend: { quality: 0.8, fit: 0.2 },
  /** Transfigure signal blend over benefit and centrality. */
  transfigureBlend: { benefit: 0.7, centrality: 0.3 },
  /** Duplicate signal blend over multiplicity and leave-one-out fit. */
  duplicateBlend: { multiplicity: 0.6, fitLoo: 0.4 },
  /** Card-bundle grow-step blend over seed/bundle affinity and fit. */
  bundleBlend: { seed: 0.5, bundle: 0.3, fit: 0.2 },
  /** Weight on deck-affine categories in category sampling (vs the full universe). */
  categoryAffineWeight: 0.75,
  /** Minimum deck size before fit-driven archetypes are eligible. */
  minDeckForFit: 6,
  /** Minimum deck size before purge archetypes are eligible. */
  minDeckForPurge: 8,
  /** Bottom fraction of leave-one-out misfit that becomes purge-eligible. */
  purgeMisfitFraction: 0.2,
  /** Misfit bonus applied to starter entries when ranking purge candidates. */
  starterPurgeBonus: 0.25,
  /** Minimum multiplicity for the copies-draft candidate filter. */
  copiesMultiplicityMin: 0.15,
  /** Minimum multiplicity for the duplicate candidate filter. */
  duplicateMultiplicityMin: 0.1,
  /** Characters of a subtype required for that tribe to be active. */
  tribalThreshold: 4,
  /** Minimum candidate cards for a category to be offerable. */
  categoryMinPoolCards: 8,
  /** Minimum non-starter pool cards for a subtype to become a category. */
  subtypeMinPoolCards: 12,
} as const;

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
  /** Tighter band for the strong-card archetype. */
  strongBandFraction: 0.15,
  /** Loose band for the small dreamsign population. */
  dreamsignBandFraction: 0.4,
  /**
   * Band for `tribal_change`, which band-samples one (off-tribe character,
   * tribe) pair by centrality. A tighter band keeps offers on the deck's more
   * central characters — the cards worth converting — instead of dipping into
   * low-centrality pairs that share the fallback centrality value. Overrides the
   * default `bandMinimum` (5), whose floor would otherwise pull low-centrality
   * ties into the band for small candidate sets.
   */
  tribalBandFraction: 0.25,
  tribalBandMinimum: 2,
  /**
   * Strong-card signal blend over normalized quality and fit. Quality-led (the
   * card should be genuinely powerful) but with enough fit weight that an
   * off-archetype bomb is pulled below a comparably strong on-archetype card.
   */
  strongBlend: { quality: 0.7, fit: 0.3 },
  /** Transfigure signal blend over benefit and centrality. */
  transfigureBlend: { benefit: 0.7, centrality: 0.3 },
  /**
   * Duplicate signal blend over corpus quality and the entry's leave-one-out
   * fit within the deck — "duplicate your strongest, most synergistic card."
   */
  duplicateBlend: { quality: 0.5, fitLoo: 0.5 },
  /**
   * Copies-draft signal blend over fit-to-deck and corpus quality, so the
   * doubled card is both a deck fit and genuinely strong.
   */
  copiesBlend: { fit: 0.6, quality: 0.4 },
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
  /** Characters of a subtype required for that tribe to be active. */
  tribalThreshold: 4,
  /** Minimum candidate cards for a category to be offerable. */
  categoryMinPoolCards: 8,
  /** Minimum non-starter pool cards for a subtype to become a category. */
  subtypeMinPoolCards: 12,
} as const;

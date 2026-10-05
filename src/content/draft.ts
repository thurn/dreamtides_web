// Configures Draft-site offers, run-wide rarity limits, and draft-pool generation.

export const DRAFT = {
  offers: {
    // Number of cards shown to the player in each draft offer.
    cardsPerOffer: 4,
    // Number of cards the player picks before a Draft site is complete.
    picksPerSite: 5,
  },
  // Per-rarity exceptions to the strategy-wide copy cap.
  rarityCaps: [
    // Maximum copies of each card of this rarity in the generated pool.
    // Maximum total cards of this rarity picked during an entire run.
    {
      rarity: "Legendary",
      poolCopyCap: 1,
      maxPicksPerRun: 1,
    },
  ],
  pool: {
    defaultStrategy: "tides4",
    tides4: {
      // Total card copies dealt into the generated draft pool.
      dealSize: 150,
      // Default maximum copies of any one card in the pool.
      copyCap: 2,
      // Maximum distinct facets used to build the pool.
      maxFacets: 3,
    },
  },
};

// Shared Dreamwell deck-construction rules.
//
// Controls how the shared deck is assembled from each card's deck tier (`order`).
// Cards are shuffled only within their tier, using the battle's deterministic
// Dreamwell RNG stream.

export const DREAMWELL_RULES = {
  // Tiers sampled in order for every cycle. Numbered
  // tiers One through Four lower to compatibility orders 1 through 4.
  recurringOrders: [1, 2, 3, 4],
  // Maximum cards sampled from each recurring tier per cycle. A smaller tier
  // contributes every available card; no card is duplicated within a cycle.
  cardsPerRecurringOrder: 5,
  // Complete cycles are appended until the prebuilt deck reaches at least
  // this many cards. The final cycle may take the deck beyond this threshold.
  minimumConstructedLength: 62,
};

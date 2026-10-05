// Opponent difficulty progression and deck-generation tuning.
//
// Layer values are zero-indexed Atlas completion levels: layer 0 is the first
// battle and the final layer is `layer_count - 1`. Curve endpoints are sampled
// at those two ends and linearly interpolated between them.

export const OPPONENTS = {
  // Mature opponent decks contain this many distinct cards before progression
  // inserts Starter cards at early layers.
  opponentDeckSize: 30,
  // Journey opponent difficulty schedule. Ability and Dreamsign unlocks apply
  // to every opponent; Legendary retention and Starter dilution tune decks.
  progression: {
    // The opponent Avatar's ability is inactive below this layer.
    abilityActiveFromLayer: 1,
    // Opponents receive one deterministically selected Dreamsign from this
    // layer onward, provided Dreamsign templates are available.
    dreamsignsFromLayer: 3,
    // Opponent decks replace Legendary cards below this layer and retain them
    // from this layer onward.
    legendariesFromLayer: 5,
    // Number of Starter cards inserted by layer tuning. The
    // least-synergistic non-Starters are cut first, preserving deck size.
    // Layers beyond this list insert zero Starters.
    starterDilution: [10, 5],
  },
};

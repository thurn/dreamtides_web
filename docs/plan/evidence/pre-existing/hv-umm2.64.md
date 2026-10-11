# Pre-existing issues found by hv-umm2.64

- `src/engine/effects/primitives/discover.ts` (`shuffleDeck`): a private deck-shuffle helper (shuffle from `shuffle:<side>`, then drop every card in the deck from both sides' knowledge) that `src/engine/effects/primitives/shuffle-into.ts` (`shuffleDeck`) now duplicates, since discover.ts was outside this bead's areas. One shared helper, owned by `shuffle-into.ts` or by `rules/`, should serve both, so a deck shuffle has a single definition of the knowledge it ends.

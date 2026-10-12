# hv-umm2.452 pre-existing observations

`CardFilter` readers outside this bead's areas compare filters field by field and name only type, subtype and cost. No authored card reaches them with a ✦ bound yet; each needs the bound before a card does:

- `src/engine/effects/primitives/draw-matching.ts` `publicFilter`: two `drawMatching` filters that differ only in `sparkAtMost` / `sparkAtLeast` compare equal, so a hidden branch's ✦ bound could count as a public matching criterion for the opponent's deck-position tracking.
- `src/rules/battle/fold.ts` `isCardFilter`: the saved-state validator checks `cardType`, `subtype`, `costAtMost` and `costAtLeast` only; a saved floating change whose filter carries a malformed ✦ bound is accepted unvalidated.
- `src/runtime/battle-prompt-messages.ts` `permittedCardKind` and the `playFrom` qualification check: a play permission or "cannot play" status whose filter has a ✦ bound is described without it.

The Discover gallery's title is the generic Discover copy ("Discover a card"), which does not restate the card's criterion (here "≤2✦ character"); the same holds for every Discover card.

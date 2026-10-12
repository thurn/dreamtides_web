# hv-umm2.531 pre-existing observations

- `src/screens/cumulus_adapters/mobile-battle-view-model.ts` (`buildCardPickerView`, the tutorial's `pick-cards` prompts): the builder leaves `ringCandidates` unset, so a board `pick-cards` prompt rings only its `highlighted` candidates (the Dreamwell discard's just-drawn card) and the player cannot see which other cards are legal. Ringing them there needs a distinct look for the just-drawn highlight first.

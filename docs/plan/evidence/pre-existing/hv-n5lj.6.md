# hv-n5lj.6 pre-existing issues

Found during the Phase 4.4 presentation QA at staging `20a249125`, on the
journey battle on the engine.

- **A prompt's source card hides board candidates on mobile.**
  `buildPromptHost` (`src/screens/cumulus_adapters/prompt-host-view-model.ts`)
  shows the source card at reading size (`revealedHandCard`) beside every
  board-picker prompt. At 390×844 with a full back rank, the card covers the
  right half of the near back rank, so an abandon cost cannot pick the
  characters under it (`?goto=prompt-lab-present-costs`, Lab Sacrificer's
  "Abandon a character").
- **The player cannot pay to end an effect.** `affordancesOf`
  (`src/screens/cumulus_adapters/engine-battle-view-model.ts`) drops the
  engine's legal `payToEnd` actions, so "until the opponent pays N●" effects
  on the player's characters offer no control to pay
  (`?goto=prompt-lab-present-opponent` when the AI plays Lab Shackles).
- **Mobile hand cards sit left of their fan positions.** In `NearHand`
  (`src/cumulus/screens/MobileBattleScreen.tsx`) each card face renders at the
  left of a wider positioned wrapper, so at 390×844 a fanned hand's faces are
  about 29 px left of their nominal positions and the fan is not centered.

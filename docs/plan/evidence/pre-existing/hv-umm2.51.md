# hv-umm2.51 pre-existing issues

Seen at staging `5f8304aa1` during judged QA of the pilot-02 cards.

- **The battle screen shows no targets for items on the stack.** The view
  carries each stack item's chosen targets (`src/engine/view/view.ts`,
  `targets`), but `src/battle/components/EngineBattleScreen.tsx` renders no
  marker for them, so in a response window to an enemy's targeted play the
  human cannot see which character it targets
  (`worlds-await-enemy-desktop-stack.png`). Affects every targeted card
  played by the enemy (D21 check 6).
- **Foresee leaves no trace in the battle log.**
  `src/engine/effects/primitives/foresee.ts` moves the cards a player puts
  into the void with no engine event, so the log reads only "… triggered
  ability resolved." for either side, and nothing says that a card went to
  the void (`ringwatcher-mobile-log.png`, `ringwatcher-enemy-desktop-log.png`).
  Affects every Foresee card (D21 checks 4 and 6).
- **The debug-panel button overlaps the target prompt's Cancel on mobile.**
  With `debug=1` at 390×844 the engine debug toggle (x 338–378) covers the
  right edge of the "Choose a target" banner's Cancel button (x 269–357);
  Cancel's centre still hits (`worlds-await-mobile-targets.png`).
  Development only; the same toggle over the battle log's close button is
  recorded in `hv-umm2.49.md`.

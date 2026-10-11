# Pre-existing issues found by hv-umm2.67

- `src/runtime/battle-prompt-messages.ts` (`engineBattleNoticeCopy`, `autoAnswered`): the "Chosen for You" notice names only the prompt kind ("only one possible card"), not the auto-answered role, so a notice for an auto-answered discard reads as describing the next card prompt (a two-card Discover offer) shown beneath it.
- Battle notice placement (suspected `src/cumulus/screens/MobileBattleScreen.tsx`): on mobile the notice covers the card picker's Submit button while it is shown.
- `scripts/qa/prelude.mjs` (`qa.labAddCard`, `qa.labStage`): neither stages deck cards, though the engine debug panel's `addCard` accepts the `deck` zone; card-lab decks hold only 1● characters, so a Discover cost bound above 1● cannot be judged without driving the debug panel directly.

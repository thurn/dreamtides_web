# Pre-existing issues found by hv-umm2.320

- `src/cumulus/screens/DraftScreen.tsx` (reroll `IconButton`, `testId`
  `reroll-draft-offer`): the draft reroll control renders for every player
  without the debug overlay glyph the Augury reroll uses, while
  `REROLL_DRAFT_OFFER` (`src/rules/journey/draft.ts`) and
  `JourneyMutations.rerollDraftOffer` (`src/state/journey-context.tsx`) document
  it as a shared debug-only reroll.
- `src/state/journey-context.tsx` (`JourneyMutations`, after
  `setMaxDreamsigns`): the doc comment "Debug-only: set `completionLevel` to
  `value`." describes no member; it sits directly above
  `setDeckEntryStatOverride`'s own comment.

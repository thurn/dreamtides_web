# hv-7x4l.40 pre-existing issues

- **A copy's target choice with no legal option gets no targets instead of
  keeping the original's.** `docs/rules.md` § Playing Cards and the Stack →
  Copies on the stack and RD-hv-7x4l.8-4 say a copy's choice with no legal
  option keeps the original's. `copyOnStack` (`src/engine/rules/copies.ts`)
  falls back to the original's choices only when `chooseOnResolution`
  (`src/engine/effects/interpreter.ts`) returns `null`, which happens only
  for a modal node with no legal mode. A target spec with too few candidates
  gets an empty target list and emits `noLegalTarget` as the copy is
  created. The outcome matches the rule whenever the original's targets are
  still illegal for the copy's controller when the copy resolves, because
  resolution re-checks every chosen target. It differs when they become
  legal before the copy resolves, for example after a control change, and
  the stack item and its view show no targets for the copy.
- **A rules sentence could state the resolution-time reading of "cannot be
  targeted by effects".** `docs/rules.md` § Targeting says such a card
  "cannot be chosen as a target", and that a required choice with no legal
  option when the card resolves does nothing. The engine reads both together:
  a chosen target that gains the keyword before the effect resolves is no
  longer a legal target and is skipped, as RD-hv-7x4l.8-4 describes for
  illegal targets. One sentence in § Targeting would make this explicit.

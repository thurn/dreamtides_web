# Pre-existing issues found by hv-umm2.417

- **A loop offer reflects how hidden cards behaved during its history.**
  Rules § Optional Loops offer a loop only when the position repeats with a
  gain for the actor, none for the opponent, and no real choice by the
  opponent. A trigger working from a hidden hand can decide each of these
  (it can give the opponent a resource, or a choice, or neither), so
  whether a loop is on offer, and therefore whether its recording is shown
  or withheld, can differ between hidden states that otherwise look alike
  to the actor. The view's recording never carries prompt fingerprints
  (`loopRecording` in `src/engine/view/view.ts`); the offer itself is public
  by the rules.

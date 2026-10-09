# hv-n5lj.1 pre-existing issues

Both issues are on the 390×844 battle board at staging `df95db214`. The
reproduction is the baseline run in `docs/plan/evidence/measurements/hv-n5lj.1.md`
(`?goto=battle&seed=1`). Phase 4 keeps this screen (D30), so 4.2 and 4.3
should check whether the engine-driven board keeps either problem.

- **The leftmost card of a six-card mobile hand is almost untappable.** At
  the turn-3 Dawn discard prompt the hand holds six cards. The leftmost card
  (`bc_0001`, Rusted Colossus `5ab11bef-5dcd-49f5-be49-ae2ccde76e70`) has its
  bounding box at x = −72 to 109. The next card covers it from x = 5, so
  `elementFromPoint` reaches it only at x 0–4. Playwright's locator click
  times out because a neighboring picker candidate intercepts the pointer.
  Choosing it as the discard needs a tap on that 5 px strip.
- **Mobile does not render the front-rank slot ahead of the rightmost
  occupied lane.** With player characters in `B0`, `B4`, and `B6`, the mobile
  board renders front slots `F0`–`F5` and back slots `B0`–`B6`. Front slot
  `F6`, which sits between lanes 6 and 7, is not rendered, so a drag from
  `B6` toward it drops nowhere and the character stays in `B6`. On desktop
  the same move to `F6` succeeds.

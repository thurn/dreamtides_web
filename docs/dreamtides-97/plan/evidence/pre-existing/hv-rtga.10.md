# Pre-existing issues found in hv-rtga.10

- **Head starts conflict.** The design overview's decision table (S32, "No
  head starts") says both sides start every battle at 0⍟, while Appendix B
  §B10 sets the opponent's head start to the tier knob plus `d` and
  Appendix A §A18 gives `d = 1` (Standard) a +1⍟ bonus. The engine has no
  starting-score input outside a full `BattleSetup`. M1 uses the tier knob
  alone (0 at tiers 4 and 7), so both head starts show 0. Docs alignment
  (plan bead 2.1) should settle which rule holds.
- **Ante drift value.** Appendix A §A9 re-rolls a drifted ante among active
  copies whose sale value in this dream is at least the original's. Sale
  quotes arrive with the shop (plan bead 1.11); until then drift compares
  rarity cost points (Appendix A §A3).

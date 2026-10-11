# Pre-existing issues found by hv-umm2.63

- `src/engine/testing/prompt-lab.ts`: `LAB.shuffleInto` and `LAB.choosePlayer` both use `labEvent(11, …)`, so they share synthetic card id `0x30b`; the `shuffle-into` lab fixture plays the choose-player card and bounces, failing three prompt-lab cases in `src/engine/testing/tooling.test.ts` and `src/screens/cumulus_adapters/engine-battle-view-model.test.ts` on the base commit (filed separately; this bead's own lab card uses index 13).
- Battle screen on a phone (390×844): during a response window the prompt banner ("Respond or Pass") covers the battle log control at the top left, so the log cannot be opened until the window closes.

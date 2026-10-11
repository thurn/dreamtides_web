# hv-umm2.350 verification

Base: `bccb8d418beec1d79163ae27030ba64a9bbf5a7c`.

The shared-object contract reproduces the reported extra resolution-time mode prompt on the unchanged base for both active sides. Final synthetic public contracts exercise inherited mode zero and mode one, retained empty targets, distinct local choices, unequal ordered mode values, nested nearest bindings, actual target banishment, and serialized reload at a fresh local target. The contract module contains 373 lines; the change adds seven cases without another test module.

| Check | Execution (s) | Heavy wait (s) | Result |
| --- | ---: | ---: | --- |
| negative | 2.164 | 0.021 | 2 expected failures: extra prompt |
| positive | 2.258 | 0.020 | 17 choosePlayer cases pass |
| focused | 5.264 | 0.019 | 300 tests / 3 files pass |
| review | 3.967 | 72.920 | lint failed at new JSON fixture annotation |
| focused-cancelled | unmeasured | 76.431 | SIGINT exit 130; excluded from passing evidence |
| focused-final | 5.429 | 24.057 | 311 tests / 4 files, copies explicit |
| review-final | 38.248 | 8.421 | 2266 related tests / 157 files and static checks |
| knip | 2.801 | 0.021 | pass |
| full | 52.285 | 6.168 | 2900 tests / 216 files and production bundle |
| fuzz | 60.436 | 0.022 | 300 games, 153351 steps, 2677 prompts, 294 interactive reruns, zero failures |

The cancelled run acquired the heavy slot during cancellation after an initial waiting-process probe. Only its owned process group received SIGINT, its tool session exited 130, and its command and group members were absent afterward. Its partial output is retained separately. All recorded final check PIDs and the full-suite contained synthetic server PIDs were absent at the final audit.

Existing choosePlayer contracts cover X, controller, optional costs, shared duration, delayed-trigger root provenance, wrong-side and stale answers, concurrent intents, rollback and cancellation. Existing fold, trigger and stack-copy tests cover their default preparation callers. Prompt/action records and the fresh-adapter reload contract exercise the existing replay protocol; no additional persisted record is required.

The final source SHA-256 manifest and formal failure-path names are in the bead friction evidence. Scratch retains the actual negative, each command log and timing/PID JSON, the initial and final frozen manifests, and `failure-paths.json`. Independent other-family review and delivery belong to the parent executor.

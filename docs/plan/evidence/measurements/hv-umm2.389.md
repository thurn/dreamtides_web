# hv-umm2.389 declared enemy activation

Base: `6c84b1be6ed7b5c9d3c6afe3375994799aa355b6`. Native claim:
2026-10-11 16:07:44 UTC.

## Public tooling contract

The declared enemy script accepts `{ kind: "activate", ref, ability }`.
The existing strict declaration parser accepts only the action's exact fields,
a valid initial physical reference and a non-negative safe-integer ability
index. The existing initial-board resolver constructs the normal engine
activation action with that physical source. Live legality, intent submission,
prompt hosting and successful replayed history determine execution and script
progress. The cursor body and ordinary policy remain unchanged.

One new synthetic contract activates the second physical copy of one printing,
with a prompted choice and an exhausted cost. It checks the public activation
event, score and exhaustion, repeated and cloned persisted reads, cancellation,
completion and debug undo. Existing contracts retain error-recovery and normal
policy coverage for the shared cursor. Malformed missing, negative, fractional,
string and unsafe ability indices, extra fields and an unavailable ability
reject. The existing file grows by 50 lines to 487, with one added case and
zero added test runners or jsdom files. No test depends on production data,
UI copy, timing thresholds or private cursor details.

## Settled verification

Fresh install: 2.232 s. Focused: 20 cases in one file, 2.708 s command wall.
Review: 283 cases in 16 runners plus lint, both typechecks and cycles,
12.606 s. Knip: 3.247 s. One required full check ran under the machine-wide
heavy lock: 3,300 cases in 323 files, 40.92 s Vitest, 65.940 s command wall
including the lock command, preparation, static checks, build, production
development-module exclusion and restoration. Full load start/end: 5.732/8.409.
The lock wait was not separately measured. These are observations rather than
load-controlled timing thresholds. Earlier fixture and strict QA typing
corrections are retained in friction and temporary validation logs.

Every check and workspace restoration settled before browser startup. Six
executable/test/policy/content hashes in `frozen-source.json` match after
browser cleanup. The only production-path engine behavior reached by the
declared script is the existing action/answer driver.

## Tracked desktop/mobile acceptance

`card-lab-enemy-activate` stages printing
`db4618f6-121b-4c97-98d3-c29849c5824e` at enemy B1, with B0 empty,
two distinct void instances of `5e5e5e5e-0000-4000-8000-00000000000c`,
and enemy energy 0. The human holds the existing 1-energy Interrupt and Fast
event with energy 1, giving an actual response control and a Dusk hold.

Desktop game `kigzxe` and mobile `4d6ypo` both submit a normal enemy
activation intent for physical source `i11`, ability 0. Actual attributed
`abilityActivated` event key (3,1) confirms its source printing. The normal
host chooses physical void target `i20`; the scenario derives that identity
from its accepted answer and effect, without asserting a default ranking.
Actual `effectStarted` key (4,1), effect `e1`, grants permanent Reclaim
to that target. Its zone stays void, source status is exhausted, and enemy
energy stays 0. The immutable initial helper checks both duplicate target
printings and distinct physical identities. Scripted activation is not evidence
of a policy-selected AI action.

History contains the exact enemy activation and accepted target answer.
IndexedDB JSONL contains source `i11` ability 0 in `engine.action`, the
source printing UUID in `engine.promptOpened`, and target `i20` in
`engine.promptAnswered`; activation's recorded answers agree. Those log
sequence values are a separate namespace from the observed engine-event keys.

Positive in-viewport source geometry: desktop B1 enemy-back at
(348,183), 89.5 by 89.5; mobile at (81.265625,222.3125), 53.859375 square.
The human response button is 120 by 42, at (1120.5,597) desktop and
(262,522.828125) mobile, with a successful centre hit in each. One human
response pass resolves each activation. Both acceptance passes have empty
error buffers. Cold-viewed captures show the exhausted source and existing
phase control; hand imagery extends below the viewport, so they do not
certify settled hand presentation.

Exact session timing: browser lease wait 43 ms, serve 1,256 ms, scenario
9,939 ms, total 11,260 ms. Wrapper wall 16.534 s has a different scope.
Report host load: 6.53662109375. Strict first-free port 5174 was confirmed
free after cleanup. Runner group 66606 and server group 66620 are absent in
fresh process checks. Browser context, active RPCs, provider/client and SDK
transport completed normal close before releasing the shared lease. No peer
resource was stopped.

Ignored artifacts: `card-lab-enemy-activate.result.json`,
`card-lab-enemy-activate.server.log`, `card-lab-enemy-activate-desktop.png`,
`card-lab-enemy-activate-mobile.png`.
Actual report SHA-256:
`8ddf56d616779f2afc429301a4c9cef17447dbcaadf974939e2d862cc2221bb0`.

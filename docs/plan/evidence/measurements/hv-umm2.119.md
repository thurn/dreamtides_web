# hv-umm2.119 acceptance evidence

Original dispatch base: `72f5910d2c799354a5a6ac76276e8b30aaa10f2e`.
Acceptance base after the parent-managed prerequisite landing and worktree update:
`f4c9a05d9856c68f4520bcbb7d7b5730ca59ef06`.

## Clause audit and composition

All four filed UUIDs retain their immutable text, amplified text, costs, spark,
types, rarity and other catalog values. Each has authored abilities and its
verified-text hash. The content-gates test verifies the registered forms and
both variants.

| UUID | Printed clauses encoded |
| --- | --- |
| 6f0b709d-0f57-46de-bfba-6a8b4df2b991 | One conditional point gain: 3 normally / 6 on its own actual Reclaim play; amplified 4 / 8. Reclaim costs 4●. RD-hv-umm2.373-1 governs actual play history and stack copies. |
| 2a828466-450a-4637-9c68-6b54522450c0 | Materialized gains 1⍟, amplified 2⍟. Reclaim costs 0●. |
| 7ea13d02-9d97-492e-9edb-f326eb3b4d1c | Play-time additional-cost choice pays either one own character abandoned or another hand card discarded. Draw 2, amplified 3. RD-hv-7x4l.16-2 governs payable alternatives. |
| c6ae1899-c94c-464f-8edb-4a0b1ec2c981 | Play-time additional cost banishes 5 cards from the player's void. Draw 3. |

These are primitive compositions. The prerequisite's synthetic contracts cover
historical Reclaim, copies, status clearing and replay; additional costs,
Materialized, points, draws and Reclaim have their existing synthetic contracts.
There is no entity behavior beyond those forms requiring a D20 scenario module.
Composition-only test delta: zero files and lines. The bounded lab fixture repair below adds one 112-line synthetic test module, with zero jsdom files. No exported API changes or caller fallout.
No new prompt, active status indicator, visual type or UI code.

## Local checks and weighted fuzz

- Focused primitive contracts, content gates and registered specs: 386 cases passed, 5.47s elapsed; test stage 2.7s.
- Review: 137 files / 1995 cases passed, 48.58s elapsed; user CPU 106.63s, system CPU 11.97s.
- Knip: pass, 3.84s elapsed.
- Exact filed UUID pool, weighted fuzz: 300 games (seeds `fuzz-0` through `fuzz-299`), 140656 steps, 3315 prompts and 344 interactive re-runs. Zero failures, zero feasibility bounds, player/enemy wins 159/141. Engine wall 64.8s, CPU 69.9s; command elapsed 65.71s. The exact fuzz command alone held the machine heavy lock.

| Weighted UUID | Included | Exercised |
| --- | ---: | ---: |
| 6f0b709d-0f57-46de-bfba-6a8b4df2b991 | 618 | 402 |
| 2a828466-450a-4637-9c68-6b54522450c0 | 612 | 253 |
| 7ea13d02-9d97-492e-9edb-f326eb3b4d1c | 619 | 387 |
| c6ae1899-c94c-464f-8edb-4a0b1ec2c981 | 621 | 303 |

No full review is required for this composition bead. Production logs use the
existing UUID/physical-ID play, cost, trigger, draw and points events. No new
engine or host logging behavior is required.

## D21 selection and runtime

SHA-256 first bytes, in the table's UUID order: 203, 228, 26, 101. The sample
criterion is strictly less than 26, so zero cards are sampled. No new prompt,
status or visual form adds a mandatory judged entity. Judged count is zero.
No captures are required for this unchanged presentation, so capture filenames
and image-dimension checks are not applicable.

The sweep uses the native repository browser lease and port 5174, which was
free when requested. While the sweep waited on the shared browser lease,
review and knip finished their asset restoration before the sweep launched its
server or issued any browser request. No asset-materialization command runs
during the sweep.

## Workflow boundary

The initial pass authored three independent entities, then checkpointed them
without validation while the missing Reclaim condition prerequisite was filed,
implemented and delivered by the parent session. The old checkpoint is amended
into this one final bead commit. The implementation of hv-umm2.373 and its
cross-cutting validation are separate bead work, not part of this bead's code or
validation cost. Reclaim and cost-choice ambiguity notes cite the landed RDs;
the own card-issue entries propose clearer wording and preserve all card data.

## Initial sweep

The initial complete 80-verdict sweep returned **35 pass, 32 ineligible skip,
13 fail**. Elapsed 722.16s (reported sweep interval 717s), user CPU 22.56s,
system CPU 10.35s; start load 16.38. Approximately 279s preceded server startup
while the command waited for the shared browser lease. Raw verdicts and variant
provenance are preserved in `qa-ledger/hv-umm2.119.jsonl`, stamped at the
acceptance base above.

- 7ea13d02-9d97-492e-9edb-f326eb3b4d1c: 12 failures, for base, amplified, empowered, inspired, enduring and perfected, each as player and enemy. The lab rejects the fixture before play because its additional-cost staging omits both abandon and discard resources. `lab-solver.ts` has recursive choice traversal, but default empty needs for these two payment kinds; the resulting back rank is empty and the hand contains only the source. The scoped same-bead resource-staging repair and focused re-sweep below resolve these cells.
- c6ae1899-c94c-464f-8edb-4a0b1ec2c981: empowered/player timed out awaiting the initial lab report (approximately 59.7s), before the engine probe or play. The known route is `http://localhost:5174/?goto=card-lab&card=c6ae1899-c94c-464f-8edb-4a0b1ec2c981&variant=empowered&as=player&seed=1&debug=1`; the runner-added randomized game nonce is unavailable in the failure record. The document wrote no log records between 13:27:55 and 13:29:02 UTC. It has not been retried unchanged. The other eligible variants and enemy empowered passed. A fresh-document/resource hypothesis permits one focused recheck after cleanup, as authorized by the parent, with further diagnosis on recurrence.

Mandatory log inspection additionally discovered the separate worker-catalog
UUID duplication described in this bead's pre-existing file. Those failures
select the random fallback and are resolved by canonical native repair `hv-4a0x` (`8ad67fe22`), integrated in the final base below; they are distinct
from the opaque initialization timeout and from the lab fixture's missing costs.

Runtime ledger: sweeprunner PID 39109 and Vite process group 98342, served from
this worktree on 5174 through the shared Playwright MCP service. Native cleanup
completed; both processes are absent, the runner reported port free, and a
listener check confirmed 5174 free. No provider-close/transport uncertainty was
reported. Capture directory contains only `card-sweep.server.log`; no image
captures or separate judged verdicts. All other validation commands completed.

The parent widened this unlanded bead to the bounded lab resource staging and one new public test module. Canonical worker-catalog repair `hv-4a0x` is included in the final integration base below; the proposed `hv-umm2.377` filing was cancelled as its duplicate. The final acceptance results are below; no acceptance waiver occurred.


## Bounded fixture repair and final acceptance

Before any solver mutation, six deterministic synthetic cases in the new
`lab-cost-staging.test.ts` failed against the unchanged public `labBoard`
contract (2.37s elapsed). For both controllers, they exercise filtered
abandon/discard alternatives with both choices legal; compounded required and
optional matching discard/reveal payments; and coexistence with enemy targets,
void-banish payments and points. Each case pays through actual legal engine
actions and checks observable events/state and invariants.

Within the parent-widened Areas, `lab-solver.ts` collects matching hand cards and
own-character needs through existing additional-cost alternatives/optional
traversal, then stages those resources beside the existing target/void/points
fixtures. The public `labBoard` signature and exports are unchanged. The source
delta is 44 additions / 10 deletions; the new synthetic module is 112 lines.
`tooling.test.ts` is untouched because its split belongs to a peer. This is a
development lab fixture adapter; engine game rules and content catalog behavior
are unchanged, so the exact weighted-300 proof remains valid without a new
heavy run or full review.

- Focused new module, unchanged tooling, primitive contracts and content gates: 411 cases pass, 3.28s elapsed.
- Final repaired-source review: 139 files / 2036 cases pass, 29.94s elapsed, 67.20s user CPU, 8.13s system CPU.
- Final knip: pass, 3.32s elapsed. Both asset-restoration steps finished before QA startup.
- Focused repaired Abandon sweep: all twelve cells pass, 183.28s elapsed (reported sweep 178s), load 17.42. Raw command output retained as `card-sweep-abandon-repaired.log`; initial command output retained as `card-sweep-initial.log`.

| Repaired Abandon variant | Player | Enemy |
| --- | --- | --- |
| base | pass | pass |
| amplified | pass | pass |
| empowered | pass | pass |
| inspired | pass | pass |
| enduring | pass | pass |
| perfected | pass | pass |

The original twelve rejection rows and their exact variant/side provenance
remain in the ledger, followed by each matching repaired pass. The original
script's `as: enemy` rows and omitted-as player defaults are explicitly tagged
with `side` in this own ledger; no shared script changed.

Knowledge Restored's base/player representative void-banish-cost control and
**one** empowered/player recheck pass in a fresh provider context, after full
old-context cleanup and asset restoration. The explicit hypothesis was a
report-free old-document/resource initialization issue; the fixture loads a
fresh document per variant. The same 60-second cell timeout is used. The
failure does not recur; its precise root cause remains unattributed. No card
source change, blanket sweep retry or increased timeout was used.
`knowledge-empowered-fresh.result.json` retains the hypothesis, both complete
results, event kinds, empty caps and timings. Scenario time 16.293s, total
17.928s (command elapsed 23.18s), load 7.21. The empowered game `spnfx9` logs its
ready lab, play, resolution, draws and void arrival. The existing independent
historical worker-duplication fallback is documented and resolved by canonical repair `hv-4a0x`; current-base healthy worker validation is recorded below.

Final raw ledger: 94 verdicts, 49 pass / 32 ineligible skip / 13 historical fail.
Latest verdict by `(UUID, variant, side)`: **48 pass / 32 ineligible skip /
0 fail**, covering all 80 original cells. The extra pass is the repeated
base/player control. D21 judged count is zero; capture filenames are empty,
so image-dimension verification is not applicable.

Final runtime ledger: repaired-sweep Vite process group 81791 and fresh-check
process group 96249 are stopped; both native sessions completed browser and
transport cleanup. Each reported 5174 free at its own cleanup boundary. A peer
subsequently acquired 5174 (PID 96830), which this session left untouched. No
owned server, browser context, validation process or other writer remains.
Retained QA files are `card-sweep-initial.log`,
`card-sweep-abandon-repaired.log`, `knowledge-empowered-fresh.mjs`,
`knowledge-empowered-fresh.log`, `knowledge-empowered-fresh.result.json` and
server logs. There are no image files in the commit.


## Canonical worker integration and final base

Final integration base: `55ff5c40f8be0dc22a5b30c4da413b7400196c1f`, containing
canonical worker repair `hv-4a0x` (`8ad67fe22`) and the subsequent Reclaim
contracts. The parent recorded the dependency on the completed canonical bead;
`hv-umm2.377` is a cancelled duplicate filing. All original 114 worker-error
observations remain tied to `f4c9a05d9856c68f4520bcbb7d7b5730ca59ef06`.

A comparison against source commit `9e83c5a0f74ab0281a6116c5cc0d9bf9bb4308cc`
shows all four owned cards, `lab-solver.ts` and `lab-cost-staging.test.ts` are
byte-identical after the parent-managed worktree update. No current source
change or exported API fallout. The earlier weighted-300 game/catalog proof and
full 80-cell acceptance matrix retain their original base provenance. Only the
distinct worker integration risk receives two new enemy-cell checks.

- Current focused checks use `lab-cost-staging.test.ts`, the peer's current `tooling-card-lab.test.ts`, primitive contracts and content gates: 416 cases pass, 4.02s elapsed.
- Current review: 142 files / 2065 cases pass, 33.22s elapsed, 80.84s user CPU, 7.04s system CPU.
- Current knip: pass, 2.46s elapsed; asset restoration completes before browser startup.
- Worker integration: two existing base/enemy workflows pass with empty caps. Scenario 23.799s, runner total 37.543s including 12.776s browser-lease wait; command elapsed 42.75s. Host load 6.95.

| UUID / base enemy | Game ID | Ready worker boots | Decisions from worker | Error or fallback | Final zone |
| --- | --- | ---: | ---: | ---: | --- |
| 7ea13d02-9d97-492e-9edb-f326eb3b4d1c | 29td3z | 1 | 4 | 0 | void |
| 6f0b709d-0f57-46de-bfba-6a8b4df2b991 | sfoipe | 1 | 1 | 0 | banished |

The real per-game log records `ai.workerBoot` with outcome `ready` and
`ai.decision` with source `worker`, with no `ai.error`, failed boot or fallback
in either game. Secrets reaches Banished after the worker chooses its Reclaim
play. Raw filtered records are retained as `worker-integration-ai.jsonl`, and
`worker-integration.result.json` includes both actual URLs/game IDs and UI
results. The original history and resolved failure rows are preserved.

The integration used 5175, the first free port after 5174 was occupied by a peer.
An unstarted 5174 waiter was cancelled before provider/server startup. The real
integration server process group 50183 and its provider/transport are cleaned
up; 5175 is free, and the cancelled waiter PID 46100 is absent. No owned writer
remains. No peer process was stopped.

Final raw ledger: **96 verdicts, 51 pass / 32 ineligible skip / 13 historical
fail**. Latest unique original cells stay **48 pass / 32 skip / 0 fail**. The
two integration passes are stamped at the current base, and their game IDs are
explicit ledger fields. No new card scenario, fuzz run, full review, judged
entity, visual surface or image capture is needed for this dependency update.

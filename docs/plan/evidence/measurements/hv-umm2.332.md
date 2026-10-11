# Declared card-lab acceptance

Bead: hv-umm2.332. Base: `7eb7567559d742ca2aa157beb34f5c74c4312d65`.
Worktree creation: 2026-10-10 23:10:53 PDT. Parent-reported dispatch is
approximately 2026-10-11 06:13 UTC; the dispatch-to-commit implementation
interval includes read-only investigation and pre-edit design coordination.

## Validation

Every preparation, check and scenario ran under the external heavy lock with
`JOURNEY_TEST_WORKERS=2`. Waits below are outer wall time minus measured command
execution; they include small wrapper startup overhead.

| Check | Execution seconds | Heavy wait seconds | Outcome |
| --- | ---: | ---: | --- |
| Fresh preparation | 1.999 | 0.025 | 564 card images and workspace mirrors prepared |
| Final focused tests | 4.197 | 0.031 | 197 cases, 4 files |
| Isolated typecheck | 2.211 | 0.025 | App and Node types pass |
| Quick review before QA | 16.339 | 0.027 | 366 cases, 13 related files; lint/types/cycles pass |
| Knip before QA | 3.006 | 0.027 | Pass |
| Full review | 54.819 | 0.029 | 220 files, 2,823 cases; production exclusion pass |
| First declared browser run | 36.063 | 0.027 | Desktop and mobile pass |
| Final declared browser run | 68.323 | 0.034 | Desktop and mobile, exact payment pass |

Full suite: 30.83 seconds. Production bundle check: 2.5 seconds, with no
development-only module rendered. The final delta after that full check is
documentation comments and the tracked scenario's exact payment assertion/
returned payment evidence; engine/runtime/test executable behavior is the
tested behavior. Final mandatory quick review: 17.565 s execution / 0.024 s heavy wait,
366 cases in 13 related files, pass. Final knip: 2.182 s execution /
0.029 s heavy wait, pass. All final check sessions exited.

Initial failures and concrete corrections are retained in `review-first.log`,
`focused-second.log`, `review-second.log`, `review-third.log`, and
`review-final.log` in this bead's ignored capture directory, and described in
its friction file. The final focused run includes their repairs.

## Actual workflow

Both calls use the tracked `card-lab-stage` scenario with `declared=1`,
`as=enemy`, seed 1 and source UUID
`0e1209c3-1041-4079-9b1c-f96816a7deb5`.

- Initial player F1 `i1` has both adjacent supporters B1 `i2` and B2 `i3`.
  Human hand, void and energy 7 are checked against immutable history.
- Enemy energy is 9. Duplicate source bodies `i15`/`i16` and duplicate hand
  printings `i17`/`i18` keep separate physical identities. The selected `i18`
  is played through a validated intent. Selected `i16` moves from B1 to F2,
  while `i15` stays B0, and is designated for normal Challenge.
- Enemy Dusk, Night and automatic Challenge lead to human Dawn and Day;
  the human uses the normal response/phase control. The selected challenger scores 3. A staged 2-energy Fast spell
  resolves through its human target prompt, with exact current energy 5 and
  maximum 7 on both viewports.
- Read-only IndexedDB observation confirms persisted enemy `engine.action`
  records for the selected physical play, reposition and passes. All `__caps`
  buffers are empty, including load-time observations.
- The four observed cards have valid center hit points and DOM rank/slot
  ancestry. Desktop boxes are 89.5 by 89.5 CSS pixels; mobile boxes are
  53.859375 by 53.859375. The support links are exactly player F1/B1/B2.

First runner report: scenario 29.482 s, lease wait 0.041 s, serve 1.250 s,
total 30.795 s, host load 7.476. Final report: scenario 61.283 s, lease wait
0.060 s, serve 1.559 s, total 62.929 s, host load 18.592. These runs have
different host loads and do not establish a controlled speed comparison.
Earlier friction evidence reports 15 minutes of support placement in .51,
an enemy-advance stall in .56 and blocked human spell energy in .65. This
acceptance establishes reachable deterministic workflows; it claims no
isolated percentage speed improvement.

Captures, dimension-verified and visually inspected:
`card-lab-declared-desktop.png` (1440x900),
`card-lab-declared-mobile.png` (390x844), and
`card-lab-declared-spell-desktop.png` (1440x900). First-pass report, server
log and captures are preserved with `.first-pass` filenames.

Runtime ledger: first runner server group 94745 on 5174, final runner server
group 3874 on 5174. Both runners closed their MCP browser/transport, stopped
only their own server group, confirmed the port free and released their
native browser lease. All check and runner execution sessions exited.

## Failure, interrupt and recovery contracts

| Path | Observable coverage |
| --- | --- |
| Error mid-step | `keeps a faulted resolving play suspended from script progress until history recovery`: deterministic resolution fault, paused cursor and undo recovery |
| Reload/restart | `retains declared physical targets and script progress through a serialized LOAD_STATE event`: reducer load, live action, serialized reducer reload, next step |
| Partial write | `rejects malformed declarations and impossible physical references atomically`: unchanged deterministic fixture; the full declaration is adopted in one normal LOAD_STATE |
| Invalid/stale input | `fails loudly for invalid save metadata or a stale illegal script and leaves normal policy untouched`; live script test also bounces wrong-side and stale prompt answers |
| Prompt cancellation | Live physical script test cancels and retries the same selected printing, answers its mode and ignores enemy response passes |
| Undo | Live script and resolution-fault cases restore the next physical action from retained history |
| Concurrent actors | Repeated reads return the same owed decision; existing driver/fold intent-key and serialization contracts are covered by full review. Helper test verifies immutable initial identity after live AI movement; no independent cursor writer exists |
| Privacy/production | Prompt decisions use the normal side view/host; ordinary battles have no lab metadata. Full production bundle exclusion passes |

No fallout, new test file, rules decision, card issue or rendered UI change.
The pre-existing large runtime QA test group retains its current coherent
scene/load checks; the tooling group is 493 lines. Test file delta is zero.

Final commit preparation: 2026-10-11T06:49:02+00:00; approximately 36.0 minutes since parent-reported dispatch. The commit timestamp records the delivery endpoint.

## Integration repair provenance

The original implementation source is
`5e9a213e249a1358fcaedc0e9e18dca401188323`, based on
`7eb7567559d742ca2aa157beb34f5c74c4312d65`. Its full review, focused checks
and actual browser runs above remain evidence of that source. The original
implementation interval remains 36.0 minutes.

Candidate `01a129b9-ad0c-7452-860d-5d5c5b2062a6` terminated in a ledger-only
merge conflict. The parent's native update restored the original clean source;
the saved source/base ledger and complete binary delta are retained in the
parent's integration scratch directory.

The helper parked only the own disposition as temporary checkpoint
`a6af145a214f25bdc5528e81066ceaa89a23254b`. The parent then performed native
update, producing clean checkpoint `ecce7995431c148a58a36e35a57d0f9403983a49`
on exact base `ac81d9452bfbbd8b85b26371af1a1ef88b761987`. Neither checkpoint
was submitted as a candidate.

The final combined ledger retains every landed peer row byte-for-byte and
appends exactly the saved owned `qa-scene-unreachable-state/phase-5` disposition.
It was compared against the new base ledger and both saved inputs. Owned
runtime source files match the original implementation source byte-for-byte.
Integration test delta is zero files, zero lines and zero jsdom files. Combined
base review and knip are measured separately from the original checks; browser
and full-suite provenance remains the original source.

Combined-base checks passed: review **423 cases / 13 related files**,
**21.422 s execution / 0.023 s heavy wait**; knip **1.980 s execution /
0.025 s heavy wait**. Check execution session 91867 exited. Review subprocess
fixtures stopped their own server groups. No browser, server or writer from
this bead is live.

Integration repair interval: 2026-10-11T06:50:33+00:00 through 2026-10-11T06:55:53+00:00 (**5.34 minutes**), measured separately from the original 36.0-minute implementation interval. The final source is the single amended commit on exact base `ac81d9452bfbbd8b85b26371af1a1ef88b761987`; its OID is reported in the parent delivery record.

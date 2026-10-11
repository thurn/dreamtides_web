# hv-umm2.380 measurements

Source base: `7544c361aced682f52870e282691b9f784759682`. Own worktree: `permission-qualifiers`.

## Checks and negative evidence

Install PID 62363: 15:39:30.580763Z–15:39:33.630348Z, exit 0, 3.050 s; load 4.79/6.87/9.71 → 5.45/6.97/9.73. Parent dispatch checkpoint 15:37:46Z precedes this recorded install; dispatch-to-install is not productive coding time.

| Command | PID | Actual exit | Wrapper seconds |
| --- | --- | --- | --- |
| negative | 69687 | 1 | 3.827 |
| focused | 83773 | 0 | 3.997 |
| review | 84820 | 1 | 4.786 |
| review-final | 85598 | 0 | 18.906 |
| knip | 86159 | 0 | 3.957 |

The tests-only negative on unchanged base production bytes has seven assertion failures at the missing structured `filter` field and two passing existing cases. It compiles against the existing APIs and uses a pass-through spy restored in `finally`. Assertions concern carried structured data, not UI wording, call counts or order. The cases exercise branded subtype, upper bounds 2 and 0, lower 4/event, equal bounds, combined range/subtype, named/general, next and expiry. `negative-source-hashes.json` records base/current production hashes. Pre/post manifests have zero changed entries; preparation materialized the ignored typed-token mirror.

Focused: 9 cases. Final review: 176 cases/25 files; actual output includes lint, import cycles, main typecheck (2.4 s), node typecheck (2.9 s), related tests and asset restoration. The first review failed on one unnecessary assertion in the new test; corrected final review passes. Knip passes. All checks use two workers sequentially. No full suite or fuzz is required for this bounded UI-copy carrier. Production churn is 33 additions+deletions; test delta +35 net lines, seven cases, zero files or jsdom environments.

## Actual browser evidence

Native README scenario runner, own port 5174, canonical authored UUIDs, desktop 1440×900/mobile 390×844. Source/tests/tools/tokens/task scripts are frozen through each group. The failed group retains its exact script/report as `permission-god-no-static-badge.*`; its 2452-entry pre/post manifests match. Corrected God and Echo groups each have matching 2455-entry pre/post manifests. No executable bytes changed between passing checks and browser runs.

| Group | Runner / server PID | Actual exit | Lease wait / scenario / native total seconds |
| --- | --- | --- | --- |
| final-qa | 90697 / 90729 | 1 | 0.047 / 22.847 / 24.488 |
| god-play-qa | 8334 / 8349 | 0 | 0.039 / 13.352 / 14.668 |
| echo-qa | 9328 / 9341 | 0 | 0.043 / 12.843 / 14.164 |

God: source physical `i1` maps to `fa036c27-2234-4f76-8857-c242530627ce`; void `i10` is the 2-cost synthetic character, `i11` the 3-cost character. The real UI shows one play option, View Your Void and Cancel. All three option centers pass hit testing and their measured boxes are exported. Actual `i10` play from void pays energy 5→3; `i11` remains in the void; played card is not reclaimed. Games `hxe4z2` and `6rhmur` each export 28 persisted rows, including the exact `engine.action` play/from-void at seq27. The report does not export a structured pre-play legal-action list; exclusion claims are limited to the observed chooser and UUID-mapped action/outcome.

Echo: source `i1` maps to `cd3d8e4a-618e-4c2f-be60-0363b81887f1`. Actual activation ability1 exhausts the source, leaves energy3, and grants `e1` with event filter, next=true and never expiry. Its role=img badge is 28×28, opacity1/transform none, inside viewport: desktop x706/y653.857; mobile x181/y642.109. The actual log records the activation and next-event permission. Actual `i10` event play from void pays energy3→2, consumes `e1`, and clears the badge. Games `iuekvx` and `zc6q5c` each export32 persisted rows with exact activation and void-play action UUIDs. All persisted reads are awaited, noted and synchronously checked before context close; JSONL exports are retained by filename.

Captures: `permission-fixed-god-{desktop,mobile}.png`, `permission-fixed-choice-{desktop,mobile}.png`, `permission-fixed-resolved-{desktop,mobile}.png`, `permission-echo-active-{desktop,mobile}.png`, `permission-echo-log-{desktop,mobile}.png`, `permission-echo-used-{desktop,mobile}.png`. Cold inspection includes mobile chooser, mobile active Echo and desktop Echo log. Captures show state following engine settlement; this bead claims no board-card animation transform/opacity waiter. Only badge opacity/transform is measured. All actual browser error buffers are empty.

Manual `manual-copy-observations.json` covers empty, zero, upper, lower, exact and range costs, subtype, named/general/next/expiry, and the shared transient-log formatter. These are direct synthetic UI-copy observations, not real game events or string-asserting unit tests. Both production construction sites retain `change.filter`; general badge and log use the shared qualified noun formatter, while named badge/log use the same status-label path. Floating-source labels from338 and rematerialization log provenance from382 retain their existing branches.

## Resource disposition

Native harness completes semantic browser close, RPC drain, SDK transport close and owned server cleanup before lease release. All three reports record own process-group stop and port free; no peer process or lease ownership state was inspected or altered. `runtime-final.json` verifies twelve recorded own PIDs absent. The short manual formatter invocation and transient shell/check child PIDs were not individually captured; the tool returned actual exit0, and no persistent process was started by that invocation. No provider, server or watcher remains from this helper.

No Areas fallout, content/rules changes, generated mirror edits, card issues, or new rules decision. Static display gap is dispositioned to393. Parent inspected the final source/test diff, four evidence files, resource audit and cold captures, then authorized the single local Conventional Commit.

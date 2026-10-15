# hv-umm2.623 validation and provenance

Final combined base `9b0838d2ca4cd4a27c0e9f0c458ce3b16ab46dd2`. The canonical inclusive clock starts at the original dispatch and extends through the final amendment; current pre-Git cutoff is `2026-10-15T04:27:45.050417+00:00`. First Git was `2026-10-15T04:20:42.482620+00:00`, 53.111194 inclusive minutes. Native recovery started at `2026-10-15T04:21:45.954866Z`; separate repair intervals and the final Git endpoint are recorded in structured evidence and the external final handoff.

Original full/fuzz and all earlier raw receipts remain bound to original source `45caf552208ff4dc834e08678643b70945df663d` / base `8685a75f75cd3849c27e13155e93fc14ecd7e998`. Combined validation uses fresh labels and exact final source hashes. The incorrect combined-focused selector skipped every case and is retained as an unaccepted attempt; combined-focused-final passes all 42 intended cases.

Only the two actual conflicting paths were parked for the parent-owned native update. Every one of the 19 own source/test deltas is byte-identical over the combined base, including the additive saved-field guard alongside inherited validators. Omitting only own initialization/rotation reproduces the current inherited fixture hash and all twelve event outcomes; source restoration is exact. Two combined canonical generator runs are byte-identical, preserve provider/genesis/events, and change only adversarial.finalHash.

## Original implementation evidence (frozen source epoch)

Base `8685a75f75cd3849c27e13155e93fc14ecd7e998`. Inclusive helper dispatch: `2026-10-15T03:27:35.811Z`. Measured pre-Git cutoff: `2026-10-15T04:20:20.874224+00:00`. Model sampling is UNKNOWN. The external Git receipt supplies the exact endpoint and short cutoff tail.

Test delta: 4 added test-related modules, 593 lines, zero configured entrypoints and zero jsdom modules. The three coherent contract modules and their shared support module are each under 500 lines.

## Actual command receipts

| Command label | Exit | Wall seconds | Start UTC |
| --- | --- | --- | --- |
| focused-initial | 1 | 8.695 | 2026-10-15T03:45:24.537419+00:00 |
| focused-scoring | 1 | 11.773 | 2026-10-15T03:48:49.145784+00:00 |
| focused-complete | 1 | 7.590 | 2026-10-15T03:51:33.397032+00:00 |
| typecheck-owned | 2 | 11.953 | 2026-10-15T03:53:01.643373+00:00 |
| focused-fixed | 0 | 12.127 | 2026-10-15T03:53:56.403393+00:00 |
| ordinary-before-controls | 1 | 80.489 | 2026-10-15T03:55:08.134263+00:00 |
| fixture-causal | 1 | 6.228 | 2026-10-15T03:57:06.543878+00:00 |
| fixture-causal-esm | 1 | 5.506 | 2026-10-15T03:57:36.168375+00:00 |
| fixture-source-counterfactual | 0 | 3.598 | 2026-10-15T03:58:53.767026+00:00 |
| generator-1 | 0 | 2.348 | 2026-10-15T03:59:31.192130+00:00 |
| generator-2 | 0 | 1.959 | 2026-10-15T03:59:33.579104+00:00 |
| negative-1 | 1 | 12.170 | 2026-10-15T04:00:19.445175+00:00 |
| negative-2 | 1 | 8.495 | 2026-10-15T04:00:31.653814+00:00 |
| negative-3 | 1 | 8.421 | 2026-10-15T04:00:40.181519+00:00 |
| negative-4 | 1 | 8.780 | 2026-10-15T04:00:48.640077+00:00 |
| negative-5 | 1 | 7.883 | 2026-10-15T04:00:57.455037+00:00 |
| focused-restored | 1 | 7.197 | 2026-10-15T04:01:31.476272+00:00 |
| focused-final | 0 | 7.351 | 2026-10-15T04:02:17.952287+00:00 |
| negative-occurrence-controller | 1 | 10.910 | 2026-10-15T04:03:31.672481+00:00 |
| review-final | 0 | 68.001 | 2026-10-15T04:06:14.742439+00:00 |
| knip-final | 0 | 5.374 | 2026-10-15T04:08:29.284633+00:00 |
| full-lock | 0 | 114.154 | 2026-10-15T04:09:09.284063+00:00 |
| full-final | 0 | 114.123 | 2026-10-15T04:09:09.309270+00:00 |
| fuzz-lock | 0 | 466.481 | 2026-10-15T04:12:30.997374+00:00 |
| fuzz-300 | 0 | 466.448 | 2026-10-15T04:12:31.022837+00:00 |

The focused-final run passed 42 cases at an earlier 19-path source epoch, before the last startingSide fixture consistency adjustment. Final ordinary review, Knip, the full suite and unweighted smoke verify the exact final 20-path source epoch. The full suite passed 387 files and 10,130 tests. Its synthetic infrastructure fixtures announced 57 server process groups under temporary roots; every announced group is absent. Task browser contexts, task servers, task ports and queued source readers are zero.

The initial unwrapped compiler attempt failed on two typed determinization references. Its log records prepare at 03:44:44.962Z/load 9.80712890625 and typecheck stages of 13.6 and 5.4 seconds. Tool session 22390 is terminal; its process id and complete source epoch are UNKNOWN. Subsequent command receipts include actual PID/group, load, CPU, terminal status, source epoch and timing. The first scratch fixture probe used CommonJS output and failed at existing top-level awaits; the ESM probe then established why final-DTO-only deletion is insufficient.

## Causal verification

Five separately selected faults cover flat side points replacing character provenance, zero awards entering the cohort, historical control replacing present control, skipped extra-turn rotation, and bypassed strict saved-field validation. Both actors fail the intended assertions in every run. Each source file is restored byte-for-byte before another mutation or accepted check. A separate occurrence-controller fault records immutable owner instead of actual scoring controller and fails the borrowed-character public provenance assertion. These six faults cover five filed classes; the supplementary occurrence witness remains separate.

Temporarily omitting only the own field initialization and rotation reproduces the exact old adversarial final hash and all twelve expected event outcomes. Both complete source files are restored before generation. Two canonical generator runs are byte-identical; only adversarial.json.finalHash differs, and the other two fixture files, provider, genesis and every event are identical. The first final-DTO-only probe retains derived loop hashes and is recorded as a failed qualification, not accepted evidence.

## Scope and limits

The public synthetic matrix covers positive/zero/blocked/tie/loss scoring, flat/Fatigue/Dreamwell exclusions, first and extra/global turns, present control and occurrence controller, ordinary return, distinct and ceased physical copies, simultaneous prior/current rescoring, pure resolving/static/legality readers, anonymous membership/reveal/determinization, strict saved input, truthful legacy uncertainty, cold prompt cancellation/refusal/competing answers, and current-version checkpoint/genesis recovery. UUIDs and physical identities supply every identity comparison.

No production consumer authoring or weighted/preflight/sweep/D21 acceptance is claimed. There is no new player-facing workflow, prompt or status, so browser QA is not applicable. Shared rulings, score-group behavior, copied/origin history, generic resource awards, inventory/generator logic and hash algorithms remain outside the implementation footprint. Legacy omitted fields remain omitted; required unknown history is refused rather than guessed.

Structured measurements retain all actual attempts and distinct source epochs. hostLoad is attributed to review-final command start at 2026-10-15T04:06:14.742439+00:00. Final semantic validation runs on restored source. Final metadata-only refresh, schema and whitespace precede the automatic single Conventional Commit. Parent owns fresh Codex core review, native state and Tollgate delivery.

## Combined validation

| Command label | Exit | Wall seconds | Start UTC |
| --- | --- | --- | --- |
| combined-fixture-source-counterfactual | 0 | 1.890 | 2026-10-15T04:23:55.536963+00:00 |
| combined-generator-1 | 0 | 1.695 | 2026-10-15T04:24:18.167097+00:00 |
| combined-generator-2 | 0 | 1.705 | 2026-10-15T04:24:19.893436+00:00 |
| combined-focused | 0 | 9.396 | 2026-10-15T04:24:33.062561+00:00 |
| combined-focused-final | 0 | 8.582 | 2026-10-15T04:24:46.410778+00:00 |
| combined-review | 0 | 74.079 | 2026-10-15T04:25:12.718609+00:00 |
| combined-knip | 0 | 4.486 | 2026-10-15T04:26:37.150931+00:00 |

The combined ordinary review and Knip verify current source. No new full/fuzz run is claimed. The final metadata-only refresh, schema, owned whitespace and automatic amendment finish this repair. Current hostLoad is measured for combined-review command start at 2026-10-15T04:25:12.718609+00:00. Every recorded command group is terminal and absent; task contexts, servers, ports and queued readers are zero. The original full suite’s 57 synthetic groups were settled before first Git.

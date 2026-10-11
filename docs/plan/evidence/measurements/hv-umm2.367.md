# hv-umm2.367 documentation validation evidence

Base: `adb7ccb5c820120fdfe4cad27b15c2538bcc064e`.
Worktree: `.worktrees/deck-tracking-doc-boundary`.
Scope: the Look-at-top knowledge paragraph and the `putInDeck` primitive catalog description, plus this bead's evidence. Existing authority is `RD-hv-8395-1`; no new rules decision applies. The `sourceZoneOrder` implementation was inspected read-only.

All review/check commands use `JOURNEY_TEST_WORKERS=2` and `JOURNEY_REVIEW_BASE=adb7ccb5c820120fdfe4cad27b15c2538bcc064e`. These commands take no D17 heavy slot.

| Command | Exit | Wall time | One-minute load | Result |
| --- | --- | --- | --- | --- |
| `npm install` (first fresh-worktree mutation) | 0 | 2.29 s | 15.91 (uptime) | 388 packages added; audit observation is in this bead's pre-existing file |
| `npm run friction:triggers` | 0 | 0.349 s | 22.32 | All fired tags dispositioned; Phase 5 snapshot 20/25 uncovered since hv-umm2.355 |
| `npm run review` | 0 | 0.351 s | 20.17 | Two changed documentation files; configured diff-aware review selected no applicable checks |
| `npm run knip` | 0 | 5.230 s | 20.48 | Preparation, knip, and local-art restoration passed; no unused-code findings |

The install timing is `/usr/bin/time -p`; subsequent timings include the scratch wrapper's process sampling and npm startup overhead. Loads for subsequent commands come from `sysctl -n vm.loadavg`. Implementation duration is estimated from the first install timestamp to evidence writing and excludes initial read-only setup and commit overhead.

The knip preparation temporarily reported missing art in its isolated cached asset directory, then restored local art successfully (564 card images, 32 avatar portraits and cutouts, 153 dreamsign images, 226 journey images, and 521 Exploration images). These are disposable workspace materializations. The tracked diff contains only the authorized documentation and evidence paths.

Test delta: zero files, zero lines, zero jsdom files. No new tests, full review, fuzz, or browser QA were needed for this documentation-only restatement. These document checks are this bead's evidence; historical code validation stays attributed to hv-8395. Parent review, candidate submission, and promotion are session-owned steps.

## Scratch provenance and runtime ledger

Scratch: `/Users/dthurn/.local/state/hive/scratch/01a127fb-1588-7921-aef0-f03b39a7b950/367-implementation-evidence/`.

`install.json` records the observed install exit, time, shell PID 4667, and audit output; the initial tool did not return the npm PID. `friction-dispatch.json`, `review.json`, and `knip.json` record actual exits, timings, loads, wrapper/npm PIDs and sampled descendants. Their matching before/after SHA256 values show both documentation files stayed unchanged during each check. Corresponding `.log` files preserve complete output.

- `friction-dispatch`: wrapper PID 10432, npm PID 10449; command exited 0.
- `review`: wrapper PID 11792, npm PID 11809; command exited 0.
- `knip`: wrapper PID 12336, npm PID 12350; command exited 0.

`runtime-final.json` records every observed check PID absent and no worktree-rooted process command or working directory outside the inspection processes. No server, port, or browser context was started. `final-file-manifest.json` freezes all five intended changed files for the owning session to compare with the local commit. No fallout paths, screenshots, rules decisions, or card issues were created.

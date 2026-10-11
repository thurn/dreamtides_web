# hv-33id.6 — historical tutorial baseline recapture

The accepted native run has 42 ordered beats per viewport and 84 unique
CSS-scale PNGs in the primary checkout's ignored `artifacts/qa/hv-33id.1/`.
`file` and PNG IHDR verification confirm desktop 1440 × 900 and mobile
390 × 844 for every expected filename. `baseline.result.json` has `ok: true`,
`error: null`, and `caps: []`. Each viewport keeps one page, game and initial
error buffer from `/main?seed=1` through the second Battle Start preview.

| Viewport | Game | Beats | Calls |
| --- | --- | --- | --- |
| Desktop | `nh5gdt` | 42 | 6 |
| Mobile | `fn322x` | 42 | 6 |

The historical source binding and date are in hv-33id.1's recapture record.
Its separately resolved Git tree is `42edc94fbfa03e0bf2013b14e0fc38ff62963e37`.
A disposable Git archive inside this Tollgate worktree's ignored cache served
the source; Git discovery inside the archive resolves the parent worktree
HEAD `10d3349a6198a9046cd6d5b1772510f705b06583`. The archived source binding
comes from `archive.json` and 2,084 tracked file/symlink blob comparisons.
Installation left both worktree and archive tracked source bytes exact.

Before/after manifests match all 2,084 historical tracked paths, 57 current
harness paths, the generated historical token mirror, linked-art targets
and actual file hashes, and all six task modules. Workspace preparation
materialized the ignored token mirror during the first compatibility run;
its frozen SHA-256 is
`aac247202e36c7f9dd121a658ed2dc225c54830df102e671b72e7ce8c8be9383`.
The runtime uses the historical source unchanged.

## Capture contracts and observations

- Deepest speech text waits for effective opacity above 0.95. Logs filter
  stale invisible dialogue and include actual href, dimensions, phase,
  energy, points, speech and DOM geometry. Pointer rest is (1300, 300) on
  desktop and (−5, −5) on mobile. Screenshots use CSS scale.
- Beat 06 records UUID `229ab3a1-3720-41a2-924c-8fe112188f8e`, flip matrix
  `m11 = -1`, full-layer opacity 1, and the visible face's box: desktop
  (927.25, 210, 240, 336), mobile (194.015625, 223.181244, 175.5, 245.6875).
- Beat 30 records committed player/enemy score 11/3 in Challenge before the
  Victory surface, then waits for the action's animation-end settled
  attribute and its visible button. Both action sets contain one button at
  opacity 1. Desktop centre is (720, 672); mobile is (195, 582.1875).
- Draft picks use the current interactive card's UUID, button role and
  effective opacity, then observe the actual counter/route transition.
  The outgoing animated pack can retain inactive DOM card sources.
- Dreamscape site actions follow the documented historical DOM click and
  route check, recording the actual site ID/type and pointer hit. The
  Inspector End Battle disclosure records `aria-expanded` false → true
  after normal scrolling; Skip to Rewards and Continue reach the atlas.
- The game's persisted Victory log maps the available Wilderveil UUID
  `f413a98f-10d2-4578-8031-cc6ce57b61b4` to `dreamscape-2` on both accepted
  walks; the pointer click verifies `/dreamscape/1-wilderveil`. Both final
  walks reach its second Battle Start preview at required score 25.
- Every final RPC call reads existing IndexedDB journey logs in `finally`,
  before its context closes. Full raw logs and readiness observations are
  retained. The error buffer is never cleared.

The implementation session's parent reviewed every desktop/mobile beat in
the preceding complete matrix, identified reveal-face and Victory-action
readiness gaps, and reviewed the corrected 06/30 captures on both viewports
plus final 14 desktop, 21 mobile and 42 mobile. The final independent audit
verified all 84 names, dimensions, per-viewport game continuity, calls and
empty error buffers.

## Actual execution and retained failures

The fresh worktree's first mutation was `npm install` at
2026-10-11T17:30:36.523708Z. Commands ran with `JOURNEY_TEST_WORKERS=2`.
The following wall times include owned command startup/cleanup; QA reports
separately record scenario, server and browser-lease wait time. Load is the
observed 1-minute value at command start.

| Command/group | PID | Exit | Wall seconds | Load |
| --- | --- | --- | --- | --- |
| install | 71905 | 0 | 2.483 | 6.964 |
| historical-install | 72125 | 0 | 2.017 | 6.221 |
| compat | 72818 | 2 | 0.229 | 4.397 |
| compat-02 | 73248 | 0 | 52.027 | 3.517 |
| matrix-01 | 80337 | 1 | 241.250 | 4.975 |
| matrix-02 | 12195 | 1 | 220.316 | 7.727 |
| diagnostic | 33349 | 2 | 0.228 | 5.537 |
| diagnostic-02 | 34073 | 1 | 55.117 | 5.093 |
| diagnostic-03 | 43621 | 1 | 276.290 | 7.035 |
| diagnostic-04 | 92210 | 1 | 157.363 | 8.358 |
| targeted | 63864 | 1 | 134.011 | 20.855 |
| review | 18367 | 0 | 0.239 | 7.167 |
| knip | 19924 | 0 | 5.743 | 7.633 |
| matrix-03 | 4533 | 0 | 477.974 | 9.479 |
| matrix-04 | 32817 | 0 | 485.070 | 5.072 |
| review-final | 65510 | 0 | 0.233 | 28.579 |

The accepted run's scenario took 478.192 s, serving
1.254 s, lease wait 0.044 s, and
runner total 479.513 s. All 12 calls are below 240 s;
the longest is 62.867 s.

Exact earlier outputs remain in `attempt-01/` through `attempt-04/`,
`diagnostic-attempt-01/` through `diagnostic-attempt-03/` and
`targeted-attempt-01/`. The first two full walks stopped at an invalid draft
button selector and an inactive outgoing card click. Focused entries
validated current roles/opacity, Revelation, Purge, Inspector scrolling and
physical atlas identity. One diagnostic found a real unvisited Revelation
site; the final front-door walks present no such extra site. A separate
`tutorial-atlas` QA entry opened Tsukiren, and is retained as a diagnostic
setup mismatch. These entries contribute no acceptance captures. The third
full walk passed structural checks and supplies retained visual-review
history; the fourth full walk supplies the accepted 84.

Knip actually passed in 5.743 s. Its result is reused because the candidate
changes only four evidence documents and leaves production, tests, harness
and configuration bytes unchanged. The initial quick review reported zero
changed files and no applicable checks; the required final staged review
exited 0 in 0.233 s with four changed documentation paths and no applicable
checks. No test, full-review or fuzz pass is
claimed for this documentation-only candidate.

## Retained artifacts and terminal resources

- `baseline.mjs`, `baseline-tutorial.js`, `baseline-journey.js`: exact final
  authored modules used by the accepted native run.
- `baseline.result.json`, `baseline.server.log`: final native results and
  server output; result SHA-256 `3089696dbfd81af95ba68b1efde8ed4d4fe82990e6bb6ce752ef68da5ea4ecb0`.
- `hv-33id.6-final-capture-manifest.json`, `hv-33id.6-captures-file.txt`: all
  84 PNG names, dimensions, file results and SHA-256 hashes.
- `hv-33id.6-matrix-04-before.manifest.json`,
  `hv-33id.6-matrix-04-after.manifest.json`: complete source, harness,
  token, art and task hashes.
- `hv-33id.6-runtime.jsonl`, `hv-33id.6-runtime-final.json`,
  `hv-33id.6-historical-journey-log.jsonl`: actual command PIDs, descendants,
  timings/load and cleanup, plus historical development logs.

The native runner closed its browser, drained RPC responses and shut down
the SDK and owned server before releasing the lease. Server process group
32834 stopped and port 5174 was free; all eight final owned PIDs were absent
at 2026-10-11T18:25:46.805458Z. Every owned command is terminal. The
disposable source archive was removed after the manifest and resource
checks. Captures and artifacts remain ignored; the four documentation paths
are the entire commit scope.

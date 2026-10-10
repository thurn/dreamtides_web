# hv-n5lj.17 measurements (QA scenario runner)

Base `4bd691c4b`. Host load is the 1-minute `vm.loadavg` when each run
started. Every run used the Playwright MCP service through the runner's own
MCP client; reports and captures are in `artifacts/qa/hv-n5lj.17/` of the
primary checkout.

## Ported scripts

"Before" is the original `browser_run_code_unsafe` script run unchanged
against a dev server already serving on 5174 (capture paths redirected to
`artifacts/qa/hv-n5lj.17/before/`), at this base. The beads' own reports
record only their whole browser-QA time: 1,500 s for hv-n5lj.5 and 420 s for
hv-n5lj.12. "After" is `node scripts/qa/run-scenario.mjs <name> --bead
hv-n5lj.17`, server start and stop included.

| Script | Lines before → after | Before (load) | After: scenario / total (load) | Result |
| --- | --- | --- | --- | --- |
| hv-n5lj.5 `scripts/banner-geometry.js` → `banner-geometry.mjs` | 43 → 21 (−51%) | 40.9 s (3.04) | 43.5 s / 44.8 s (4.40) | identical: all eight geometry records, banner text, options and `__caps` match byte for byte |
| hv-n5lj.12 `repeat.js` → `repeat.mjs` | 41 → 19 (−54%) | 90.6 s (3.38) | 95.9 s / 96.9 s (5.61) | identical summary: 0 of 17 failures, 9 of 17 reused frames, every run opened Draft, `pointer-events: auto`, empty `__caps` |

Per-row `reused` in `repeat` differs at the 0, 50, and 75 ms delays between
the two runs: whether the decline lands before the dreamscape frame unmounts
is the race the sweep samples. Run time is dominated by the scripts' fixed
settle waits, so it is unchanged within host-load noise; the saving is
authoring time and the plumbing each script no longer repeats.

## Smoke

`smoke`: front door (`/?seed=1`), Avatar selection, every Layer 1 site
(Draft, Draft, Dreamsign Revelation, Purge), Battle Start, and passing until
the AI's turn ends (`near:day > near:night > far:dusk > near:day`).

| Run | Build | Serve ready | Scenario | Total | Load | Result |
| --- | --- | --- | --- | --- | --- | --- |
| dev | — | 1.0 s | 42.7 s | 43.6 s | 3.68 | pass, `__caps` empty |
| `--prod` | 5.1 s | 5.5 s | 36.5 s | 42.0 s | 4.10 | pass, `__caps` empty |
| `--prod --cwd <78ac2c0de worktree>` | 4.8 s | 5.1 s | 0.9 s | 6.0 s | 3.25 | fail at the front door: `Uncaught ReferenceError: Cannot access 'sparkModifierPrimitive' before initialization` in `__caps` |

The last run built the pre-hv-n5lj.15 base `78ac2c0de` in a detached scratch
worktree outside the repository, removed afterwards. The minified build
reports the same error as `Cannot access 'aN' before initialization`, so
`--prod` builds unminified unless `--minify`.

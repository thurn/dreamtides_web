# hv-31uz: Development opener and battle-log close

Base: `d738c7badb019a32deb0c068f7991887eae9274a`.
Root session: `01a128ef-4fc7-7a52-8a19-816921410323`.
Implementation worktree: `.worktrees/hv-31uz-debug-log-close`.

The closed engine development opener uses the canonical
`--layer-app-developer-trigger` role, one stacking step below app-shell
overlays. Its owned fixed-position wrapper retains the same geometry and
existing IconButton. The open DeveloperRail uses `--layer-app-overlay`.
The Cumulus customization ladder stops at the owned layout wrapper; the
token describes its role rather than borrowing an unrelated surface's layer.
The root session acknowledged the measured baseline and widened the native
Areas to the additive canonical token before the source edit.

## Native baseline

`debug-log-baseline.mjs` runs through the repository scenario runner and
native browser lease on the Playwright MCP service. It opens the authored
card-lab UUID `7697da0e-d759-4c75-8c9c-477e9058b035` with `debug=1`, then
opens the ordinary battle log. Gameplay actions are unnecessary to reproduce
the close-control geometry.

| Viewport | Close rectangle (x, y, width, height) | Close center | Hit |
| --- | --- | --- | --- |
| Desktop 1440×900 | 1105, 401.875, 48, 48 | 1129, 425.875 | Log close |
| Mobile 390×844 | 324.328125, 20, 45.671875, 48 | 347.1640625, 44 | `engine-debug-open` |

The mobile opener is at 338, 12 with a 40×40 rectangle. Its wrapper and
the log dialog both resolve to layer 60. A normal `qa.click` on the log
close retains the expected covered-target failure after 2000 ms. A direct
ordinary pointer click at that same center opens the debug rail while the
log stays open. Desktop closes the log and leaves the rail closed.
Both error buffers are empty. The runner's successful baseline verdict
means that this expected defect was reproduced and recorded; it does not
mean that the mobile close succeeded.

## Final native verification

`debug-log-final.mjs` checks both viewports through the same native runner:

1. Open the log, inspect the exact close rectangle and `elementFromPoint`
   ancestry, and capture the viewport.
2. Click the ordinary close. Wait for the dialog's removal and the debug rail
   to remain closed.
3. Click the real debug opener, inspect the open rail and its close hit,
   capture the mobile interaction state, and close the rail.
4. Reopen and close the battle log again.
5. Compare the entire engine slice, battle ID, lab metadata and rendered
   board before and after. Read the native event cursor and require no new
   engine events. Check the error buffer after interactions.

Both close centers and rectangles match the baseline. The final hit ancestry
reaches the log close on desktop and mobile. The opener resolves to layer 59,
the dialog to layer 60. The real rail remains 320 pixels wide, at x=1120
on desktop and x=70 on mobile; its close is uncovered. All interactions pass,
the battle state and UUID metadata are preserved, and `__caps` is empty.

Screenshots, verified as PNGs at their stated dimensions:

- `debug-log-before-desktop.png` and `debug-log-after-desktop.png`: 1440×900.
- `debug-log-before-mobile.png` and `debug-log-after-mobile.png`: 390×844.
- `debug-rail-open-after-mobile.png`: 390×844.

## Checks and timing

Fresh-worktree `npm install` ran first, exiting 0 in 2.1 seconds as reported
by the command tool. `JOURNEY_TEST_WORKERS=2` applies to local checks.

| Check | Result | Time |
| --- | --- | --- |
| `npm run review` | Lint, cycles, both typechecks, 4 related test files / 28 tests pass | About 18 s gross, from log creation/modification timestamps |
| `npm run knip` | Pass | 2.44 s gross (`time -p`); knip stage 1.2 s |
| Baseline native QA | Expected mobile failure retained; desktop succeeds | Lease 46 ms; serve 1894 ms; scenario 11047 ms; total 13007 ms; host load 8.9951 |
| Final native QA | Desktop and mobile pass | Lease 40 ms; serve 949 ms; scenario 11224 ms; total 12235 ms; host load 8.4937 |

Review stages report prepare 1.3 s, lint 2.0 s, cycles 1.0 s, Node typecheck
2.8 s, application typecheck 7.3 s, related tests 6.6 s, and restoration 0.6 s.
Stages overlap, so their sum is not gross wall time. Host load measured after
review: 8.89. Test delta: zero files, zero lines, zero jsdom files. The browser
hit and interaction contracts exercise the defect; a unit assertion of a
style or token value would mirror implementation. No local full review or
heavy slot applies to this bounded wrapper and token-catalog edit.

Raw logs: `review.raw.log`, `knip.raw.log`, `debug-log-baseline.raw.log`,
`debug-log-final.raw.log`. Reports: `debug-log-baseline.result.json` and
`debug-log-final.result.json`. SHA-256:

| File | SHA-256 |
| --- | --- |
| `debug-log-baseline.result.json` | `f7a2c358abd2ffdb742d4dc24675d5957a6c4c4a5db2b6395a650754c9532fb9` |
| `debug-log-baseline.raw.log` | `fd9dd54d023ae3d56aba8f8a47a2a6776de36d2218dfd0683b3d4eedf0929983` |
| `debug-log-final.result.json` | `e79b5204f43f74d59d2e0a5409a324b5437b9e37239e4346001e5e5861e636b3` |
| `debug-log-final.raw.log` | `e46255505c3f98021629d6eaa9e39729ededd5ef1fa11ef39e4bf183474fcfdf` |
| `review.raw.log` | `c5692e77c43ef84474e95231eb173e78f621ecff1c7ce696c47a6e71750d996d` |
| `knip.raw.log` | `4cfb45b3ee93a8fd8fd43ae48ece902ba47d6780d1893049437858ed034ad008` |

## Resources and failure provenance

Each QA pass held the native repository browser lease through confirmed
provider browser close, settled calls, SDK transport close and owned server
cleanup. Each runner exited 0, its owner record was absent after cleanup,
and its server port was free. No CDP session was created. The shared provider
service stays available for other sessions.

- Baseline runner handle 56634: exited 0. Owned server process group 45081,
  port 5174: stopped, port free, PID confirmed absent.
- Review handle 79756: exited 0. Knip handle 84157: exited 0.
- Final runner handle 74279: exited 0. Owned server process group 58332,
  port 5174: stopped, port free, PID confirmed absent.

Both own server PIDs were checked together after final cleanup. All source
edits and materialization checks occurred with no QA server serving the
worktree. The only expected failure is the baseline mobile covered close,
recorded in the baseline JSON with raw pointer outcome. There are no new
rules decisions, card issues, core-review requirements, or generated outputs
in the commit. The root session performs the final cold visual review and
owns native delivery and the claim-to-promotion interval. The implementation
window begins with the first fresh-worktree installation at approximately
2026-10-11 12:00:21 UTC. The root session's final cold visual review accepts
the desktop and mobile log captures and the mobile open-rail capture, verifies
the final JSON hash and successful interaction/state assertions, and confirms
both owned server process groups are absent before the source commit.

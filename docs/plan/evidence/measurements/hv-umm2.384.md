# hv-umm2.384 measurements

The assigned base is `6c84b1be6ed7b5c9d3c6afe3375994799aa355b6`.
The parent claim was acknowledged at 16:06:34Z and its native dispatch checkpoint
at 16:08:11Z on 2026-10-11. Fresh-worktree installation began at 16:11:40Z.
All command times below are actual UTC timestamps; Vitest uses two workers.
Detailed command/PID descendant records and full output live in the session's
`384-implementation-evidence` scratch directory.

`InstanceView.status` carries persisted flags. Its required `reclaimCovered`
marker uses the current `banishedAsReclaimed` predicate, including its owner,
controller and zone semantics. Determinization retains raw flags and excludes
the marker from `CardInstance`. The battle model suppresses the reclaimed badge
when the marker is true. State, events, rules, and catalog data retain their
schemas and behavior. Compilation found zero external constructor/import fallout.

| Command | PID | Started UTC | Ended UTC | Wrapper wall seconds | Exit | Load at start → end |
| --- | --- | --- | --- | --- | --- | --- |
| install | 51322 | 2026-10-11T16:11:40.031732+00:00 | 2026-10-11T16:11:42.787582+00:00 | 2.756 | 0 | 3.118 → 3.188 |
| negative | 52351 | 2026-10-11T16:12:39.663799+00:00 | 2026-10-11T16:12:45.164244+00:00 | 5.500 | 1 | 3.345 → 3.237 |
| negative-fixed-fixture | 52870 | 2026-10-11T16:13:08.135146+00:00 | 2026-10-11T16:13:14.215058+00:00 | 6.080 | 1 | 3.083 → 4.118 |
| focused | 58160 | 2026-10-11T16:15:26.928902+00:00 | 2026-10-11T16:15:30.775369+00:00 | 3.846 | 1 | 6.678 → 6.624 |
| focused-final | 58828 | 2026-10-11T16:15:57.755854+00:00 | 2026-10-11T16:16:01.620509+00:00 | 3.862 | 0 | 5.208 → 5.191 |
| review | 59149 | 2026-10-11T16:16:11.743108+00:00 | 2026-10-11T16:16:30.502216+00:00 | 18.755 | 0 | 4.768 → 5.674 |
| knip | 60548 | 2026-10-11T16:16:40.959951+00:00 | 2026-10-11T16:16:44.833738+00:00 | 3.873 | 0 | 5.881 → 5.881 |
| fuzz-200 | 63466 | 2026-10-11T16:17:15.982466+00:00 | 2026-10-11T16:18:41.189958+00:00 | 85.206 | 0 | 6.861 → 6.048 |
| browser-1 | 68178 | 2026-10-11T16:20:02.401456+00:00 | 2026-10-11T16:23:22.363299+00:00 | 199.959 | 1 | 4.136 → 24.848 |
| browser-2 | 92183 | 2026-10-11T16:24:20.248845+00:00 | 2026-10-11T16:24:44.624881+00:00 | 24.376 | 0 | 17.521 → 12.798 |

The first negative run contains a semantic wipe failure and a stack-fixture
failure: the hidden enemy hand sampled a filler card. Configuring the enemy's
empty deck and sole interrupt hand/decklist makes that sampled action
unambiguous. The second negative run has both intended semantic failures:
`void` in simulation versus authoritative `banished`, with production sources
unchanged. It asserts the actual B0-source then B1-card departure order and a
reclaimed event occupying a real stack card entry with enemy response priority.
Base source SHA-256 values are:

- view: `5440ffce423a1f2be088c5e4ccdba6a1f358914ffaf42b8231725e53ade89f75`
- determinize: `7447c871ef8e525e570a1e37f998fe324b7577cf9f9dc523ef3a5a5ed627c447`
- display: `9f3923db2147639ce8e45dfc0328ff5cfd6a9667ced24482799de5f9f8f70f28`

The first positive focused run passed 525 tests; its single failure was the
existing public-instance equality contract including the derived marker.
The adjusted projection contract passes with the other 525 tests across four
files. `review` passes lint (3.1 s), main TypeScript (8.1 s), node TypeScript
(3.4 s), cycles (1.3 s), and 1,651 related tests across 112 files (17.2 s).
Knip passes. This bounded projection and consumer correction has 10 production
lines of churn and does not change cross-cutting architecture or infrastructure;
`review:full` is outside the local validation ladder for this change.

The acceptance fuzz smoke ran under the native heavy lock: 200 games,
99,284 steps, 1,921 prompts, 202 interactive reruns, 39.8 s reported wall and
44.2 s reported CPU, zero failures. Its 85.206 s wrapper duration includes heavy
queue waiting and launch overhead; exact heavy queue duration is unavailable.
There are zero scoped content entities, so a weighted content fuzz or card sweep
has no additional acceptance coverage here.

Browser attempt 1 has 164.723 s browser lease wait, 27.929 s scenario time and
199.959 s wrapper time. The covered desktop state and actual hand/target actions
pass. A single-target board tap submits immediately, so the task's Submit click
finds no control. The retained failure is a QA-script correction. Attempt 2 has
0.042 s lease wait, 1.861 s serve, 16.859 s scenario (desktop 9.583 s, mobile
7.276 s), and 24.376 s wrapper time. Both viewport workflows pass with actual
zero errors, rejections and console errors.

Both workflows use authored source UUID `9adbe3db-d872-4b75-92b5-d7f2798c22ce`
and synthetic reclaimer UUID `5e5e5e5e-0000-4000-8000-000000000c0c`.
Physical reclaimed card `i11` keeps raw reclaimed/provenance flags and B1 after
source `i1` returns to hand. Covered badges are empty; uncovered badges contain
one duration indicator. Desktop card geometry is 89.5 × 89.5 CSS pixels, badge
23.265625 × 23.265625. Mobile geometry is 53.859375 × 53.859375, badge 14 × 14.
Card-center hit tests pass on both viewports. Each context's 40 persisted log
rows are read outside wait predicates, noted before assertions, and exported as
`reclaim-desktop.jsonl` or `reclaim-mobile.jsonl` before context close. Both UUIDs
appear in each actual export.

The full 2,459-file executable/test/tool/token/task manifests are retained as
`qa-manifest-1.json` (SHA-256
`831f86ae71efe696388858ac61af9097b4891f5223e748f1b4cb775a850ca2f0`) and
`qa-manifest-2.json` (SHA-256
`5314df49e61ba8c2d0fa3de4094f4434ef27584b6098cf8fa32827f2a32e9f81`).
The first group's post-run hashes match; the second group changes only the QA
task, whose exact original and repaired versions are retained. The second
post-run manifest has zero differences. Final source SHA-256 values are:

- view: `d9311a5ab1fe47d4c017f04c0040c26a2e92604328537a1d313a09dbeee14e33`
- determinize: `d1a9f36c5863b54eba998801751c4826b4981a7af9fcfcf645d2d65520a3b338`
- display: `e277c6db8d0f7f35e8f221f3d356b1ef5f27d3aedbf4e217a6e70a5413e2785c`

Both owned browser contexts close through the scenario harness, which drains
RPC calls and its SDK connection before stopping owned server trees and
releasing the browser lease. Server PIDs 83922 and 92213 are stopped; port 5174
is free at cleanup. The ownership record is absent. Final `ps` inspection of
all 76 recorded owned PIDs reports no live process.

Failure-path coverage stays on the existing recovery contracts: mid-step error
preserves committed status/events; JSON/fold reload keeps persisted raw status;
partial writes are excluded by the engine's immutable committed slice;
stale/cancel/wrong-side input is bounced by the fold; concurrent actors share
that ownership check. This bead adds a pure projection and reconstruction
contract with no mutation, interactive write, or new failure boundary. The two
regressions compare legal authoritative and sampled departures and preserve
raw status while proving the derived marker is absent from sampled instances.
No rules decisions or card issues are created.

# hv-umm2.382 provenance and log verification

Base: `9892a3ba250be559c46b775a6939c0c18cfbafc7`. Native claim: 2026-10-11 14:45:34 UTC.
This is the accepted rematerialization-log finding from the independent
Claude Opus 5.5 review of hv-umm2.85.

## Observable contract

The existing materialized event carries optional `rematerialized: true`
when an existing in-play character fires materialization again. Ordinary
entry emits the existing unmarked shape. Both use the same event kind,
matching, public projection, fold, and log plumbing. The existing UI log
selects rematerialized wording from that marker. No generic cause protocol,
prompt, renderer, matcher, zone, content, or rules change is involved.

One new synthetic plain contract performs actual ordinary character hand
play followed by rematerialization. It verifies the two event shapes,
unchanged physical instance, repeated trigger energy1→2, both sides'
`eventSeenBy` projection and JSON retention. Existing FIFO, controller,
state-preservation and fold contracts remain covered. Three exact event
expectations include the marker. Test delta: one case, +22 lines, zero
entrypoints or jsdom files. The contract module is252 lines.
No test asserts player-facing strings.

## Checks

Fresh install:2.384s tool wall. Correct focused runners:427 cases in two
existing files,1.69s Vitest/4.405s command wall including preparation.
Final review passes lint, cycles, both typechecks and2,540 cases in256
runners:58.507s command wall/41.78s Vitest. Knip passes:3.375s command wall.
Review and knip ran sequentially before the browser server. Host load at
review start/end was22.124/25.020; these are observations, not a low-load
budget certification. Initial nonexistent focused path and unnecessary
synthetic tuple assertion failures are recorded in friction; the initial
lint log is retained. Local full validation and fuzz are unnecessary for
bounded additive event metadata and UI copy over the already-soaked
hv-umm2.85 mechanics.

## Actual judged QA

Report: `judged.result.json`; SHA-256 `5e1769dcee24fcf7a50afdbfca3cdccd6f3a74d5d68f6397677c20a580288f5e`.
Source Passage UUID967c714f-40c5-4a77-8e22-40691a2755d4 is ordinary hand
physicali3, selected targeti1 is existing back-rank Materialized-draw
syntheticUUID5e5e5e5e-0000-4000-8000-000000000259. A second eligible physical
vanilla forces an explicit target choice. Desktop gamekgxpcr and mobile
jxqta5 both pay4→3, emit one marked materialized event, resolve the target's
actual Materialized trigger, and draw physicali4 with matching synthetic
UUID5e5e5e5e-0000-4000-8000-000000000002. The target's whole instance and
back rank compare equal before/after: play zone, player controller/owner,
B0 slot, exhaustion, variant, timestamps and status are preserved.
No target leftPlay event occurs. Public UUID-mapped observations use a
post-debug-mount event cursor and each ObservedEvent.event marker.

Per-game IndexedDB records retain the source-UUID prompt, explicit target
answer, actual paid hand-play action and queued/resolved trigger chain.
Action log sequence numbers and durable game-event sequences are separate.
The captures show a synthetic display fallback, Card, whose correct log
line reads Card rematerialized, followed by trigger resolution and draw.
No AI-policy result is claimed.

The target,40×40 log opener and log panel all have positive, hit-tested,
in-viewport geometry. Target desktop x254.5/y483.5/w89.5/h89.5; mobile
x23.40625/y415.890625/w53.859375/h53.859375; both remain B0. Log desktop
x283/y438.96875/w874/h104.5625; mobile x12/y112.25/w366/h104.5625.
Both final viewport caps buffers are empty. Three captures were cold viewed:
rematerialized-board-desktop.png, rematerialized-log-desktop.png and
rematerialized-log-mobile.png. Both log captures have clear accurate copy.
The desktop board frame verifies the stable target while drawn-hand and
phase presentation is in motion; it is not a fully settled hand pixel claim.

The first browser attempt auto-answered its singleton target, correctly
resolved and drew, then timed out waiting for an explicit prompt. Its raw
failed report and server log are retained; actual game rkhfnr chain is in
development JSONL. This was a fixture assumption, not a gameplay defect.
Second run passed both requested viewports without widening the matrix.
First timing:42ms lease/1,262ms serve/19,249ms scenario/20,580ms total.
Final timing:43ms lease/1,249ms serve/9,919ms scenario/11,236ms total,
load11.301. Queue and execution are measured separately.

Four source/contract hashes were frozen before serving and match afterwards.
No source or preparation mutation overlapped serving. Both runners close
and drain their browser context, RPC/provider/SDK and lease; final runner
exit0. Owned server groups70820 and73636 are absent and their port5174 was
free at each cleanup. Subsequent peer ownership is untouched. Evidence-only
files were written after resource closure. No owned server, provider,
transport, lease or heavy process remains.

# hv-umm2.338 floating-trigger source labels

Base: `aff8a49ec164c0a03c4d4613c68f4a539852f1d7`.
Native claim: 2026-10-11 15:05:28 UTC. Commit timestamp: 2026-10-11T15:25:02+00:00.
Claim-to-commit: 1174 s (19.567 min), including root cold review wait.

## Contract and scope

The existing Cumulus duration badge identifies a visible floating-trigger
source with a branded BattleCardId and accessible source name. Its existing
appearance, pointer behavior and duration are preserved. The view-model
builder resolves visible physical printing and variant through its existing
card models immediately for display; null and unavailable sources keep the
generic status. Hidden origins supply no fallback identity. Two independent
physical sources sharing one printing retain separate references, with badges
on their controlling sides. The existing battle-log card resolver supplies the
same source-aware copy for effectStarted trigger lines.

Only the copy module, engineStatuses mapping, typed source/data hook on the
existing badge and its existing split display tests change. No engine state,
card/rules data, renderer, style, token or layout changes. Cumulus rung 1 uses
the existing presentation. Mechanical fallout: none. No new exported helper.

## Validation

Fresh npm install completed (npm reports 3 s).
Final focused status/affordance checks: 14 cases in 2 runners, wrapper 3.692 s.
Review: lint, cycles, both typechecks and 284 related cases in 41 runners,
29.532 s. Knip: 3.071 s. Review host load 14.553; focused load 26.675.
Two new synthetic status/log-boundary cases; net 43 test lines, zero new test
files or jsdom files; the display runner is 129 lines. Tests assert physical
source references, redaction and the resolver boundary, without product copy
or name-resolver construction counts. No local full/fuzz is warranted by the
bounded UI mapping and copy.

The first focused fixture incorrectly expected engine.view to retain a trigger
whose source was hidden. It was corrected to retain the established view
omission and independently exercise adapter null/unavailable fallbacks. A
preliminary typecheck caught an incomplete AbilityOrigin fixture and the
GameCardModel displaySnapshot field. The first aggregate review stopped at
lint (4.751 s) on unnecessary fixture assertions. Final checks pass after these
local corrections; raw final and failed lint logs are retained in own scratch.

All checks and workspace preparation finished before source hashes were
frozen and the QA server started. Both browser attempts used the same frozen
production and test files; only the ignored scenario changed between them.
After browser cleanup, only evidence and the one module-header description
correction are written; all executable bodies and tests match the QA source.

## Judged browser evidence

Quiet Reflection UUID `f160fd01-b3c3-4904-b15f-339f6fcf5ca5`, base, human,
desktop 1440×900 and mobile 390×844. Declared source i1 is paid from hand,
resolves into the void and creates effect e1 with source i1, once=false and
endOfTurn expiry. Distinct staged characters i2 and i3 each materialize and
queue/resolve that source's trigger, drawing top i4 and i5 once each. Hand
count stays 2 after each play plus draw. The effect and badge persist through
both materializations; both expire at Ending. UUID maps accompany each
source-scoped published event in the actual report. Durable event seq/index
are scoped to their game and are not joined to development log seq values.

Badge accessible role is img, source attribute i1, relationship near. Its
accessible label and the battle log both read:
“Quiet Reflection: An ability triggers until end of turn”.
Desktop badge bounds: x706, y653.8571166992188, 28×28.
Mobile badge bounds: x181, y642.109375, 28×28.
Both fit their viewports. The badge has its established noninteractive pointer
behavior; the existing log-open and named close controls are exercised.

Final result `floating-source.result.json` SHA-256:
`926767942a8e94cd5866304979ea190804d87ab2ea356f1c81fa49577b44f5c5`.
Final runtime: browser lease 137.647 s, serve 2.164 s, scenario 41.316 s,
total 181.157 s; outer wrapper 186.380 s. QA host load 5.462.
Desktop call 22.232 s; mobile call 19.083 s. Both pass; caps empty.
Own strict port 5174, server PID/process group 91800. Runner exited 0,
closed browser/context/provider calls/SDK transport, released its exact lease,
stopped its server and reported the port free. Fresh exact-PG check shows no
77801 or 91800 members. No heavy lock held and peer resources untouched.

Initial desktop attempt established the source/draw/log checks but its expiry
probe timed out after Escape left the log modal open. Actual failed report and
raw/server/wrapper files are retained with `floating-source-failed-log-close`
prefix, along with `failed-log-close-floating-active-desktop.png` and
`failed-log-close-floating-log-desktop.png`. It used PG77801 (closed), caps[],
lease 22.674 s, serve 1.258 s, scenario 41.136 s, total 65.091 s (wrapper
70.350 s). The scenario correction uses the existing named close control and
asserts the dialog DOM is absent before advancing. Both final viewports pass
that same workflow. No production change is inferred from the key assumption.

Final captures: `floating-active-desktop.png`, `floating-active-mobile.png`,
`floating-log-desktop.png`. Dimensions verified and implementer cold-viewed.
Active frames show the initial source in the void and its duration icon; the
log frame certifies source copy and the repeated draw history. These captures
make no settled battlefield-card geometry claim. Root independently verified the actual report/hash and cold-viewed all three
final captures before commit; all accepted with the imagery limitation. Images and generated workspace outputs are uncommitted.

## Frozen file hashes

- `src/runtime/battle-prompt-messages.ts`: `9f409aee6149583da1a295d514047f08011d7b51de2c5e682a5d6f68a4a72dc3`.
- `src/screens/cumulus_adapters/engine-battle-view-model.ts`: `6927427b63c58098451e595d31b40d16108c20992c9f11a0a8ca6a54520c1db4`.
- `src/cumulus/components/battle/BattleStatusBadges.tsx`: `2a3c1684dd702c0502e053cd38a08aba3a1a0277b47038153aece057e5ac8490`.
- `src/screens/cumulus_adapters/engine-battle-view-model-display.test.ts`: `e87375f78a41f88a06582ef9e14e18f1bd270d45ba8543f86a56a709d0ae24f2`.

## Post-QA comment provenance

Root authorized one module-header correction after QA closure: names are
resolved only for display labels. The source file SHA changes from
`6927427b63c58098451e595d31b40d16108c20992c9f11a0a8ca6a54520c1db4` to
`9b3c3f8b88b95d39a699be4fcbbd9732c1406b4573e4331b8a19bdfb824e77eb`.
Replacing that exact one-line comment back reproduces the tested file bytes;
no executable body or test changes. Root cold review and the frozen QA
provenance remain applicable; no rerun is warranted for this comment.

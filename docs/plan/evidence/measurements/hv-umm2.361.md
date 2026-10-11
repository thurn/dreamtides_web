# Safe touch reading placement

Bead: hv-umm2.361. Base: `75d315c46e4a4c620491b215ab7b9455ca213858`.
Root claim: 2026-10-11 09:49:38 UTC. Source areas are the existing reveal
geometry module and its existing synthetic test file.

## Observable contract

Mobile complete-card press-in-place eligibility requires the whole source
rectangle inside the safe visible application area. Existing viewport offsets,
safe-area insets and optional application boundary define that area. A source
that crosses an edge uses the existing portal placement. The existing complete
rules and width qualification, full in-place source geometry, secondary-panel
placement and card activation protocol remain the other eligibility contracts.

Five synthetic cases prove the unsafe baseline selection: four partly visible
sources cross the left/right/top/bottom safe edges, and one crosses a bounded
application inside an offset viewport. Each asks for a fully visible reading
rectangle. The boundary case also preserves an eligible source touching the
safe boundary; existing width and secondary-placement contracts remain covered.
All five cases fail against the unedited geometry module, with 31 existing
cases passing. With the source guard, the focused reveal group passes 85 cases
in three files. The test delta is 38 lines, zero files and zero jsdom files.
There are no catalog, copy, CSS-literal, timing or algorithm-default test gates.

## Real browser reading

The before run recreates the post-route-cancel fanned Nomad touch in this exact
checkout. Catalog UUID `6cf545ba-b014-4333-a0da-573e8f97d734`, physical i19,
has source rectangle x=65.807..232.060 and y=639.866..857.994 at 390x844.
It publishes a touch press and selects the in-place source with its rules row
below the viewport. `before-nomad-mobile-held.png` captures the observed cut.
The observational runner succeeds in reproducing the condition; this is a
failed full-reading state, not an acceptance pass.

The after run exercises pointer route/cancel and keyboard route/cancel before
holding the same physical fanned source. Its existing source rectangle is
preserved. A full 175.5x245.688 reading portal occupies x=13..188.5,
y=377.172..622.859; printed rules occupy x=24.781..176.719,
y=600.766..612.047, with scrollHeight/clientHeight 11/11. The primary and
all shown secondary panels fit the viewport. Main remains 844/844/top0.
Release keeps the normal main decision, an empty stack and no in-flight intent;
no card is played by the hold. Capture: `nomad-mobile-post-cancel-reading.png`.

The existing single-card mobile portal remains at x=13..188.5,
y=404.422..650.109 with fully visible rules. Capture:
`nomad-mobile-existing-portal.png`.

A genuinely eligible mobile Draft source, catalog UUID
`f79c63f6-7cf1-4030-be39-217fd3c2fb7f`, holds in place at
x=6.143..190.857, y=85..343.594. Its printed rules occupy
x=18.466..178.534, y=296.774..332.278, scrollHeight/clientHeight 36/36.
Its two secondary panels are wholly visible. The offer UUID sequence remains
identical after release, proving that holding does not pick a card. Capture:
`draft-mobile-valid-in-place.png`.

Desktop 1440x900 hover retains a full portal, visible rules and secondary
panels. Capture: `nomad-desktop-hover.png`. All native observations use the
shared runner and Playwright service, and all document caps buffers are empty.
The executor cold-reviewed the final desktop, mobile fanned and eligible
in-place captures. No application source is edited while it is served.

Each held capture asserts its exact server URL and CSS viewport before the
native page screenshot. Screenshots use CSS scale and stay in the primary
checkout's ignored bead directory. Direct page screenshots preserve the held
pointer: the normal capture helper rests it. Touch input uses native CDP,
with touch ended, emulation disabled and CDP detached in finally cleanup.
No harness failure or speculative aggregate retry occurs in this bead.

## Measured validation

Every install, test, review, knip and browser run uses the external heavy slot
with JOURNEY_TEST_WORKERS=2. Heavy queue and command execution are separate;
load is sampled when the command acquires the slot.

| Command | Execution seconds | Heavy queue seconds | Starting load | Outcome |
| --- | ---: | ---: | ---: | --- |
| install | 2.182 | 0.021 | 22.11 | pass |
| negative | 2.689 | 0.021 | 28.24 | expected 5 red cases |
| before-reading | 40.133 | 0.019 | 26.48 | pass |
| focused | 5.392 | 0.022 | 24.24 | pass |
| after-reading | 25.482 | 0.018 | 8.58 | pass |
| review | 23.587 | 0.018 | 5.30 | pass |
| knip | 2.613 | 0.020 | 5.42 | pass |

Review passes 537 cases in 49 files plus lint, type and import-cycle checks;
knip passes. Full review is not required for this bounded geometry repair.
All timing details and host samples are retained in the friction JSON.

The native browser lease is separate from the heavy slot. Before run:
before: browser lease 0.044s; serve 1.868s; scenario 32.442s; native total 34.378s.
after: browser lease 0.041s; serve 1.856s; scenario 18.289s; native total 20.210s.

## Resource closure

Before runner owns server process group 34467 on 5174; after runner owns
45313 on 5174. Both report their exact group stopped and port free. Each
native runner confirms browser close, settles provider responses, drains its
MCP transport and clears its own provider ownership record before releasing
the browser lease. Touch sessions explicitly detach. All check and runner
shell execution sessions exit, and the final scoped process check finds no
recorded server group, owned check wrapper or provider owner record for this
bead. No runtime is retained. Raw commands, timings and cleanup evidence are
preserved in `/tmp/hv-umm2-361`; captures and native reports remain in the
primary ignored bead directory.

Measurement starts at 2026-10-11T09:50:26.605271+00:00; commit preparation is 2026-10-11T09:59:34.459163+00:00. Measured interval 9.131 minutes; root claim-to-preparation gross interval 9.941 minutes. These include all checks, browser work and queues, and are not pure editing time or a speed claim. The source commit records the later delivery endpoint.

# Battle viewport containment

Bead: hv-umm2.304. Source base: `d0f45c58e8f14748f5a99c75e856592aac028a2d`.
Root reported the claim at 2026-10-11 09:16:32 UTC. Measurements include
heavy-slot queues and native browser-lease waits separately from execution.

## Cause and bounded layout

The desktop near-hand grid track occupies y=684..900 at 1440x900.
Its whole-row 24px translation puts its layout overflow at y=708..924,
including when the hand clips its card contents. The resulting battle main
has clientHeight 900 and scrollHeight 924 before a card is tapped and while
the play-route prompt is open. The hidden-overflow main accepts a diagnostic
scrollTop of 24. The historical automatic 21px tap scroll from hv-umm2.53
was not reproduced with the current shared pointer-tap helper; the excess
scroll area was reproduced in both card-lab and the journey battle.

A DOM-only diagnostic isolates the translation: clearing it yields
900/900. Changing only the main's overflow to clip leaves scrollHeight 924,
though it prevents scrolling. Moving the offset to individual card slots
with a clipped, untranslated hand track yields 900/900. Visible slot overflow
and an enlarged clip margin yield 912/900 and do not meet the acceptance.
These temporary diagnostics change no persisted game state or source.

The desktop hand uses its full viewport-bounded grid track, with its existing
card offset on each slot. Card sizing, hand padding, and fan rotations retain
their existing values. Idle cards and held-card prompts clip at the hand
boundary; actual card dragging allows travel beyond the track. The board is
a non-scrolling clipping boundary. Mobile hand overflow follows its existing
pending-card interaction state. The held card and reading reveals use their
own separate stage and portal surfaces.

## Browser evidence

The before and after scenario matrices use physical cards whose catalog UUID
is `6cf545ba-b014-4333-a0da-573e8f97d734`; debug additions create distinct
instance IDs, including two hand cards so Offering is payable. Journey setup
uses the shared driver to reach the player's Day and supplies sufficient
energy through the debug UI so both routes are legal. Assertions observe
prompt kind, physical instance IDs, geometry and empty error buffers.

| Scene and viewport | Before idle/route scroll/client height | After idle/route/focus/keyboard scroll/client height |
| --- | --- | --- |
| Card-lab, 1440x900 | 924 / 900 | 900 / 900 |
| Journey battle, 1440x900 | 924 / 900 | 900 / 900 |
| Card-lab, 390x844 | 844 / 844 | 844 / 844 |
| Journey battle, 390x844 | 844 / 844 | 844 / 844 |

Each after state has scrollTop 0. Actual keyboard focus, Enter activation
and cancellation keep the viewport fixed and return the normal main decision.
Desktop route buttons occupy y=597..639; the held-card stage occupies
x=8..72, y=589..678.594. Mobile route buttons occupy x=255.703..382,
y=522.828..564.828 and x=201.188..382, y=572.828..614.828; the held stage
occupies x=8..62, y=518.828..594.422. All are fully within the viewport.
The executor's cold comparison of desktop/mobile captures confirms the
preserved card and control geometry.

Before captures are `before-{lab,journey}-{desktop,mobile}-{hand,route}.png`.
After captures are `after-{lab,journey}-{desktop,mobile}-{hand,route,keyboard-route}.png`.
Capture filenames refer to the primary checkout's ignored bead directory;
images are not committed.

## Harness provenance

The first attempted scenario supplied one hand card and expected `choice`
instead of the actual `chooseMode` route kind. Offering requires another
hand card, so this attempt reached no route. Its report and capture are
retained as `overflow-before.first-harness.result.json`.
The second supplied the extra card but journey energy permitted only the
Offering route, which selected that route directly and reached `chooseCards`.
Its report is retained as `overflow-before.second-harness.result.json`.
Both failures are harness preconditions, with empty application error buffers;
they are not counted as player-flow failures. The final setup explicitly
asserts Day and makes both routes legal.

## Validation and resource ledger

Final measured checks and additional preview/drag results are recorded in the
bead's friction JSON and QA ledger. No CSS-value or player-copy test is added;
actual browser geometry supplies the layout contract.

All runs use the external heavy lock with JOURNEY_TEST_WORKERS=2, and each
browser run uses the native runner's separate repository browser lease.
Completed before runners own server groups 34201 (first harness), 35959
(second harness), 37382 (matrix), 38447 (boundary diagnostic), and 39940
(slot diagnostic), all on port 5174. The after matrix owns group 51009 on
5174. Each confirmed browser close and settled provider response, drained
its MCP transport, stopped its own group, and reported the port free.

## Additional interaction results

Desktop hover is a fully visible primary reading portal, 240x336 at
x=722.672, y=564, bottom=900. The native pointer drag sets the actual physical
source's dragging flag, exposes the hand row, and keeps its center uncovered;
the final direct-capture run measures x=343.312..484.493,
y=413.341..602.362. Dropping raises the normal route choice and cancellation
returns main 900/900/top0. `after-lab-desktop-reading-preview.png` and
`after-lab-desktop-drag.png` use direct page screenshots because the normal
capture helper rests the mouse, clearing hover or moving an active drag.

A fresh single-card mobile hold delivers native touch to the source and
opens its full primary reading portal at x=13..188.5, y=404.422..650.109.
`after-lab-mobile-touch-diagnostic.png` captures that held state. A separate
post-cancel comparison delivers touch to physical i19 in both main-overflow
modes, clip and baseline hidden. Both publish a press measurement and the
same active fanned source at x=65.807..232.060, y=639.866..857.994.
Both follow the geometry library's mobile press-in-place branch and omit a
separate primary card portal. Main remains 844/844/top0 and the release leaves
the normal main decision without playing the card. The initial missing-primary
waits therefore do not prove a failed touch gesture. The fanned source's
reading bounds are recorded in the pre-existing evidence and filed as
hv-umm2.361, after this bead.

Post-cancel direct captures are
`after-lab-mobile-post-cancel-touch-clip.png` and
`after-lab-mobile-post-cancel-touch-hidden.png`. Each direct held shot checks
its exact server URL and CSS viewport. Direct screenshots retain device
pixels (2x on mobile); the required matrix screenshots use the runner's CSS
scale. All tested documents have empty caps buffers.

The first bundled drag assertion did not retain its local values, so its
specific failing condition is unknown. The following diagnosed run proves
actual dragging=true, visible hand overflow and an uncovered physical card;
no application-source change occurred between those attempts. Its normal
capture helper rested the pointer during the shot. The final held screenshot
keeps the pointer in place. Native browser close settles and clears each
attempt before the next one starts.

## Measured checks

| Check | Execution seconds | Heavy queue seconds | Starting load | Outcome |
| --- | ---: | ---: | ---: | --- |
| install | 2.432 | 0.018 | 7.92 | pass |
| before | 74.111 | 0.018 | 4.21 | harness attempt; see provenance |
| before-corrected | 78.906 | 0.017 | 3.45 | harness attempt; see provenance |
| before-final | 34.173 | 0.018 | 3.41 | pass |
| diagnostic | 11.505 | 0.019 | 3.88 | pass |
| slot-diagnostic | 9.939 | 0.018 | 3.71 | pass |
| after | 37.080 | 38.206 | 19.13 | pass |
| interactions | 28.373 | 156.804 | 5.19 | harness attempt; see provenance |
| interactions-diagnostic | 80.846 | 247.453 | 5.96 | harness attempt; see provenance |
| interactions-held | 45.368 | 1.593 | 3.70 | harness attempt; see provenance |
| touch-diagnostic | 13.086 | 0.022 | 3.79 | pass |
| touch-comparison | 11.944 | 0.018 | 3.82 | harness attempt; see provenance |
| touch-reveal-comparison | 16.883 | 0.018 | 4.00 | pass |
| focused | 6.314 | 0.023 | 12.86 | pass |
| review | 19.731 | 0.024 | 13.35 | pass |
| knip | 2.685 | 0.023 | 19.87 | pass |

Install load is sampled after completion; other listed load values are sampled
when the heavy slot is acquired. Focused screen/presentation checks pass 34
cases in 3 files. Review passes 94 cases in 11 files plus its type/lint checks;
knip passes. No test file, test line, or jsdom-file delta is introduced.

Browser-lease, serve and scenario times are preserved separately in the
friction JSON's native reports; they are inside the outer command execution,
not the external heavy queue. In particular the original after matrix has
0.042s browser-lease wait, 1.259s serve and 30.441s scenario time, while its
external heavy queue is 38.206s. The first additional interactions run waits
156.804s externally; the diagnosed run waits 247.453s externally.

Additional runner server groups are 58853, 79035, 81381, 88497, 90613 and
94186, all on 5174. Each reports its exact group stopped and the port free.
The native runner closes the browser, settles provider calls and drains its
transport before its lease release. Failed touch attempts' CDP sessions close
with their owned browser context; successful touch diagnostics explicitly end
touch emulation and detach their CDP sessions. The diagnosed heavy waiter owns
only wrapper62767 and lock62782 before its interpreter/server startup; both
are absent in the final scoped process check. The final resource check also
confirms all recorded server groups absent and no provider owner record for
this bead. All shell execution sessions have completed. No retained runtime.

Measurement start: 2026-10-11T09:17:22.933781+00:00, observed after initial reads. Commit preparation: 2026-10-11T09:46:45.890188+00:00. Observed measured interval: 29.383 minutes; root claim-to-preparation gross interval: 30.232 minutes. Both include checks, QA attempts and queues, and do not represent pure editing time or a speed claim.

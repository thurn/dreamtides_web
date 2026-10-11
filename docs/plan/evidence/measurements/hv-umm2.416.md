# hv-umm2.416 measurements

Movement position prompts carry `fieldSide: Side`, the moving character's
current controller battlefield. `side` identifies the ability controller
who answers. Position bounds and field-side validation apply to the prompt;
its fingerprint includes both field side and ordered positions. Public
projection's existing generic copy preserves the field and narrowed answers
for both viewers. No projection body edit is required.

The existing Cumulus prompt subtitle places relative battlefield context
first, then source attribution. The title and short rank-position option
labels use their existing copy. The adapter uses the existing prompt host,
GlassPanel subtitle and numeric choice controls (Cumulus rung 1).

The additive synthetic `move-transferred` scene activates the player's mover
and plays an opponent Interrupt through the real fold. Its single target is
forced, and empty response windows run automatically to the player's pending
movement chooser. This setup establishes a scripted response, not a policy
selection result.

## Validation

| Check | Exit | Wrapper seconds |
| --- | --- | --- |
| review-final | 0 | 49.738 |
| judged | 0 | 39.549 |
| knip | 0 | 4.295 |
| focused | 1 | 5.563 |
| knip-settled | 0 | 3.689 |
| full | 0 | 73.810 |
| focused-settled | 0 | 4.925 |
| review | 1 | 49.603 |
| focused-corrected | 1 | 3.523 |
| fixture-proof | 0 | 1.053 |

Final focused checks: 609 cases in three files. Related review: 2781 cases in
262 files; types, lint and cycles pass. Full: 3517 cases in 330 files,
Vitest 46.00 s, production bundle and materialization restoration pass. The
single full run uses the canonical primary heavy lock and two test workers;
execution 73.810 s, lock request to acquired inner-interpreter entry 0.021 s
(includes command startup), whole locked wrapper 74.531 s. These are measured
walls at recorded host load, not a controlled speed comparison.

Synthetic contracts exercise real activation, target answer, control-transfer
response and original-controller movement answers on both sides; every offered
position belongs to the source's current field. They verify physical identity,
owner/controller/status preservation, an existing no-swap reposition event,
public projection, narrowing, wrong-side rejection and serialized suspended
resolution replay. The field participates in prompt fingerprints and malformed
field values are rejected. Tests assert semantic structures and legal answers,
without specific UI strings or policy defaults. Existing normal movement and
paid-position contracts remain covered. Delta: zero new test entrypoints or
jsdom files, 68 test/contract lines, three cases. The move contract has 337 lines.

Pending prompts are regenerated from the serialized fold step and recorded
answers. A normal suspended one-source movement step has no earlier movement
answer and reconstructs the field metadata on reload. Recorded answers compare
the current prompt fingerprint during replay; the existing divergence handling
applies when an earlier answered prompt's shape differs. This bead introduces
no replay migration or fingerprint relaxation.

## Retained corrections

The first focused attempt added scripted passes after the lab's opponent play.
Actual public-slice inspection proved that the play already reaches the player
movement chooser; an extra pass bounces with `stepInFlight`. A subsequent
explicit opponent target answer bounces with `notYourPrompt` because the sole
target is forced. The final scene uses the two successful real intents.
The first review's tests passed; lint caught an untyped JSON round-trip
assignment in the new contract. A typed assertion of the known self-serialized
BattleSlice satisfies the fixture's existing pattern.

The first knip run was launched before review-final had completely settled;
its materialization/restoration briefly overlapped that review. Both exited
zero. A serial knip confirmation then passed, followed by the sequential full
run and final restoration before browser startup. The original logs and timing
records are retained; neither overlapped run is the basis for frozen browser
materialization claims.

## Frozen judged workflows

Source base: 433bce370abce83456f56f48974eced8878ec21b. Nine owned source hashes match across the full check,
restoration, frozen browser run and final verification. Full/check resources
were closed before the native browser lease was requested.

Report movement-field.result.json SHA256: 2271055bc6456d75148b1b151c3d250d9bc62604d2da94c0bc2d8ce938a2cfbe.
Four completed cases: desktop/mobile, own/transferred field. Each offers all
18 empty positions, with every option in viewport and centre hit (72 offered
controls checked). Leading field phrase dimensions are 109.078125 by 19 for
own field and 158.3125 by 19 for opposing field, with uncovered centres in
both viewports. Subtitle width 237.65625 or 286.890625 fits horizontally.

Both scenes use physical i1, UUID 5e5e5e5e-0000-4000-8000-000000000372.
Original ability controller player answers index 13; the selected slot is F4.
Own scene emits one repositioned event for player B0 to F4. Transferred scene
emits one for enemy B0 to F4. Every event maps the physical id to the printing
UUID and has swappedWith null. Reload preserves the complete pending prompt;
normal history records the player's matching prompt-id answer. The complete
source instance equals its pre-movement snapshot. Actual source/final card
geometry is 89.5 square on desktop and 53.859375 square on mobile, in viewport
with a centre hit and the expected rendered side/rank/slot.

Eight captures use CSS scale 1; filenames are in the four judged ledger rows.
Their assertions concern the stated controls, context and movement position,
not an unmeasured settled-hand layout. Report ok true, error null, caps empty.
Lease wait 45 ms, serve 1307 ms, scenario 32934 ms, total 34313 ms; wrapper
39.549 s, host load 29.6298828125.

## Resource closure

Owned browser runner 32839 and server group 32866 are freshly absent. The
runner completed browser/provider/RPC/SDK closure before exit zero and reported
its server stopped with port free. Its exact shared ownership record is absent.
A later port query observed unowned node 36506 listening on 5174 with no shared
browser ownership record; it was left untouched. This record claims the
runner's confirmed release, not continued exclusive availability of that port.
All 23 recorded local-check/full-fixture pids were absent before QA. There is
no retained owned server, check, browser provider, lease or writer.

Raw logs, load samples, source hashes, fixture slices and resource checks:
`/tmp/hv-umm2-416-checks/`. Ignored scenario/report/captures remain in the
primary bead QA directory; no generated or image file is committed.

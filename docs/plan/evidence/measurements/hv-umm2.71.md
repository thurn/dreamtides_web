# hv-umm2.71 measurements

Base: `e41edcb9d041f3349fac7fb6dce7a6329ca6439f`.
Claim/dispatch: 2026-10-11 10:03:11 UTC.
Entity: `848b41b3-9f87-45fb-b86f-b52fc913d201` (base Event, cost 1, standard).

## Contract and scope

`doubleEnergy` resolves `you`/`opponent` against the source controller and
adds that side's resolution-time current energy through `effectEnergy`.
Maximum energy stays unchanged. The existing `energyChanged` event carries
current, maximum, actual change and effect cause; its existing presentation
and plain battle-log mapping display the result. Intent/action records and
saved UUID/source fixtures reconstruct the play and resolution.

The entity's single printed clause is authored with `event(doubleEnergy())`;
`verifiedText` is `nohfsi8yqn`. Printed metadata is immutable. The existing
energy rules explicitly describe doubling the current pool, so no rules
ambiguity, rules decision or card issue is required. D20 requires no scenario
module for this direct primitive composition.

The plain, eagerly discovered contract module adds 19 synthetic cases: zero,
1, 4 and 9 energy across both controllers and both relative player references;
both sides paying a cost before resolution and exceeding maximum energy;
and an Interrupt response that changes the pool before doubling, followed by
serialized-stack replay through a fresh engine. Contracts assert resource
events, final zones/stack, untouched sibling resources, invariant validity,
and deterministic replay. Test delta: zero runner/test-entry files, +99 plain
contract lines, zero jsdom files. Additive hub entries only.

## Validation

All checks use `JOURNEY_TEST_WORKERS=2`. Execution and waits are separate.

| Check | Result | Command execution | Queue/wait | 1-minute load start → end |
| --- | --- | --- | --- | --- |
| Fresh install | pass; existing audit findings recorded | 2.368 s | 0.021 s initial brief lock | 6.19 → 7.21 |
| Focused contracts + content gates | 2 files / 228 cases pass (19 new) | 3.911 s | 0.019 s initial brief lock | 5.38 → 5.35 |
| Final review | lint, import cycles, both typechecks, 157 files / 2,297 cases pass | 41.066 s | lightweight; no heavy slot | 3.62 → 5.04 |
| Knip | pass | 2.756 s | lightweight; no heavy slot | 4.35 → 4.35 |
| Weighted fuzz | 300 games, zero failures | 56.442 s | 0.020 s heavy-slot wait | 5.25 → 4.23 |
| Native sweep | 12 pass, 8 ineligible skips | 72.315 s incl cleanup | browser lease only | 4.47 → 4.13 |
| Final judged | 4 pass, empty caps | 30.533 s incl cleanup | 0.040 s browser-lease wait | 3.58 → 3.91 |

The first focused attempt failed one test-only timing assumption: a response
fixture used Fast, whereas Respond requires Interrupt. The corrected synthetic
fixture passed. The first review rejected untyped JSON parsing at the replay
boundary; the final source uses the existing state serialization helpers.
No production behavior repair was needed for either validation failure.

Fuzz command: `npm run fuzz:engine -- --games 300 --weight-uuids 848b41b3-9f87-45fb-b86f-b52fc913d201`.
Game wall 55.0 s, CPU 60.3 s; 152,506 steps, 2,780 prompts, 250 interactive
reruns (0.269 ms each), zero legality/prompt feasibility bounds. Target UUID
included 615 times and exercised 282 times. Local `review:full` is not required
for a bounded new primitive and additive registration; Tollgate owns release
validation. The content gate validates authored text/registration while the
phase's other entities remain pending.

## Browser QA

The default native sweep covers base, empowered, inspired, enduring, hastened
and perfected as player and enemy. Amplified, kindled, resonant and attuned
are ineligible on both sides. Its 20 ledger lines have no failure or pending
verdict. Checks include source resolution, expected zone, visible change,
controls and empty load-time/departing-document error buffers.

UUID SHA-256 is `0ced89789718a68b4f244eaf1b2e47b76847f14cd675401c4528ece7309c0bd6`.
First byte 12 is below 26, so D21 samples this entity. Four final judged cases
cover player/enemy at 1440×900 and 390×844:

- Player physical `i1`: normal UI play pays 5→4, then resolves 4→8 with maximum
  5. The same applied batch names `cardPlayed`, `resolved` and energy changes.
- Enemy physical `i10`: the ordinary native lab fixture prepares the source
  on the stack at prepaid current 9/maximum 10. The human's normal response
  pass resolves that source to current 18/maximum 10. This judges enemy
  resolution and presentation, not a browser-driven enemy cast. Synthetic
  contracts cover actual play/payment for both sides.
- Each case verifies the printing UUID, final void/empty stack, effect delta
  and maximum, source-resolved batch, visible energy DOM/hit geometry and
  plain battle-log gain. Saved current-game records retain the UUID/source,
  applied durable `BATTLE_ACTION` sequence and corresponding `engine.action`
  kind; independent logging and game-event sequence counters are distinct.
- Caps are empty. Ten PNGs are stored only under the primary checkout's
  gitignored bead capture directory. File dimensions match the requested
  viewports; representative resolved desktop, resolved enemy mobile and
  player mobile log frames were visually inspected. The ledger references
  capture filenames only.

Final native timings: browser lease 0.040 s, serve 1.858 s, scenario 23.350 s
(desktop call 13.330 s, mobile call 10.020 s), runner total 25.271 s and outer
command including cleanup 30.533 s.

Two harness failures are distinct from application failures. First, the
staged enemy-script walk stalled at far:dusk with human main decision,
stack 0 and zero published source events; its setup/provenance cause is
unconfirmed. A runtime metadata omission is not established by this run.
Its retained report has browser wait 73.722 s, scenario 58.075 s, runner total
133.682 s and outer command 138.944 s. Second, a saved-log assertion compared
engine-action logging sequence with durable game-event sequence. Desktop
player/enemy effects and presentation had succeeded, with empty caps; corrected
correlation uses current-game identity and separate sequence namespaces.
Second-attempt browser wait 0.039 s, scenario 13.063 s, runner total 14.372 s,
outer command 19.637 s. Final coverage passes all four cases. No speculative
runtime defect or product/helper patch is filed from either harness failure.

## Runtime ledger

Native sweep server group 73668 and judged server groups 96449 (first),
15330 (second), 17502 (final) all exited; each runner reported port 5174 free
at its cleanup. Final PID checks find these groups and task wrappers absent.
Native browser sessions closed and transports disconnected before lease
release. A peer acquired port 5174 after cleanup (PID 18166 observed); that
listener is not this bead's resource and was untouched. All local validation
and fuzz commands exited. The shared MCP service remains managed by its owner.
No image is committed, and no branch is pushed or deployment performed.

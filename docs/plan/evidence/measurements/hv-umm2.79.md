# hv-umm2.79 implementation and validation

Original validated source: `9fb57a074a9b470d0df4a13c7c9d92a2308bf732`.
Original base: `e1d3648152cdfb87c49a9110f469f790407061a0`.
Native claim: 2026-10-11 12:24:22 UTC. Checks use two journey test workers.

## Entity and rules audit

- `3811a0a2-66af-4c06-b179-948dfa9b2ee3`: its Materialized trigger targets an
  event in its controller's void and returns the same physical card to its
  owner's hand.
- `ed02e610-2e68-4457-95a6-c7c6db60ca40`: its activated ability chooses a
  character already in its void before paying an abandon cost. The source
  itself can pay that cost, while the preselected void target is independent.
- `4733876a-d6b1-48d2-b322-5f71aee9f3d6`: its Dissolved trigger may spend one
  current energy of its last in-play controller to return its currently-void
  source to its owner's hand. A vanished source, or a source already returned
  by an earlier trigger, raises no payment prompt.

Every printed clause is authored and verified. None has amplified text; all
printed catalog fields are preserved. Existing rules' Targets paragraph
explicitly defines Dynamo's target-before-cost example. RD-hv-umm2.59-1/2
supplies void references; RD-hv-umm2.342-1 supplies Dissolved control. No new
ambiguity or card issue was identified; no RD or scenario text substitutes
for printed card text.

One primitive uses the existing target hooks, zone replacement/movement and
public `returnedToHand` event. The new `optionalPayment` role is a
resolution-time energy choice, distinct from play/activation optional costs.
It has additive copy, Greedy strategy, reachable lab fixture (unique synthetic
UUID index `0x370`), and exhaustive role expectation. Existing pay/decline
routing handles the role. No existing movement, targeting, cost, policy or
view-model branch behavior changes. Mechanical fallout: none.

## Executed checks

| Check | Result | Measured wall |
| --- | --- | --- |
| Fresh install | Completed; audit findings in pre-existing file | Reported 2 s |
| Final focused contracts/content gates/specs/role surface | 391 cases, four existing runners | 3.896 s |
| Final review | 2,448 cases, 158 runners; lint, both typechecks, cycles pass | 33.564 s |
| Final knip | Pass | 2.705 s |
| Weighted engine fuzz | 300 games, 155,657 steps, 3,368 prompts, 364 interactive reruns; zero failures | 63.877 s execution; 0.023 s heavy queue |
| Default card sweep, all variants and both sides | 26 passes, 34 ineligible skips, zero failures | 176.434 s total wrapper |
| Final human judged matrix | Paid/decline on desktop/mobile; all caps empty | 26.325 s scenario; 0.052 s browser queue, 1.866 s serve, 28.273 s runner total |

Fuzz results: 145 player wins, 155 enemy wins, zero draws; bounded legality
and prompt counts zero. Exact UUID included/exercised counts, in entity order
above: 613/263, 619/281, 621/281. Local full validation is unnecessary for this
bounded primitive/content and additive registration change.

Two deliberate negative probes preserve raw failing reports: skipping payment
fails three contracts; skipping movement fails six. Exact primitive bytes are
restored with SHA-256
`5eb5ea5e45737f8b7a0a3e501cb4f38f13f2037cbee497d535607b1ab1dead13`.
Final production bytes match the fuzz/sweep/judged snapshot. The sole later
source difference is the authorized synthetic earlier-trigger movement case;
focused, review and knip reran afterwards. Its plain module is 224 lines.
Test delta: eleven primitive cases plus three content scenarios, 270 new test
lines, zero new test entrypoints or jsdom files. The existing role expectation
has one mechanical line replacement. D20 scenarios pin actual Dynamo/Vanguard
abandonment/trigger ordering and Dynamo abandoning itself.

Raw checks, timings, negative probes and all final source hashes are retained
in `/tmp/hv-umm2-79-checks/`. No full, fuzz or sweep repetition follows the
test-only addition.

## Core failure paths

- Error mid-step and partial write: **rolls back both payment and returned
  cards if the same step throws afterwards** checks no published event, no
  energy/card write and cleared in-flight continuation.
- Interrupt: **does not return a void target that an actual interrupt
  banishes before resolution** checks exact physical banishment, no return,
  and the no-legal-target event.
- Reload/restart, invalid/stale input and concurrent actors: **reloads an
  unpaid return, rejects invalid, foreign, stale and concurrent input, and
  commits exactly once** uses a serialized slice and a new adapter; checks
  identical prompt, unchanged committed energy/void while pending, wrong-side,
  stale-attempt, nonboolean answer, concurrent action, forbidden cancellation,
  one successful commit and rejected duplicate answer.
- Missing source: **asks no payment for a dissolved created source that
  ceased to exist** checks disappearance, unchanged energy and no return.
- Moved but still-existing source: **does not charge again when an earlier
  Dissolved trigger already returned the still-existing source** checks one
  return, owner hand and unchanged energy through two actual queued triggers.
- Ownership/controller split: **uses the last controller's payment while
  returning a stolen dissolved source to its owner** checks distinct sides.

## Browser evidence and disposition

SHA-256 of `judged-human-final.result.json`:
`46cd5730acfdce2faab992fca780b5934265fa3fcb80e51f69c4f7ebb4567883`.
Each final case records game URL, printed UUID and physical instance, initial
and final energy, exact source/target movement events, visible HUD, control
geometry and its own empty caps buffer. Physical Vanguard `i2` and explicit
void target `i11` are checked independently. Acceptance spends 2→1 and
returns the source to hand; decline keeps 2 and the source in its void. Dynamo's
original target returns in both cases. No action-log/durable-event sequence
namespaces are joined.

Desktop controls: x1047.625/y597, 92.203125×42 and x1147.828125/y597,
92.671875×42, in 1440×900. Mobile: x189.125/y522.828125 and
x289.328125/y522.828125, same respective sizes, in 390×844. Both are enabled
and center-hit clear. Paid-result captures are hand-movement animation frames: the desktop target
is not yet pictured and the mobile source is moving. Committed state, HUD
and UUID events are verified separately; later desktop log capture includes
both hand cards. Log captures show separate source and original-target return
lines. The source
card and payment/decline choice remain readable. No duration/status is added.

Capture filenames, all under the primary ignored QA directory:

- `vanguard-paid-prompt-desktop.png`, `vanguard-paid-result-desktop.png`,
  `vanguard-return-log-desktop.png`, `vanguard-declined-prompt-desktop.png`.
- `vanguard-paid-prompt-mobile.png`, `vanguard-paid-result-mobile.png`,
  `vanguard-return-log-mobile.png`, `vanguard-declined-prompt-mobile.png`.

D21 hash first bytes: Chronicler 89, Dynamo 29, Vanguard 112. None is in the
random sample; Vanguard's new role requires judgment. The human matrix passes.
Opponent judgment is **failed, pending repair hv-4a0x**. In prior declared game
`fab6ra`, physical enemy Vanguard `i10` is played normally from hand by an
explicit script, corroborated by per-game/version/instance action logs and the
UUID stage record. Subsequent Greedy worker boot rejects a duplicate canonical
UUID and falls back to random; that decision is not certified as Greedy.
Worker/catalog repair and opponent desktop/mobile rejudgment belong to
`hv-4a0x`. No mobile-opponent pass, exact opponent-energy observation or complete
initial probe history is claimed.

The first judged run waits 223.057 s for a peer before a scenario cursor-method
error. Subsequent retained failures concern unsettled control geometry,
automatic target assumptions, and requiring initial events from the post-mount
probe. All are preserved as `judged-{first,second,third,fourth}-failed.result.json`;
raw logs remain in the check scratch directory. These harness assumptions are
separate from the real duplicate-UUID worker failure, whose per-game records
are preserved in `opponent-fab6ra-log-excerpt.json`. One later strict-port
startup exits 2 because a peer occupies 5174; first-free selection then serves
5174 after it becomes available, without touching that peer.

Final runner exits zero. Owned server process groups 40305, 88896, 89670,
90581, 96618 and 26785 are all freshly absent; every owned port is released.
Provider replies settle, browser context closes, RPC calls drain and SDK
transport closes before each exact lease owner clears. No CDP session is
created. Final native browser owner record is absent. No heavy slot is held
while waiting on or using a browser lease. Cold desktop/mobile prompt and log
inspection confirms readable, unobstructed controls; the owning executor
has acknowledged the final cold capture check before the single commit.


## Same-bead integration recovery

Candidate `01a12b0c-980a-7633-9d46-0eff9c425920` reports terminal merge
conflicts in only `prompt-lab.ts` and the exhaustive role expectation test.
The owning executor's failed native update restores the clean original source.
The helper parks only those paths at their exact captured base contents in
unvalidated checkpoint `865ed9768e386f184839666aa52f900089779214`
(committer time 2026-10-11 13:01:55 UTC), preserving every other owned path.
The executor's successful native update produces checkpoint
`500a31756b2534cdf5ef711ba80e686412ee7cd0` (13:03:11 UTC) on exact new base
`a9cd815e411c5a125ee1e3d5bc827257003df188`. Neither checkpoint is submitted.

The saved three lab insertions and optionalPayment role expectation are
reapplied additively. Deleting exactly those owned additions from the combined
files reproduces the exact new base, including every peer import, fixture
and the landed abandon role expectation. The same byte-for-byte subtraction
proof holds for the primitive index, registry, prompt-role union, policy
strategy and runtime copy registrations. Card definitions, the primitive
body, eleven contracts and three scenarios match the original source bytes.
Actual catalog construction and complete reachable-role surface checks pass,
including the unique `0x370` fixture identity.

| Combined-tree check | Result | Wall | Ending one-minute host load |
| --- | --- | --- | --- |
| Focused contracts/gates/specs/role surface | 415 cases, four runners | 5.376 s | 26.968 |
| Review | 2,476 cases, 158 runners; lint, both types, cycles pass | 55.534 s | 17.771 |
| Knip | Pass | 2.545 s | 13.910 |

These checks are light and acquire no heavy slot. High host load accompanies
the review duration; it is not a controlled performance comparison. The
original full-weight fuzz, sweep and judged human captures remain evidence
for original source `9fb57a074a9b470d0df4a13c7c9d92a2308bf732` on its
original base, not executions against the combined source. The integration
changes registration context only, so those runs are not repeated. The
opponent failure and repair/rejudgment assignment `hv-4a0x` remain in force.

Both input snapshots, subtraction proofs, exact path hashes, checkpoint and
native-update records are retained in `/tmp/hv-umm2-79-integration/`;
`final-handoff.json` records the final amended source, exact new base,
committer-time recovery interval and settled writer ledger. Fresh validation
logs/timings are retained as `integration-*` in the original check directory.
No browser/server/provider is started during this recovery. Check processes
have exited; core failure contracts and the original resource closure remain
unchanged. The final single commit is reserved for the executor's fresh
other-family review and exact candidate delivery.


## Second same-bead integration recovery

The first recovery's amended source is
`e8e16011d2c1737f191d0f4de681288c25d368eb` on
`a9cd815e411c5a125ee1e3d5bc827257003df188`; its checkpoint-to-final-source
interval is exactly 386 seconds. Its proofs and executions remain separate.
Candidate `01a12b17-0569-7633-a020-8c23c6a3059f` reaches a different
construction conflict, solely in the additive scenario index. The executor's
failed native update rolls back cleanly and leaves no pending update block.

Only that index is parked at its captured base in temporary checkpoint
`37989f0c8154113fc67141a38cf52b58baa7de1c`, committed at 2026-10-11
13:12:59 UTC; the other seventeen owned paths are intact. The executor's
successful native update produces checkpoint
`f5c29ae7910d09ddb730d882212ca9a9cfb84c7c` at 13:13:37 UTC, on exact new
base `c7645d9833bb7f6bd2428334431eff67a1b368e8`. Neither checkpoint is a
submitted candidate.

The own scenario import and entry are restored. Removing precisely those
additions reproduces the new base byte-for-byte, preserving the peer
when-put-into-void scenario import and entry. All three card modules, the
primitive body, eleven contracts and three own scenarios remain byte-identical
to original source `9fb57a074a9b470d0df4a13c7c9d92a2308bf732`.

| Second combined-tree check | Result | Wall | Ending one-minute host load |
| --- | --- | --- | --- |
| Focused contracts/gates/specs/role surface | 428 cases, four runners | 4.385 s | 17.811 |
| Review | 2,492 cases, 158 runners; lint, both types, cycles pass | 52.177 s | 23.996 |
| Knip | Pass | 3.145 s | 25.502 |

No test is added or changed by either integration repair. These are one light
validation set on this second combined tree; high host load is recorded without
a performance-regression claim. No full, fuzz, sweep or browser run is added.
Original runtime evidence remains tied to original `9fb57/e1`, first combined
validation to `e8e160/a9`, and the second combined evidence to this new base and
its final amended source in the owning executor's native notes.

Second input snapshots, exact subtraction and core hashes, native-update
proof, checkpoint times and final amended source/interval are preserved in
`/tmp/hv-umm2-79-integration-second/`, with exact final identity in
`final-handoff.json`. Check logs/timings are `integration-second-*` in the
original check directory. No new runtime jobs or mechanical fallout arise;
all writers have exited. The opponent failure and `hv-4a0x` rejudgment remain
pending; the core failure-path contracts and original resource closure apply.

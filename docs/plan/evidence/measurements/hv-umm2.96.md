# hv-umm2.96 implementation and validation

Base: `a5545db55fe6ce723a98373590d1db6dc53d7670`.
Native claim: 2026-10-11 17:28:01 UTC. Validation uses two test workers.

## Text and mechanics audit

- `629fe4d4-826f-41b9-a913-458a503856a8`: Awakened and a Fast
  one-energy activation that moves its physical source to an unoccupied position.
- `c61c8b29-6911-4bbf-b1c4-0c18b22ed33f`: static +2 spark Support
  and the same Fast one-energy movement activation.
- `8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd`: static +3 spark Support
  and a Fast single-character abandonment cost followed by movement to that
  paid character's position.

These three modules have base text and no amplified text. All printed catalog
fields remain byte-identical. Authored ability definitions and canonical
verifiedText hashes cover every clause. D20 requires no entity scenario:
the abilities compose existing Awakened, Support, activated costs and timing
with the tested movement primitive.

RD-hv-umm2.96-1 follows the implemented Phasing precedent and the simplest
consistent text reading. RD-hv-umm2.96-2 records the paid character's side and
position before its single-character cost, retained on the stack across a
response and serialized state. The fixed movement requires the source still
in play on that side and an open destination. Self-abandonment is legal and
leaves an absent source that does not move. No card issue was identified.

The primitive emits existing UUID/physical-instance `repositioned` events
and preserves the source's owner, controller, printing, variant, statuses,
and zone-entry timestamp. Existing presentation and battle-log copy display
the movement. The normal activation/answer logs replay it from the battle's
init. The new `chooseSlot:move` prompt exposes public positions and accepts
an index within its fingerprinted ordered slots, through the existing prompt
protocol and Cumulus choice controls (customization rung 1).

## Checks

| Check | Result | Duration |
| --- | --- | --- |
| Last focused, focused-settled | 513 cases in 3 runners pass | 3.648084792 s command |
| Final review | 2,679 cases in 260 runners; lint, both typechecks, cycles pass | 37.991072459 s command; 31.09 s Vitest |
| Final knip | Pass | 3.516184667 s |
| Single required full | 3,333 cases in 327 runners; static checks and production bundle pass | 73.945654666 s execution + 0.024034 s heavy wait; 45.19 s Vitest |
| Exact three-UUID weighted fuzz | 300 games, 167,799 steps, zero failures | 78.169680375 s execution + 0.020139625 s heavy wait |
| Preflight all variants, both sides | 60 tuples: 28 pass, 32 ineligible skips, zero failures | 1.196874417 s command; 24.1395 ms internal |
| Browser sweep all variants, both sides | 60 cells and attempts: 28 pass, 32 ineligible skips, zero failures | 103.549 s browser lease + 184.184220458 s execution; 287.733220458 s session, 292.867617375 s wrapper |

The prior focused-final run is distinct: 513 cases/3 runners,
3.748332709 s, before the final public projection assertion. Both logs remain.
The initial typecheck and three fixture failures are retained separately.
The full run was justified by a new prompt kind and persistent cost-position
field across engine, projection, policy, and save intake. Its 45.19 s test
observation meets the suite wall budget; host load makes it an observation
rather than a controlled low-load certification. The full command includes
static checks and the bundle and is not the gate-stage timing.

Fuzz reports 8,101 prompts and 857 interactive reruns; bounded legality zero,
bounded prompts one, 148 player wins and 152 enemy wins. UUID included/played
counts in the audit order are 622/297, 617/285, and 615/229. These count plays,
rather than specific activated-ability selections. Internal fuzz reports
77.3 s wall and 84.0 s CPU. Synthetic public contracts and judged workflows
establish the specific movement routes.

Fourteen synthetic cases occupy one 282-line plain contract module, with
zero test entrypoints or jsdom files added. They cover both-side Fast movement,
physical identity and state preservation, empty-position membership and
capacity, live Support, forced and invalid answers, canonical rank bounds,
narrowed public projection, replay, rollback, cost-position serialization and
public saved-state validation, ceased created cards, self-abandonment, and
actual responses that occupy the destination, transfer control, or remove
the source.

## Browser evidence

All preparation, checks, full restoration, fuzz, and preflight finished
before serving. Twenty-three executable file hashes remained frozen through
the sweep; the exact map is retained with the checks. The sweep's 28 raw pass
reports have error=null and empty caps; 32 ineligible variants are skips.

The original judged report is
`judged-first-failed.result.json`, SHA-256
`2128c858e99aa5ebc6984596b642a00bab7dd9c910e82367fbf0e7b47316ff88`.
Its exact script is `judged-first-failed.mjs`, and its two desktop Marksman
captures have `-first` suffixes. It passed the actual eighteen-choice desktop
movement before failing a Medic QA read. The fixture compared the full nine-slot
front rank against three expected allies, including six empty slots; the
spark container also includes
accessible copy plus its visible digit; the corrected reader selects
`data-card-stat-value` and records both raw text and numbers after checking
source/ally visibility. First-attempt numeric values were not retained, and
the failure does not establish a product defect. Its caps were empty,
35.795 s lease, 1.558 s serving, 9.956 s scenario, 47.331 s session,
52.638446417 s wrapper. Root's early cold look confirmed the eighteen
desktop choices in two rows. The partially cropped hand is not a settled-hand
claim.

The second report `judged-second-failed.result.json`, SHA-256
`9dd43b24f039d73c3e3aba738872016589d750748199f1c3a87f9d739d311687`,
is retained with its exact script and `-second` captures. Its wait used a null
rank entry as a physical card ID. The logged front rank contains three
physical UUID-0002 allies and six nulls. The fixture filters non-null physical
IDs once and verifies their count and printing before visibility and spark
reads. Caps were empty; lease 505.449 s, serving 1.560 s, scenario 23.679 s,
session 530.717 s, wrapper 535.986538375 s.

The third report `judged-third-failed.result.json`, SHA-256
`6926bfd70894e2c8b26ad076d1903cc062ba30caf1395170995450fdc65e7164`,
is retained with exact script SHA-256
`933d02e20d6e256e2176990a14bed44892344c6e8c294b785c06be989e62edab`
and four `-third` desktop captures. Medic's completed proof records visible
spark values [3,1,1] then [1,3,3], while Marksman's completed proof records
all eighteen choices and the selected F4 movement. Ash's requested response
hold did not occur: after a cost answer, the driver observed main Day with
empty stack and stalled. An enemy hand containing a no-effect Interrupt
alone does not establish an actual play; the default Greedy evaluation
charges that event's energy and hand loss. Caps were empty; lease 793.215 s,
serving 1.259 s, scenario 60.071 s, session 854.569 s, wrapper
859.887666750 s. This failure concerns the requested fixture hold rather
than an observed failure of movement.

The final declared matrix passes all six workflows, with ten captures,
error=null and empty caps. `judged.result.json` SHA-256 is
`6e1161a6005a4a4ace847c05cd15cf77e20fd78279ba8bc19ace49514b2931e0`;
its exact script SHA-256 is
`8b54261c1047ef87544d6a6cb17e480628ef18d34c59fae4c0421ab449eb8aa0`.
The existing declared enemy Day activation route is used for Ash, rather
than predicting an enemy policy response. Ash's enemy B1 source retains
paid enemy/B0 metadata while the physical B0 sacrifice is in void. A live
history reload preserves that stack record. The human then actually plays
physical synthetic Interrupt UUID-000e through the normal controls; the
accepted play intent and UUID `cardPlayed` event precede movement to enemy
B0. The final source instance equals its original instance. Persisted logs
record activation, source UUID, cost prompt, and accepted physical answer.
This is declared enemy activation with an actual human Interrupt response,
rather than a claim about Greedy's choice. Synthetic contracts cover both
sides and sweep covers both sides.

Medic offers fifteen open positions, moves B0 to B2, and visibly changes
three synthetic allies from [3,1,1] to [1,3,3]. Marksman offers eighteen open
positions and moves B0 to F4. On both viewports the source, every choice,
and final source have positive, in-viewport geometry and center hit tests.
All movements publish exactly one UUID/physical-instance repositioned event
with no swap, preserving owner, controller, printing, statuses and identity.
The new mandatory prompt uses existing wrapped numeric controls and records
its physical provenance and accepted index. The source remains identifiable
in the board and preview; all choice labels fit, including eighteen mobile
choices in three rows. Final captures show the settled board and Support
spark values. Hands can extend below the viewport; no full-hand claim is
made. No duration or new status marker is introduced.

Captures are `move-chooser-medic-desktop.png`,
`move-final-medic-desktop.png`, `move-chooser-marksman-desktop.png`,
`move-final-marksman-desktop.png`, `move-final-ash-desktop.png`, and their
corresponding `-mobile.png` filenames. File inspection confirms desktop
1440×900 and mobile 390×844, at the repository QA helper's CSS scale. The QA ledger retains three fixture failures
and appends six final passes. The final lease wait was 0.043 s, serving
1.561 s, scenario 100.944 s, total 102.575 s, wrapper 107.906891667 s;
observed session host load was 16.23095703125. Completed browser lease waits
sum to 1438.051 s, separate from execution and diagnosis.

## Scope and resources

The root session recorded explicit file widening before writes. Peer 83 had
completed, and its tested interpreter commit was already an ancestor of this
worktree's base. Existing CardRef/random branches, payment/cost logic and zone
bodies stay outside this edit. Additions cover primitive registration, numeric
prompt protocol, saved position metadata, projection, new role copy/strategy
and routing, and the synthetic lab fixture. No layout or component body changed.

Raw checks, exact timing files, source hashes, and group verification are
retained outside the worktree. Full review's own 13 groups (its wrapper and
12 synthetic tooling-test servers) were freshly absent. Sweep groups 2546 and
44254 and first-judged groups 96527 and 2779 were absent after exit. Their
clients, calls, transports and leases closed; another peer can acquire the
shared lease and port after closure. No peer process or the global Playwright
service is stopped. Second judged groups 7145/29296, third 47106/3670, and final 36141/36163
were also freshly absent after actual exits. Final client/context, SDK,
transport/RPC and lease cleanup completed normally; the runner reported its
server stopped and port free. Shared Playwright remains available and peer
resources are untouched. All twenty-three frozen source hashes match after
final QA. Exact report/capture hashes and fresh group verification are kept
with the local checks.

Gross implementation time uses the native-claim-to-commit window as an
inclusive proxy, including worktree setup, dispatch, implementation and all
waiting. The exact helper-dispatch timestamp was not measured. The friction
record carries this basis explicitly and a numeric value at commit; it does
not claim a separately measured helper implementation duration.

Root cold QA approved the final six-workflow proof, captures, source hashes
and owned resource closure before commit. The local commit timestamp is
2026-10-11T18:42:54Z; inclusive claim-to-commit gross proxy is 74.883333 minutes.
The exact helper-dispatch timestamp remains unmeasured.

## Same-bead integration repair

The original source is `7475562df3c899fc622e11a2111aed7e3f9860c1`,
built on `a5545db55fe6ce723a98373590d1db6dc53d7670`.
Candidate `01a12c46-b3c9-7be2-aa4c-cf09fa7eed11` reached a terminal
admission merge conflict in four shared registration files against staging
`7cda070e665c2d576e093b6fcc0235b494373df9`; no prepared generation ran.
The owning session's first native update also failed to rebase and restored
that original clean source. Native doctor confirmed no pending update.

The workflow's park/reapply procedure preserved the complete owned patch,
original files, bases and individual conflicting hunks outside the worktree.
The helper parked only primitives/index, registry, prompt-lab and the prompt
role coverage test at their captured original base and amended temporary
checkpoint `99db892375190cf476efb535648fa65a3ed0ab3f`. The other 26 owned
files retained their byte content. This checkpoint was never submitted.
The owning session then updated natively to checkpoint
`7a013bf22f78e8fd2cdec3ce73f6c761709136c4` on exact base
`6643319ac14e84046359425ed1242f22a3f3b450`, with a clean worktree and
healthy doctor. The helper restored only the four saved additive hunks,
retaining the landed card-cost registrations, payment lab imports/fixtures
and new role coverage. Each restored addition was reversed in memory to
verify the captured updated file exactly. Comparing the other 26 owned
files with the original source found 19 byte-identical files and seven
native automerges containing landed rule, role, card-cost and Prevent
additions alongside the owned movement additions.

Checks on the combined base passed: focused contracts, content gates and
view model 588 cases in three runners (8.156027292 s command); review 2759
cases in 260 runners plus lint, both typechecks and import cycles
(50.383931125 s command, 39.34 s Vitest); knip (5.383464417 s). All checks
and local asset restoration settled, and groups 90446/90447/90448 were
freshly absent. No browser server or provider was started for the repair.

This resolution changes registration integration rather than movement
behavior. The original full-suite, exact weighted fuzz, sweep and judged
browser evidence stays tied to original source `7475562df3c899fc622e11a2111aed7e3f9860c1`.
The updated focused/review/knip evidence covers the combined base. No blind
heavy or browser repeat was needed. The final single amend and updated
base/source range are recorded in the terminal handoff for the owning
session's exact candidate and independent core review.

Final same-bead amended commit timestamp: 2026-10-11T18:51:16Z. The inclusive
claim-to-final-amend gross proxy is 83.250000 minutes, including admission,
park/update/reapply and updated validation. The original source gross proxy
remains 74.883333 minutes, with its original 18:42:54 UTC commit timestamp.

## Second same-bead integration repair

Candidate `01a12c4e-5dfc-73b2-abc2-0fd13be51fe7`, source
`96542028445b888c24e9a3e2c4c162b06681ca39` on base
`6643319ac14e84046359425ed1242f22a3f3b450`, reached terminal admission
merge conflict against staging `5761464cf1453a43092c2310a08d22e90d5d5fb2`
in `src/engine/policy/prompts.ts`; its tested OID is null. This is a distinct
single-path conflict from the prior four registration files. The owning
session's failed native update restored the clean source with healthy doctor.

The helper restored only that policy file to its captured base and amended
temporary checkpoint `9ee0d72187d7165c4cbd963b7e00eb8c631631aa`;
all other 29 owned files were byte-identical. The checkpoint was never
submitted. The owning session updated natively to
`9166f188958f51896ea6ee69a3e2b8baaec6dbdc` on exact base
`5761464cf1453a43092c2310a08d22e90d5d5fb2`, clean with healthy doctor.
The helper restored only the two grouped chooseSlot cases and the move
strategy entry. The landed strategy schema requires every role to register
its chain classification. With the owning session's explicit ACK, move
registers `chain: "finite"`: each mandatory legal answer moves one source to
one public position, with no optional decline or cancellation. Peer policy
body, tunables and other roles remain byte-identical; reversing the three
own additions reproduces the captured updated policy exactly. All other
29 owned files remained unchanged through this update/reapply boundary.
This required additive schema adaptation changes neither movement rules nor
UI behavior. It introduces no test tied to a particular default Greedy slot.

Checks on this combined base pass: focused contracts/content gates/view
model 589 cases in three runners (9.142833750 s command, 5.16 s Vitest);
review 2761 cases in 260 runners and static checks (50.938303167 s command,
40.32 s Vitest); knip (5.984259000 s). All checks and local asset restoration
settled. Groups 13418/13419/13421 were freshly absent. No browser provider,
server, heavy check or additional QA was started for this repair.
Original full/fuzz/sweep/judged evidence remains tied to source
`7475562df3c899fc622e11a2111aed7e3f9860c1`.

Final second-integration amend timestamp: 2026-10-11T18:57:43Z; inclusive claim-to-final
amend gross proxy 89.700000 minutes. Prior measured source windows are
retained above; the exact helper-dispatch timestamp remains unmeasured.

# hv-umm2.85 implementation and validation

Base: `5eb394869f188c3153f4ae38184dc9957d96af27`.
Native claim: 2026-10-11 14:22:51 UTC. Checks use two journey test workers.

## Entity and rules audit

- `967c714f-40c5-4a77-8e22-40691a2755d4`: event targets a character its
  controller controls, rematerializes it, and has Reclaim for one energy.
- `161482b6-af07-4d9e-822d-8c738672beb9`: Challenge chooses a friendly
  character as its trigger resolves; amplified chooses zero, one or two.
  The source itself is eligible while in play.

Every printed clause and amplified variant is authored, with matching
verifiedText. All printed catalog fields are preserved. Rules § Keywords and
Effects → Rematerialize explicitly fires both the character's Materialized
abilities and materialize observers. The primitive emits the existing public
materialized event using the current controller and position; the ordinary
matcher handles suppression, once-per-turn, queue order and observers.
It preserves the physical instance, owner, controller, position, exhaustion,
variant, gained spark, counters, zone-entry timestamp and existing effects.
It works at battlefield capacity because it places no new character.

No new ambiguity, RD or card issue was identified. D20 requires no content
scenario: both entities compose existing targeting, Challenge and Reclaim
with this single primitive. No interpreter, matcher, zone helper, event
schema, prompt role, policy body, presentation or UI edit was needed.
Registrations consist of one primitive export and one lazy registry getter.
Mechanical fallout: none.

## Executed checks

| Check | Result | Measured duration |
| --- | --- | --- |
| Fresh install | Complete; audit findings recorded separately | 2.729 s tool wall |
| Focused contracts and content gate | 415 cases, two existing runners | 2.00 s Vitest |
| Final review | lint, both typechecks, cycles, 2,521 cases in 234 runners pass | 52.509 s log interval; 41.87 s Vitest |
| Knip | Pass | 3.448 s log interval; 1.9 s knip phase |
| Weighted fuzz | 300 games, 152,432 steps, 3,650 prompts, 400 interactive reruns, zero failures | 75.250 s command execution; 0.0278 s heavy queue |
| Default card sweep, all ten variant slots and both sides | 22 passes, 18 ineligible skips, zero failures | 130.535 s log interval; CLI rounded 130 s |
| Final prepared-workspace confirmation, base/amplified and both sides | Six passes, two ineligible skips, zero failures | 134.589 s log interval including browser queue; CLI rounded 134 s |

Fuzz outcomes: 153 player wins, 147 enemy wins, zero draws. Feasibility bounded
counts: legality zero, prompts one. Exact entity included/exercised counts in
the order above are 614/432 and 616/397. Card exercised counts count committed
plays, rather than individual Challenge-trigger invocations. Host load was
16.758 at fuzz queueing, 13.302 at completion and 14.24 at sweep start; these
are local observations, not low-load suite budget certification.

Nine new synthetic contracts occupy one plain 230-line module; zero test
entrypoints or jsdom files added. Contracts exercise both-side observers and
FIFO across two selected physical instances, full-rank state preservation,
stolen ownership/current-controller semantics, required/optional targets and
self eligibility, all-stale and partly-stale targets after an actual interrupt,
resolution-time Challenge choices with variant bounds, suppression and
once-per-turn, and fold recovery. Recovery checks safe cancellation, new-adapter
JSON reload, invalid/foreign/stale/concurrent input, duplicate rejection,
exactly-once effects and rollback of announced materialization plus queued
triggers after a deliberate same-step failure.

Local full validation is unnecessary for this bounded primitive/content
change. Raw focused failures and the first lint failure are retained beside
final logs in `/tmp/hv-umm2-85-checks/`; they are fixture corrections, not a
change to production behavior.

## Browser coverage and provenance

Passage has 12 passing side/variant cases and eight ineligible skips; Guide
has ten passes and ten skips. The default sweep checks visible controls,
resolution, expected zone, board change and empty caps on both sides. For
Guide this is play/settling coverage; its Challenge rematerialization is
established by the synthetic trigger contract and the authored encoding.
No claim of counted production Challenge invocations is made.

D21 SHA-256 first bytes are 216 and 234, both outside the <26 sample. Both
entities use existing target/play-route prompts and materialized presentation,
with no new prompt kind, indicator or visual effect. Judged count: zero;
no screenshots were required or captured.

Final review overlapped sweep preparation/serving: review log interval
14:30:12.392–14:31:04.901 UTC; sweep server started 14:30:13 UTC. Review uses
isolated local art and restores actual linked art; the sweep has its own
preparation. Precise preparation phase ordering is not timestamped. This
limits artwork/pixel provenance; the sweep asserts runtime behavior and caps,
and contains no screenshots or artwork judgment. All five production files
were frozen by 14:28:22 UTC, before fuzz and sweep. The sole later source edit
was a typed structuredClone in the synthetic contract, before sweep startup.
Production SHA-256 values are retained in `production-hashes.json` in the
check directory; final bytes match them. No runtime evidence is described as
an art or cold visual certification.

After all checks settled, one bounded confirmation prepared the normal
workspace and swept both entities in base/amplified forms on both sides,
with no simultaneous workspace mutation. It appends six passes and two
ineligible Passage amplified skips to the original 40 rows; combined ledger:
28 passes, 20 skips, zero failures. Its wall includes a native browser lease
wait; card-sweep emits no separate queue duration. The wait was observed at
14:35:25 UTC and serving was observed by 14:35:51 UTC. Starting load was 3.63.
No full matrix or fuzz was repeated. Final production hashes match the
original snapshot. The confirmation supplies ordinary assembled-workspace
behavior/caps evidence with the same explicit limits on artwork and Guide
Challenge invocation counts.

The sweep runner closed its owned browser context, drained RPC/provider/SDK
and released its lease. Server group 42717 and Vite group 42890 are absent,
port 5174 was free at cleanup, and fuzz group 41165 is absent. The final
confirmation server group 62757 and its Vite descendants are also absent,
with port 5174 free after its cleanup. A subsequent
peer lease belongs to hv-umm2.88 and is untouched. No owned provider, server,
browser transport, lease or heavy process remains. Runtime logs remain
in this bead's ignored primary-checkout capture directory.

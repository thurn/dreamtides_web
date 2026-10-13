# hv-umm2.643 — synthetic pair-293 Aspect preparation

Source base: `54c648e549c982224150d1cb13f95c4077e32c90`. Native scope and
adoption: `hv-umm2.606`; completed semantic prerequisite: `hv-umm2.289`.
The two default `AbilityList` leaves are exercised directly by the public
synthetic `pair-293.test.ts` entrypoint. This preparation carries no deck,
balance, real-content QA, or production readiness result.

## Source and consumer qualification

The Keeper incarnation `9ae35d68-a432-45f6-ab8c-07572a25ad6b` uses Aspect
`00974abd-19d8-4d83-8af9-6a34e67f11a0`: an individual controller discard
grants its physical subject plain Reclaim until end of turn, once per turn.
The Butcher incarnation `ac116276-5569-491b-85c9-e192823bddae` uses Aspect
`e9fa35a7-fe02-4046-b10b-78e1abcc557a`: the controller abandoning a
character draws one card, once per turn.

Tests import the actual new default lists and register their exact branded
Aspect IDs as authored engine Avatar definitions. `boardState` installs
those registered permanent emblems for both controllers; the engine reads
them through `originAbilities` and emits Avatar-sourced trigger events.
The synthetic card costs, physical instances, actions and prompts provide
the causal inputs. The recipe pool Avatar supplies pool data, while battle
init selects the boss Aspect ID as its permanent emblem. Source presence
alone supplies none of the runtime conclusions below.

The two constructors follow the existing provisional design. D6 rationale
from 289 is one immediate discard opportunity for Keeper and a sacrifice
feeding another survivor without an automatic sacrifice loop for Butcher.
Original 293 owns production adoption, per-incarnation design documentation,
recipes, Dreamsigns and all final acceptance. These leaf modules carry no
ContentStatus fields.

Existing D10 precedents apply: `RD-hv-umm2.494-1` supplies physical discard
subject, actual-void-only resolution and public floating Reclaim;
`RD-hv-7x4l.6-4` supplies end-of-turn expiry; `RD-hv-umm2.532-1` supplies
abandon lookback, including reclaimed and ceased subjects. No new rules
ambiguity or shared-body repair was identified.

## Observable contracts and applicability

The one 326-line node test entrypoint contains 36 total cases: 18 contract
cases per controller, mirrored for player and enemy. It uses only synthetic catalog content and the public
engine/fold boundary. The shared private fixture checks state invariants,
views and event redaction after actions.

| Contract | Observable proof |
| --- | --- |
| Permanent controller/source/subject | Actual Avatar trigger sources, distinct physical subjects, forced opposing discard/abandon, exact controller rewards. |
| Individual event and once/reset | Multi-card discard gives its first hand-ordered subject Reclaim; multiple abandon events draw once; repeated same-turn events give no additional reward; actual next turns reset. |
| Type/copiable cost/effective spark | Keeper retains synthetic deck-modified Character/Mage cost and spark; Butcher sees an Event played as a Character, with its existing zero-spark/cost semantics. |
| Reclaim cost, capacity, duration | Event Reclaim pays its normal cost and banishes; a full back rank refuses character Reclaim; grants expire at the turn end. |
| Empty/ceased/void-only | Empty random discard consumes no RNG or trigger; a discarded created subject ceases; a subject put in the deck before trigger resolution receives no grant; abandoned created/figment subjects still cause draw; empty deck causes ordinary Fatigue. |
| Public and private observations | Void grants appear in both views; abandon is public while drawn card identity remains private; invariant/redaction checks pass. |
| Save/replay/refusal/concurrent input | Persisted cost and committed effect prompts replay; stale, foreign, invalid and concurrent inputs bounce; cancellable costs preserve gameplay state/use; committed effect cancellation is refused; resumed events/state equal inline execution. |
| Failed step/recovery | A failing resolve commits no causal discard/abandon, trigger or reward. Its earlier card play remains committed on the stack. Recovery restarts from the saved healthy action boundary and completes a valid causal action with one emblem reward. |

Neither Aspect chooses a random reward nor materializes a character or
figment. Empty reward RNG pool and materialization capacity therefore have
no new behavior here. Relevant surrounding cases exercise empty discard,
empty draw/Fatigue, normal Reclaim capacity and an abandon paid at a full
back rank. Native nth-event language is represented by first qualifying
individual event/once/reset; neither constructor has a separate nth counter.
Abandon candidates are characters under ordinary public rules. A wrong
Event filter is discriminated without placing an invalid Event in play.

Affected existing contracts run through their real unchanged
`contracts.test.ts` entrypoint: grant-Reclaim subject/cost/duration,
abandon lookback/recovery and discard cohort/privacy/rollback. The selected
68 tests pass; 2,709 unrelated contracts are explicitly skipped. Existing
foundation contracts cover the detailed unchanged late expiry and other
engine recovery semantics; this child owns the actual new emblem chains.

## Five failure families and negative controls

1. Genuine permanent behavior is established by the registered imported
   lists and Avatar-sourced results. An empty Keeper list fails the tests.
2. Wrong controller, batch instead of individual discard, wrong subject,
   wrong character filter, absent once-per-turn and wrong draw count each
   fail observable mirrored cases.
3. Ceased/empty/capacity/cancel/refusal/save/replay tests cover the applicable
   semantics. Changing temporary Reclaim to permanent fails expiry.
4. Signature-only full-pool claims are excluded by the exact command
   inventory, unchanged read-only source hashes and retained native joins.
5. Source scope and native proof independently preserve production UUID
   ownership, pending design/catalog bodies and final game quantities.

Ten negative controls mutate only the two owned leaves, one at a time:
Keeper controller, batch, all-void subject, once, expiry, empty list;
Butcher controller, Event filter, once, draw count. Each exits 1 with actual
observable failures. Both leaves are restored byte-for-byte before final
verification. Structured evidence records each failure and restored hash.
No shared engine, fixture registry or production body is mutated.

The read-only design, types, catalog, init, recipe builder, activation,
matcher and relevant source seams retain their before/after SHA256 values.
The parent's fresh original-293 native proof retains its open full-acceptance
join and 210/643 barriers. Original 293 keeps both full UUIDs, D6/D20,
weighted300/preflight/sweep/D21, seeded random-fill/Starter prerequisites and
20 clean Greedy games **per incarnation**. Original 295 retains 50 games
per incarnation, its frozen pool and champion rerun. Tests do not gate on
mutable production pending status, copy or default choices.

## Verification and resources

The structured companion records exact commands, PID/PGID/start identity,
paired starting load/wall duration, exit status, source hashes and cleanup.
Installation runs first and passes in 2.830348 seconds (PID/PGID 93941).
Draft fixture failures and their corrections remain in the command record.
The restored final focused run passes all 36 tests; the affected run passes
68 tests. Aggregate review, Knip and friction schema results are recorded
in the companion as they complete.

| Final check | Result | Wall seconds |
| --- | --- | --- |
| Own focused contracts after lint cleanup | 36 passed | 1.861565 |
| Selected existing affected contracts | 68 passed | 3.223047 |
| `npm run review` | passed, including types/lint/related36/schema | 11.692247 |
| `npm run knip` | passed | 4.532542 |
| Friction schema at verification handoff | passed | 0.142839 |

The final review command starts at `2026-10-13T17:29:38.005676Z` with
1-minute load `22.40283203125`; that observation is paired with its
11.692247-second command window. Its inner review steps have their own
starting sample `21.6494140625`. The earlier aggregate review exits 2 for
one unused fixture variable; its receipt is preserved and the cleaned
source is covered by the passing checks.

Only the two leaf lists, this test and own evidence are writable. There is
no infrastructure/config/shared engine, new primitive or prompt change,
and the native task has no core-review label. Full review, browser QA,
weighted fuzz and tournaments retain their applicability at the original
production join. No browser/server/provider/heavy lease is used here.
Parent owns cold-review applicability and any final review routing. During
the temporary routing window that review uses a fresh read-only
`gpt-5.6-sol` Codex CLI reviewer; normal routing resumes at
`2026-10-14T01:00:00Z`.

Test delta is one file, 326 lines and zero jsdom files; its new entrypoint
is reported separately from unchanged contract modules. The eight-field
friction record includes dispatch, research, coordination, waits, negative
controls and validation to its actual cutoff. Final precommit refresh
includes remaining parent wait and schema verification. Model sampling is
UNKNOWN. No engine or product defect was proved within the Aspect scope.
Installation reports existing dependency advisories separately in
`docs/plan/evidence/pre-existing/hv-umm2.643.md`; their remediation is outside
this leaf preparation scope.

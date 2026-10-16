# hv-umm2.771 — Greedy activation progress

The main-activation simulation retains a strictly improving immediate position after responses settle. An activation without that gain competes with passing at the original window boundary. Failed or unsettled continuations are excluded. The last settled decision is inspected after at most the catalog pass allowance, preserving productive activations that settle on its final pass. Rules, legal actions, normal 256/64 budgets, UUID identities and seeded view-only sampling are preserved.

The public runner's synthetic contracts cover both sides: renewable zero-utility movement, source-spark-neutral renewable point gains, neutral movement with a winning positional boundary, error/non-settling response and boundary continuations, and productive settlement on the final permitted pass. Fixtures use public rank capacities and assert engine invariants. The final policy suite passes 83 cases, including all 67 existing productive/adverse/finite/response, Phasing and reposition controls; test delta is 16 cases and 168 lines in the existing contract module, with zero new test files.

## Completed original full-pool witnesses

| Original ordinal | Actions / policy decisions | Steps / commits | Whole-command CPU / wall seconds | Final state hash |
| --- | --- | --- | --- | --- |
| 173 | 24 / 32 | 184 / 25 |27.214044 /26.746538|`0dea0201de15b6`|
| 19 | 83 / 153 | 418 / 84 |1597.293582 /1390.962607|`1c3c12ae01eb1d`|

Both runs used each original full initial state, seed, mirrorGreedy policies and normal iteration budgets, computed every new policy decision, reached actual victory and completed within the 30-minute external bound. Every real step and commit passed invariants; full ScriptedSource replay matched every step, state hash, event, answer and bounded-legality array with exhausted answer sources. Every actual commit's bounded array was empty. The parent independently verified both durable hash chains and raw action/hash joins.

Game 19 preserves all 84 original committed states/events/answers/actions/bounded arrays and all 83 actions, including 23 activations of UUID `16d2e85d-f940-43dd-9867-784b3a5ec5d7`, physical instance `i6`. Its original journal reused 138 policy decisions and 71 commits; the fresh 153-decision run has no matched timing baseline. The costs above are descriptive, with no speedup or regression claim. These two repair witnesses leave the parent 10,000-game final acceptance unchanged.

## Source and evidence custody

Base is `c259eac20566ba03314a34ecbf748e6ce87b9d8d`. Tested runtime `greedy.ts` SHA256 is `2bb3c3ec2836e1a8b96f074ab043449a1c2a375b430a0f048cd22e3c31255c33`; final contract SHA256 is `21adab827e063616c05c0853263d4ceb6ec34b1d3ed9e1259f3092e78693eddb`. They are unchanged through both witnesses and final evidence authoring.

The bead QA directory retains `raw-evidence-index-v1.json` (SHA256 `e3cb12e58852040be0ad83a44d7964948efb1a841a1d19b808d6680dcafb5785`):181 parent-rehashed files totaling 73,103,014 bytes. It binds copied original inputs, source-read proofs, command receipts, the exact scratch adapter/manifest and both terminal journals. The structured measurement file provides each filename/hash and exact command/source epoch. Raw original journal semantic coverage is explicitly partial/structural; byte custody is distinct from a semantic read. Final schema, author completion, core-review and delivery receipts are separate from this frozen index.

The scratch adapter SHA256 is `40ed3e979f0849cedaf1b39e37a63a3efde94d75469c4166110a7f73054b8540`; manifest SHA256 is `a89f65857ae796d95279790e50b99b72870ac5c180440d8980679f47beb636e0`. It uses public playGame with the original init/policies and own per-step/per-commit replay. Strict typecheck and tiny synthetic success/failure controls passed before the real runs.

## Validation qualifications and failure paths

The original-source negative epoch recorded 67 passes / 14 failures. Both movement-progress assertions reproduce the window cycle. Two new activate-only positive expectations were fixture errors because the engine selected a valid repeatLoop. The final positive uses regenerated figment identities to exercise ordinary activate; the response-fault fixture uses a visible responder. The first 81-pass epoch also had an invalid 10-entry front rank, and is not positional invariant evidence. Final 83-pass fixtures use actual capacities, invariant checks and the final-pass positive. No claim is made that all strengthened final fixtures ran on original source.

Final-source review passed 17 files / 6,167 tests (103.398117 CPU / 38.241544 wall seconds); Knip passed (5.418806 CPU / 4.974526 wall seconds). Runtime/test bytes remain frozen; final own friction schema and whitespace receipts close the added evidence checks. No unchanged-code aggregate repeat, browser QA or local full gate was needed. All nine command trees and collectors were independently settled, with no servers, browsers or survivors. Model CPU/time is unavailable; the implementation window is inclusive elapsed wall time.

Simulation errors and non-settling response/boundary paths have explicit public contracts and legal progress fallback. Fresh-engine same-request checks and recorded-answer replay cover restart behavior. Stale/illegal sample failures are excluded by the engine facade. Policy code has no partial persistence write or new shared concurrent transition; the adapter's deliberate failure control preserves its durable creation prefix. There are no separately encountered pre-existing product findings. Fresh Codex core review, exact candidate certification and promotion remain parent-owned delivery work.

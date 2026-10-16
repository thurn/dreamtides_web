# Sage audit of hv-umm2.768

## Actual read account and custody

This is the fresh bounded read-only Codex Sage audit requested by the owner of hv-umm2.768. It is not a code review, an implementation, the final Phase 5 retrospective, or final gate acceptance.

The required packet `/tmp/root768-20261016/sage-required-scope-v01.json` has SHA256 `670f3d2a226bd39428d2719f0d2c1a9c7c6f0bcdeb1d97b4ea16c83a07feadc8`. All 38 required inputs, covering all 12,729 requested lines, were read completely in their requested modes/ranges. All 22 frozen source bodies (4,483 lines) were read completely. All required SHA256 and line counts match. For all 26 repository-backed packet inputs, the frozen copy equals the own-worktree bytes and exact Git HEAD bytes. Own workspace is `/Users/dthurn/dreamtides_web/.worktrees/codex-suite-cost-audit768`, HEAD `1d5adfdee7ce2fde1f2a7431066afb7f0b3ad63d`; its status was clean. No foreign worktree was accessed.

The companion scope JSON carries each absolute input path, expected and actual hash, exact actual range, read mode, clipping recovery, supplementary scope and unknowns. The following compact account precedes findings:

| Required frozen input | Actual read lines | Disposition |
| --- | --- | --- |
| 00-AGENTS.md | 1–145 | complete |
| 01-README.md | 1–334 | complete |
| 02-vitest.config.ts | 1–115 | complete |
| 03-setup-dom.ts | 1–48 | complete |
| 04-dom-globals.ts | 1–130 | complete |
| 05-render-cleanup.ts | 1–20 | complete |
| 06-review.mjs | 1–592 | complete |
| 07-review-plan.mjs | 1–390 | complete |
| 08-contracts.test.ts | 1–6 | complete |
| 09-cost-composition.contracts.ts | 1–479 | complete |
| 10-cost-modifier-nth-support.ts | 1–103 | complete |
| 11-cost-setter-composition-support.ts | 1–98 | complete |
| 12-cost-modifier-reclaim-composition-support.ts | 1–99 | complete |
| 13-when-copy-trigger.contracts.ts | 1–497 | complete |
| 14-with-materialized-support.ts | 1–130 | complete |
| 15-engine.ts | 1–120 | complete |
| 16-catalog.ts | 1–354 | complete |
| 17-board.ts | 1–152 | complete |
| 18-synthetic-cards.ts | 1–143 | complete |
| 19-hv-umm2.766.json | 1–448 | complete |
| 20-hv-umm2.766.md | 1–17 | complete |
| 21-package.json | 1–63 | complete |
| workflow.md | 249–407, 1038–1085, 1240–1413, 1801–1847 | complete |
| decisions.md | 520–557, 734–823 | complete |
| engine-design.md | 2989–3126 | complete |
| metrics.md | 1–1207 | complete |
| raw-cost-projection-v01.json | 1–4980 | structured complete |
| baseline-archive-index.json | 1–235 | complete |
| baseline-sage-d19-cost-audit.report.md | 1–117 | complete |
| baseline-parent-d19-baseline-assessment.json | 1–242 | complete |
| baseline-native-baseline-authority.json | 1–26 | complete |
| baseline-native-control-authority.json | 1–26 | structured complete |
| 766-helper-full-inner-v01.receipt.json | 1–20 | complete |
| 766-helper-full-inner-v01.stdout | 1–78 | complete |
| 766-helper-full-inner-v01.stderr | 1–560 | complete |
| 766-helper-focused-after-v01.receipt.json | 1–24 | complete |
| 766-focused-before-v01.receipt.json | 1–24 | complete |
| native-task-scope.json | 1–13 | complete |

The cost projection was fully parsed, every one of its 436 report rows and 383 primitive-group rows was displayed/read, and all unrounded values were compared exactly with fresh aggregations of the entire preserved raw JSON. Raw JSON is `/Users/dthurn/dreamtides_web/artifacts/qa/hv-umm2.46/d19-baseline-custody-cae0fdec44bd49779efb22fe3eebcb8e/standalone-vitest.json`, SHA256 `bd92100f359e8fe881319bf9b72c1ab3f625b056e120801f07a9391362665e4c`. It is a one-line structured input: complete structure/count/status/cost parsing, selected-cohort semantic attribution, and no claim of reading every unrelated assertion's contract. It contains 436 owning reports, 12,206 cases, all passed, success true, no failed/pending/todo cases. Its 1,886 nested suites are a separate JSON count, not 1,886 files. The 5,784 primitive cases and every projected group match exactly. Baseline authority/control JSON was completely parsed; every control field either equaled the fully read baseline field or its entire changed value/suffix was displayed. This lossless comparison did not omit authority text.

Clipping was repaired by separate successful reads: plan README170–259, workflow1370–1396, and766stderr303–449. The766stderr was read completely, with reversible repeated-path aliases in its long portions. A supplementary own-worktree Git-verified read of `docs/plan/evidence/measurements/hv-umm2.676.json`, SHA256 `ac590728fd60709f48c5416a77ca6271d7010182ab7aff497dee3e9cef67c669`, credits only lines1–180. Its initial whole display clipped; lines181–855 are expressly uncredited and unnecessary for the metadata conclusion. Sage, shared entry, and filing skill bodies were read in full. Native filing/claiming stays with root by the explicit task brief.

There are zero denied/missing inputs and zero partial/unread **required** ranges. There is one partial supplementary evidence input (676) and no additional production-source read. Full transitive reset dependencies and runtime fixture/body attribution remain unknown; neither is silently treated as established.

## Decision and measurements

**No confirmed ready speed repair is established within this bounded source scope. Both broad hypotheses are rejected as implementation proposals under the available proof.** Source-qualified observations below retain useful limits without inventing a cost saving. No runtime diagnostic is essential to this negative source conclusion, and none was requested or executed.

The preserved baseline source is `00a9521babd1d9b446f2ddac023c5593eacd6024`. Its cumulative full-run import65.49s and separate standalone cumulative assertion115.531432755s are not wall-time shares or subtractable savings. The standalone command's CPU is212.640422user+26.652877system=239.293299s, wall105.739047542s, test step99.9s, start/end load4.658/5.618, two workers. The standalone lacks a during-run idle sample; the separate initial baseline has a72.37%idle test-phase sample. The initial full test is100.70s, wrapper101.5s. Do not turn cumulative attribution into an A/B comparison.

Completed766's measured focused four-file pair is22.303094→17.918859s full-command child CPU (19.657519%), wall17.979391→15.391694s, start load2.36/2.87,83passed cases in4files. Its first focused run follows fresh install; the after arm is warm. Those measured gains are qualified and bounded. Its actual changed-source full run passes12,206cases/436files with Vitest87.48s, review test88.1s at load3.993, full inner120.623813s. The actual measured766source is `cbec1c8fbeec238a1ee0782de127eb8cdcc28d31`; current audited1d5HEAD integrates767's separate policy-runner argument-type work. No current-head fullsuite run/count/budget observation is inferred from766. The60s target remains unmet by the latest supplied measured source, with no current-head success claim.

676's audited metadata identifies BeadCharm UUID`7a37386d-6e7c-4f08-b07f-e92a1fd69893`, base`a9b02f84b47f73e8e3e96aca6e5662b83bdb3f93`, one content leaf and no new primitives. Its6,551cases/247files are diff-aware review, explicitly not review:full. Its authored static behavior, weighted fuzz and browser evidence grant no reset/suite-cost authority. The native768reference to676 cannot supply a fabricated cost source epoch.

## Hypothesis 1: current setup/import/reset contracts

Rejected: removing `vi.resetModules`, exempting all engine files, sharing module-mock metadata, changing isolation globally, merging unrelated contract files, or inferring no leakage from an unrelated passing smoke.

`vitest.config.ts:36–48,83–111` partitions mock-calling files into an isolated project and runs non-mocking node/DOM projects with shared runners and explicit resets. Its58–65 environment partition already keeps shared DOM files contiguous. `setup-dom.ts:19–26` resets module registry, timers, globals and env, then imports the cleanup registry after that reset. `dom-globals.ts:22,77–130` deliberately retains a Symbol-keyed per-window descriptor/accessor snapshot and restores it plus document body. `render-cleanup.ts:6–20` owns a mutable Set that must be the same instance registered by current renders and drained by hooks. These bodies express correctness contracts, not incidental overhead.

The inspected engine/catalog APIs also contain per-engine legality/view caches and per-catalog characteristics/statics/outside-play caches (`engine.ts:67–120`, `catalog.ts:284–354`). Some are derived and safe for immutable committed states; that does not prove all consumers, mutations, module registration side effects, synthetic hooks, transfiguration readers and downstream dependencies are reset-independent across files. The whole graph and all mutable paths were not read in this bounded audit. No precise reset-exempt subset with a stable public order-sensitivity witness has been proved. Retaining the existing reset boundary is required here.

Moving the20-line cleanup import into the DOM branch is a superficially narrow candidate; it avoids a small non-DOM import, but this packet supplies no evidence of material command cost or a>=10% target, and no reason to expect it explains65.49s cumulative import. It is not a confirmed ready speed repair. No configuration/setup writer Areas are requested.

A future narrower reset proposal must first enumerate its actual file/dependency subset, inspect every mutable/side-effectful path, and name a deterministic public sensitivity witness: change one file's accepted observable state and verify a later file's fresh public behavior under opposing orderings and current mock/DOM contracts. Shuffled green runs alone cannot prove absence of hidden leakage. Such source proof is absent, so no safety waiver is proposed.

## Hypothesis 2: top primitive fixture or redundant work

The exact selected attribution is:

| Source owning group | Cases | Cumulative assertion seconds |
| --- | ---: | ---: |
| cost composition table |532|3.570237243|
| player closed event-copy continuations |20|1.451717288|
| enemy closed event-copy continuations |20|1.407687957|

The table group comprises336payment rows (3.181422580s),168affordability rows (0.300089710s), and28Offering/discard-min exclusion rows (0.088724953s). Source has27mode cases plus a baseline crossed with12route variants. Payment rows apply9or10additional-cost shapes (3,276actual public plays, static source expansion), affordability covers every extra at the least energy and immediately below when positive, and Offering exclusion preserves the normal route while refusing an impossible discard-min Offering. These are different observations. Static expansion counts identify operations, not their measured cost.

`cost-composition.contracts.ts:254–290` constructs route/extra boards and timestamped floating changes, including physical sources, known deck tops, grants, opposing controller attribution and next-card IDs. `observed:310–351` calls public `engine.apply`, checks invariants and extra-specific discarded/abandoned/drawn/target provenance, then reports paid energy/points, selected route flags and consumed effects. `offered:368–371` calls public legality at a separate energy boundary. `379–416` compares those observations with a rules-derived expectation and retains both failure-side affordability and Offering eligibility. Identical arithmetic totals across rows do not show equivalent legality, payment, route selection, target or consumption paths.

The nth/setter/Reclaim support bodies were read completely. Their real producers, both sides, chosen-route competition, grant play, X binding, optional/choice payments and opposing resource preservation distinguish them from fabricated floating change arithmetic. This audit establishes no cheaper stable public witness for deleting their breadth, the532rows, or the5,784-case runner.

Repeated board construction is visible, but its execution cost is not separated from legalActions/apply or invariant work. `board.ts:64–152` calls initial state, mints exact ordered physical IDs and statuses, installs emblems/decks/figments and refreshes deck-top reveals through Context; energy also sets maxEnergy. Sharing an arranged board, memo, or catalog between rows would change allocation/identity/cache dependencies. No complete proof exists here that a template/clone substitution preserves all public results and failure paths, and no profile establishes it as a material expense. The relevant Context/initialState/clone/legality/transitive mutable behavior is outside the read scope; an assumed pure helper name is insufficient. No shared fixture cache is proposed.

The copy continuation20cases/side match source exactly:4hand/ephemeral/ceased combinations, actual temporary creation, actual live-source banishment,2unchanging and2already-satisfied deck-guard references,2real-draw victories beyond threshold,1fold/reload/rollback/competing-input trajectory,2dormant hand-count victories,1real stopping-mode case,3interfering-listener backgrounds and1accounting-reset entry. They cover both source/controller directions. Their dominant recorded cases are the fold trajectory (267.550/263.852ms), the three interfering-listener trajectories (233.894/235.686/239.410ms player;220.390/227.157/222.506ms enemy), and actual beyond-threshold deck victories. Those paid paths are the intended contracts.

`when-copy-trigger.contracts.ts:292–340` produces these actual public occasions and backgrounds; `343–350` answers actual prompts; `351–497` distinguishes mandatory draws from real eventual victory/stopping/interference. The fold case425–452 preserves every mid-prompt reload, partial-copy suspension and thrown-answer rollback, unchanged committed hash, wrong-side/invalid/cancel/stale/duplicate rejection, inline/fold state and full published-event equality, and both-view determinization fidelity. Replacing the terminal inline run or later prompts by canned results would discard the equivalence witness. Shortening the threshold, stopping early, dropping a side, or deleting background/failure cases is unsupported.

There is small demonstrably repeated preparation: lines411 and455 call `continuation(...)` only to read its configured threshold, then build the actual separate fixture. Those expressions expand to8discarded fixture creations across the2references/2temporary values and both sides. No measured preparation/body split shows material cost, and the source of the default config and safe alternate access have not been fully followed. This is a non-actionable attribution note, not a proposed>=10%repair. It cannot justify shortening real trajectories or replacing the public fixture wholesale.

Accordingly both blanket deletion and an assumed fixture rewrite are rejected. No gameplay, policy budget, tournament, production content, reset or config writer is requested. Required payments/composition/provenance, reload/privacy/rollback and competing-input breadth all remain.

## Filing, checks and remaining acceptance

There are zero confirmed ready implementation findings and therefore no precise writer Areas to admit or new repair bead to file from this report. Root retains native verification and deduplication. Optional source/evidence reads never expand writer authority. Current767 stays separate and untouched.

If a later source-qualified repair is found, its bead must name exact changed function bodies and bounded test/support files, all read-only consumers and mutable dependencies, and stable public sensitivity plus failure-path coverage. Predeclare the same actual two-worker command on exact before/after source, primary full-command child user+system CPU with>=10%improvement-or-revert, secondary wall and actual cache/load/source/settlement receipts. A targeted primitive command must retain all affected groups, while normal related checks, review/Knip and required full review for shared infrastructure remain. No timing/statistical assertion belongs in tests. Require a fresh cold read-only Codex review of exact source/diff, verify findings and dispositions, and gate46join before project admission. These are conditions for a future repair, not evidence that one already exists.

This source audit creates no new runtime evidence and does not warrant another unchanged full-suite diagnostic. The latest supplied changed-source measured87.48sVitest/88.1stest step remains above60s. Full-sweep QA, complete soak, all original final acceptance, final Sage retrospective incorporating newly landed records/outcomes, full-phase cold review and release/staging joins remain on originalgate46.

## Terminal disposition

No repository edit, install, test, runtime game, browser/server/process group, helper, native Beads/Hive/Tollgate action, commit or permission gate occurred. Only report and scope files under `/tmp/root768-20261016/sage-output/` were written. No persistent runtime resource was acquired, and none requires settlement. Root owns evidence authoring, mandated docs-only checks, exact commit/certified delivery and final acceptance.

## Owner disposition

The owner verified all38 required input hashes and actual ranges,26 exact repository bindings,46 baseline archive payloads and unchanged6,038 existing tracked files. Native dedup queries cover25 admitted and10 intended unfinished records. Both rejected hypotheses and the non-actionable eight-fixture observation remain qualified; zero confirmed repairs are filed. Current audited1d5HEAD and measured766source are separate. The60s target and complete finalphase retrospective/review/QA/soak/release acceptance remain on hv-umm2.46.

Own docs-only review, Knip and schema receipts, the claim-inclusive pre-Git cutoff and additive actual commit return are retained with this bead.

Claim-inclusive pre-Git cutoff: `2026-10-16T10:19:02.879183+00:00`, 679.879183s from10:07:43Z. Docs-only review passes in0.355632s and Knip in11.490805s; both command groups are empty at exit. Review-start load15.39 qualifies these observations; no comparable-load speed claim is made.

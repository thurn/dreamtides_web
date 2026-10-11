# hv-umm2.414: bounded Greedy loop simulations

Base: `d08eeff0e586ca530fc9473079ee6d6d3405583a`.

Greedy applies a sampled loop with a repetition count bounded by the AI catalog ceiling, the sampled battle's iteration cap, and an original numeric request's count. The engine offers its original action and the policy's candidates and returned choice carry that action. The policy iteration budget counts simulated top-level actions; each accepted-loop simulation adds at most the configured number of repetitions. The existing stack-pass limit bounds responses after the application. A repetition's card/trigger work can vary, so this is a deterministic repetition bound, not a strict elapsed-time guarantee.

The decision trace includes `loopSimulation` when a loop application is attempted: the catalog iteration ceiling, application attempts, and complete repetitions reported by matching `loopEnded` events from successful applications. A failed application contributes an attempt but no unobserved repetition count. Original loop IDs remain in candidate actions; logging uses the existing AI decision record path.

The new synthetic energy-only loop tests observe the real engine through its public `apply` facade and committed-step observer. They cover the usual battle cap and a synthetic cap of one. Assertions constrain requested numeric counts, actual `loopIteration` steps and completed iterations, require positive observed repetitions, and check that the returned action belongs to the engine's original offer. Bounds derive from catalog configuration rather than pinning its numeric default. The existing synthetic points-loop test requires accepting a loop that reaches victory.

The deterministic negative run used byte-unchanged base `greedy.ts`, after adding only the test, catalog field and optional trace DTO. It observed 10,000 committed `loopIteration` steps and failed the ceiling-plus-one assertion (33 at this configuration). No source restoration, detached performance snapshot, or wall-time comparison was used. The initial invocation with unsupported Vitest `--minWorkers` failed before tests; its corrected invocation used `--maxWorkers=2`.

An initial required review passed 2,352 tests in 227 files and reported a type error for a synthetic request's raw decision key. The fixture uses the existing `decisionKeyOf(sliceOf(...))` helper; focused typecheck passed. A subsequent review passed before the final cap-one request-count assertions were added. Those checks and the final review are retained separately rather than represented as one run.

The 20-game seeded fuzz smoke exercises Random-policy engine invariants: 10,171 steps, 220 prompts, 24 interactive reruns, zero failures. It supplies engine-safety coverage; the synthetic policy tests exercise Greedy. Internal report: 5.1 seconds wall, 6.8 seconds CPU. These observations are not a speedup or budget-at-load comparison.

This internal policy change uses focused checks, diff-aware review, and Knip. Browser QA and a local full suite are outside the proportional verification scope. Per-command outputs and process-group records are retained outside the checkout under `/tmp/hv-umm2-414-checks/`.

The production `EngineAiDriver.answered` logger forwards the optional trace metadata. A semantic driver test supplies a synthetic work record and verifies the resulting `ai.decision` log field. Final focused policy plus driver checks: 25 tests in 2 files, 3.820399 seconds command wall. Final review: 2,353 tests in 227 files, 36.479863 seconds command wall (Vitest 30.65 seconds). Knip: 3.269252 seconds command wall. All completed successfully, including workspace restoration. Host load for the final review typecheck start was 5.15625.

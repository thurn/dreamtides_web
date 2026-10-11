# hv-umm2.322: Functional-zone integration smoke

- Base: 59bbefc5d24fd3ad9924865ff55a6aab4c4890bb.
- Two synthetic regressions fail on the base and pass with the change: hidden deck-only static reconciliation, and continuous-source collection in a zone permitted by the shared predicate.
- Focused tests: 47 pass. Review: 161 files and 2110 tests pass, with lint, typecheck and import-cycle checks. Knip passes.
- Heavy-slot fuzz smoke: 200 games, 100710 steps, 1688 prompts, 166 interactive re-runs; zero failures or feasibility bounds.
- CPU: 48.4 s. Wall: 44.5 s. Host one-minute load: 29.87. Heavy-slot wait: approximately 81 s behind peer browser QA.
- Runtime ledger: owned lockf PID 48964 and fuzz PID 53088 exited. No browser, server or reviewer process.

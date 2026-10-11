# hv-umm2.403 pre-existing observations

`npm run fuzz:engine` plays both sides with the Random policy (`scripts/fuzz-engine.ts`), so the fuzz smoke checks loop termination under Random's optional-chain decline only. No seeded harness plays Greedy against Greedy, so the bound's effect on Greedy's answers is covered by the policy and contract tests alone.

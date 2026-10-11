# hv-umm2.89 pre-existing observations

- Fresh-worktree `npm install` reported 17 dependency advisories. Dependency versions and lockfile are outside this primitive's scope; installation and required source checks succeeded.
- The weighted fuzzer's card `targetCoverage.exercised` counts `cardPlayed` events, rather than card activations (`src/engine/testing/fuzz.ts:447–463`). The required weighted run passed. An ignored public-engine same-seed replay probe separately records successful activation and actual draw for both exact UUIDs on seeds `fuzz-2` and `fuzz-5`; `activation-probe.json` and `activation-fuzz-*.jsonl` retain this evidence. No shared fuzzer change is required for this bead.

The optional browser fixture's function-source serialization and automatic single-candidate cost diagnostics are authoring corrections recorded in this bead's QA evidence, not runtime defects.

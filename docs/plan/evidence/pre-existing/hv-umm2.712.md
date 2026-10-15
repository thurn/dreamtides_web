# hv-umm2.712: pre-existing contract fixture dependency

At base `8685a75f75cd3849c27e13155e93fc14ecd7e998`, `src/engine/effects/primitives/contracts/score-group-trigger.contracts.ts` imports the production Root Staff leaf at line 32 and derives the `sign` fixture from its UUID and abilities at line 48. The ordinary scoring-group contracts use that fixture through `setup(..., true)` and the saved-checkpoint recovery setup. Their draw/discard expectations therefore depend on mutable production ability composition. The sanctioned content coverage gate has its separate data-to-engine scope; these are ordinary engine contracts.

Parent filed and admitted canonical follow-up `hv-umm2.715` for the local synthetic fixture/import repair, preserving the original scoring-group acceptance and Phase 5 gate join. This bead changes only its admitted pending-answer block; the fixture and other contract bodies are read-only here. No implementation or review completion is claimed for the follow-up.

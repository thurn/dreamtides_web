# Pre-existing issues found by hv-umm2.59

- `src/engine/prompts/answers.ts` `forcedAnswer`: a `chooseTargets` or `chooseCards` prompt with no candidates and `min: 0` ("up to N" with nothing to choose, as `DSL.pumpPermanently` with no character in play) has exactly one legal answer, `[]`, but is not answered automatically, so the player must submit an empty choice.
- `npm run fuzz:engine -- --weight-uuids` rejects synthetic fixture UUIDs ("Unknown or ambiguous fuzz target UUID"), so a primitive bead whose only consumers are synthetic DSL fixtures cannot run the weighted fuzz smoke through the script; this bead weighted its fixtures with `playFuzzGame` and `SYNTHETIC_FUZZ_POOL` from a scratch script instead.

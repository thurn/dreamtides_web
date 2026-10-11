# hv-umm2.326: Pre-existing issues

- `src/engine/effects/primitives/cards.test.ts` groups many primitive contracts and exceeds D19's approximately 500-line guidance. Bead hv-umm2.314 owns the contract-module split; this bead adds the requested lookAtTop regressions in the existing group without overlapping that structural work.

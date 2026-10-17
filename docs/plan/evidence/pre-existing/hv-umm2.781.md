# hv-umm2.781 pre-existing evidence

`src/engine/effects/primitives/choose-subtype.ts`, `withChosenSubtype`: an
outer type choice substitutes placeholders inside a nested `chooseSubtype.then`
before the inner choice resolves. A synthetic public `runScenario` with outer
Mage and inner Warrior announces both choices but draws the Mage at `i3`; the
Warrior selected by the inner instruction is at `i2`. Both controllers reproduce
this result. Rules § Choose a character type associates a following instruction
with its chosen type, so the nested instruction needs its own lexical binding.

The retained read-only reproduction is `nested-choice.mts`; raw output,
source hashes, actual process exit, wall time and descendant CPU are in
`preexisting-nested.log`, `preexisting-nested.inputs.json` and
`preexisting-nested.receipt.json` under
`/private/tmp/dreamtides-executor-01a13046-4c66-7813-9606-9913f0743415/floating-subtype781/`.
The substitution loop and `mentionsChosenSubtype` are outside this bead's writer
partition. The owning session filed this evidence as `hv-umm2.782`, ordered after the
substitution-loop repair `hv-umm2.780` and this installation-binding repair.

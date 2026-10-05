# RD-hv-7x4l.1-10: A required choice with no legal option makes a play illegal, and at resolution only that part of the effect does nothing
- Ladder: 4 (MTG 601.2c: a spell needing targets cannot be cast without legal targets; adapted at resolution so the other parts still happen, which matches step 3, the Rust engine re-validating targets for each effect part in `apply_effect.rs`)
- rules.md: § Targeting → Required choices with no legal option
- Affects: general
- Why: engine-design § The rules-code contract, rule 4, states that a mandatory prompt with zero legal answers is never raised: at play time the action is illegal, and at resolution that effect part does nothing and emits `noLegalTarget`. rules.md was silent on both. Unlike MTG, a card whose only targets have become illegal still resolves (an event still goes to the void), and its other effect parts still apply.

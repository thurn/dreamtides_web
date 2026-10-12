# RD-hv-umm2.231-1: Current energy loss stops at zero and continues the effect

- Ladder: 4 (MTG Comprehensive Rules 608.2c and 609.3: resolve written instructions in order and perform the possible parts of an effect). Adapted to Dreamtides' nonnegative current energy pool. [Official rules, effective September 25, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt).
- rules.md: § The Dreamwell and Energy, maximum/current distinction and current energy loss.
- Affects: b7f8a4ea-c067-47ed-b251-2876b609108c.
- Why: "Lose 1●. Draw a card." describes consecutive effects, with no payment or conditional draw. The loss changes the spendable pool without changing per-turn production. With insufficient energy, the possible loss resolves and the draw follows. The existing resource API reports the actual change and floors current energy at zero. A nonpositive evaluated loss amount produces no gain.
- Earlier ladder steps: D/C/P entries do not settle energy loss at zero. The prototype's generalized debug energy addition is a sandbox edit, not an implemented loss rule. The read-only Rust rules and energy mutations have spend, gain, refresh and maximum-energy costs but no matching current-energy loss effect.
- Contracts: synthetic loss amounts and PlayerRefs, actual effect deltas, ordered loss/draw, resolution-time values, normal refresh, emblem source indices and suspended-step replay in `lose-energy.contracts.ts`.

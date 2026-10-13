# RD-hv-umm2.233-1: Event-copy triggers include copies created in a hand

- Ladder: 5 (simplest literal reading consistent with the affected text).
- rules.md: § Keywords and Effects → Copy; § Infinite Loops → Mandatory Loops.
- Affects: 6dac6bff-af3a-4749-8547-01fded1c81c9, fb7316c9-ef29-42fd-993e-d3337cb06921; interaction with 4cec92f2-9bac-4949-a602-cd0a44618aaf.
- Why: An event is a card type in every zone. Creating an event copy in a hand is a copy occasion, and an additional copy repeats that destination and copy-action Ephemeral flag using the original's copiable values. A separately addressed cost change affects its addressed result only. The Ringleader's created copy therefore receives its own 0● setter; copies made by another ability retain its Ephemeral copy action and original copiable values. A created original can cease before queued abilities resolve, so the copy action retains its tuple and original physical identity. Each additional copy triggers again; D12 preserves intentional recursion and the Mandatory Loops rules govern it.

The recorded prototype implements 18 card rules and no copy-trigger rule
(`legacy-behavior.md`; captured `8b1d9e824` battle-card-effects-table and
basic-automation). The read-only Rust precedent has unchanged generic Copy
wording in `docs/battle_rules/battle_rules.md` but no Copy member in
`TriggerEvent` or `Trigger`; `Copy` and `CopyNextPlayed` enter the
`apply_standard_effect.rs` unmatched `todo!` branch. The identical two
Dreamsign texts are present in its Tabula catalog.

The primary [MTG Comprehensive Rules, effective September 25, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt)
distinguish spells on the stack (112.1, 707.10) from copies of cards outside
it (707.12), and repeated trigger occasions (603.2, 603.2c). That distinction
does not restrict Dreamtides' event card type to the stack. D15 and C6 govern
stack choices, X and paid costs; D12 settles the intentional recursion.

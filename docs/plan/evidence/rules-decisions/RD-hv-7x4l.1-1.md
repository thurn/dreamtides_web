# RD-hv-7x4l.1-1: Playing gives the opponent priority, and a single pass resolves the top item
- Ladder: 1 (D13 stack and priority, the Rust-engine model; corroborated by step 3, `resolve_card.rs`)
- rules.md: § Playing Cards and the Stack → Stack resolution, Priority
- Affects: general
- Why: rules.md stated only who receives priority after a resolution. D13 fixes the whole model: playing or activating passes priority to the opponent, a player responds only to opponent items and cannot hold priority, one pass resolves the top item, and the resolved item's controller then receives priority. The D13 worked example is reproduced with the active player and the opponent in place of "I" and "you".

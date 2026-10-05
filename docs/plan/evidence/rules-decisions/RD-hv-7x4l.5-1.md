# RD-hv-7x4l.5-1: An activated ability on the stack resolves even if its source has left play
- Ladder: 3 (`resolve_card.rs` `resolve_activated_ability` reads the ability from the card definition, not from the character in play), corroborated by 4 (MTG 113.7a: an ability on the stack exists independently of its source)
- rules.md: § Ability Types → Activated abilities
- Affects: general; every activated ability whose source can leave play while the ability waits, such as one answered by removal
- Why: rules.md said that activated abilities use the stack but not what happens when the source leaves play before resolution. The engine captures the ability's origin (card and variant, or the emblem) when it is activated and resolves that ability, so removing the source in response does not counter the ability.

# RD-hv-umm2.627-1: Hand source activation and exact source reveal

- Ladder: 4, adapted MTG analog after current rules/RDs and sibling Rust Cost/can_pay sources supplied no exact hand-source exception.
- rules.md: § Ability Types → Activating a card from your hand; § Costs, Requirements, and X; § Hand; § Changing a card's cost.
- Affects: c97b0a5b-64d0-480f-8db7-3fde93738d86, retained read-only under hv-umm2.191; synthetic public hand-source contracts and LAB workflow.
- Source: [Wizards Comprehensive Rules, June19,2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260619.pdf),113.6j and701.20b/c.
- Why: An ability whose cost reveals its own hand card functions in that hand, and revealing does not move the card. An already known card can be revealed again on a separate activation. Dreamtides chooses and validates costs privately before committing payment, so the source is revealed only on payment. Its physical cost changes persist through ordinary zones. No MTG announcement timing or object reset is imported.

Current distinct-card and stated-order payment rules reserve the revealed source: it cannot be a target or pay a second cost in the same plan. A chosen whole-hand discard before source reveal makes that reveal infeasible; source reveal first reserves it while a later whole-hand discard pays the remainder. Declining an optional discard leaves no such earlier payment. The new source-reveal preparation guard applies this order without changing generic discard-hand behavior. The source must remain in its acting holder's hand; physical ownership may belong to the opponent. "This card" identifies this source, not an abandoned subject.

A hand activation requires exactly one mandatory top-level source-reveal payment. An absent, optional-only, nested-only or repeated mandatory source-reveal shape cannot activate from hand. This preserves the source reveal before its ability is publicly announced; optional costs elsewhere in the payment list retain their rules.

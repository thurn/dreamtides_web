# RD-hv-umm2.236-2: Carried energy and Dreamwell refreshes

- Ladder: 5, simplest reading of carried unspent energy together with the existing ordinary refill rule.
- rules.md: The Dreamwell and Energy → Carrying unspent ●; Maximum ● and current ●.
- Affects: 05f69d01-f8a3-4044-b7cd-0bfd9ed980cd.

The first own-turn refresh supplies normal starting energy once. Each later own-turn refresh adds the current maximum once to the retained pool, including extra turns. A Dreamwell draw increases maximum by its production and sets current to max(previous current + production,new maximum), preserving both an ordinary refill below maximum and retained surplus above it. Duplicate static rules do not multiply either operation. Live applicability after start-of-turn abilities controls the refresh; later gains/losses are not retroactive. Other maximum-energy changes preserve the current pool.

Existing rules define current=max at a turn refresh and current=newmax at every Dreamwell draw. Applying only +production at a standalone draw could turn an ordinary0/5→6/6 refill into1/6. The selected reading retains that refill while conserving surplus. Starting energy has not been carried from an earlier own turn, so the first refresh remains normal; a side that spent before its first turn still receives that normal first refresh. Read-only Rust battle_rules.md has the same ordinary refresh but no carry exception implementation; Tabula's same-UUID conserved-energy text is data rather than an implemented boundary rule. No earlier D/C/P entry or prototype implementation settles these boundaries. These are D10 rulings, not a general claim that beneficial cards must be numerically monotone.

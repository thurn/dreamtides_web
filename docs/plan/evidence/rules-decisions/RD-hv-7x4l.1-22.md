# RD-hv-7x4l.1-22: The turn limit counts rounds, and the Dreamwell draw starts in round 2
- Ladder: 1 (P11 "turn" in the turn limit counts rounds; F1 Dreamwell draws from round 2; F4 turn limit 50; corroborated by step 2, the prototype's `advanceTurnPair` in `src/battle/engine/handoff.ts`, which advances the turn number only after the second player's turn and draws when it exceeds the limit)
- rules.md: § Objective → Rounds and the turn limit; § The Dreamwell and Energy; § Turn Structure → Dreamwell, Battle start
- Affects: general
- Why: rules.md said "If 50 turns pass without a winner", which reads as 50 individual turns (25 per player) and contradicts P11. It also said both players skip the Dreamwell draw "on turn 1", using "turn" for a round. rules.md now defines a round (the first player's turn then the second player's, extra turns excluded), ends the battle in a draw when 50 rounds end without a winner, and says "round" wherever it meant round.

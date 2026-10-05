# RD-hv-7x4l.1-18: "You win the game" is checked by the state-based victory check while the card is in play
- Ladder: 1 (C15 "you win the game" is a state-based win; P5)
- rules.md: § Objective → Victory check
- Affects: 6e2188f8-580e-4a66-a3e3-267d509de903
- Why: C15 checks the condition in the P5 check after every step while the card is in play, and its controller wins; if the opponent reaches the score target in the same check, the battle is a draw. rules.md states this as one rule with the threshold: both players winning in the same check is a draw.

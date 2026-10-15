# RD-hv-umm2.618-1: Completed opening hands resolve before the first turn

- Ladder: D14 supplies FIFO and source order; D39 includes every extra opening
  group. D10 rung 4 adapts settled pregame ordering, and rung 5 settles the
  specific completion, replacement-draw suppression, and prepared-entry cases.
- rules.md: Turn Structure → Completed opening hands; Ability Types → Where
  triggered abilities work.
- Affects: d78864da-eb31-4f25-9d51-94fca7ecf810, retained by hv-umm2.257.
- Why: "After you draw your opening hand" completes the whole opening setup
  before gameplay. Both hands and starting energies settle before conditions
  are evaluated. Each controller's occasion occurs once, starting player first,
  with held source occurrences in their existing order. Zero-card, exhausted,
  and nonmatching extra groups still complete. Replacement draws use ordinary
  movement and Fatigue while individual pre-turn event matching stays
  suppressed; they do not create another completion. Explicit named-trigger
  instructions keep their ordinary semantics. Genuine first-turn abilities
  follow this FIFO and precede Dreamwell. A prepared positive-turn phase entry
  performs its declared phase lifecycle without an opening deal or occasion.

The prototype behavior ledger supplies no implemented opening-completion
reaction. The Rust rules' unchanged five-card opening sentence supplies no
reaction ordering; its ResolveMulligans/SubmitMulligan path is unimplemented,
and its draw/void replacement rules differ. Those sources do not settle this
exception. The existing physical dealing loop is not a precedent for the new
reaction order.

The [official Magic Comprehensive Rules, effective 2026-09-25](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt),
sections 103.6, 103.8 and 101.4e, support the adapted order: settle opening
hands, perform pregame actions starting with the starting player, then begin
the first turn. This analogy supplies neither Dreamtides mulligans nor its
specific trigger suppression. D14 has priority; the bounded simplest reading
settles that suppression and the prepared-phase case. Hair Lock and general
battle-start APIs are outside this ruling.

Implementation uses the existing turn-zero beginning wait and ordinary
resolveTrigger replay. The existing first-turn function performs its normal
counter/history reset and turn announcement after the opening FIFO drains.
The public completion occasion identifies its side only.

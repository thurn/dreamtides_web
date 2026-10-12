# RD-hv-umm2.515-1: identified current deck top and continuous reveal timing

Affected UUID: `28c3ef90-c0dc-4b85-92c8-40758b99e0ce` (base and amplified).

Sections: Playing Cards and the Stack; Naming cards in a zone; Costs.

D10 step 5 separates the conditional reveal from the separately stated
unconditional play permission. Naming or permitting a hidden card grants no
inspection. An identified matching current top can be announced for normal
costs and timing; a learned tracked top remains eligible after the reveal
condition stops, but an unknown next top requires a proper look or reveal.
The reveal threshold is three controlled characters, or two when amplified.

D10 step 4 supplies the timing analog: [Comprehensive Rules effective
2026-09-25](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt),
CR401.5 defers disclosure of a changed top during playing or activation until
that operation completes. Dreamtides emits the causal movement and its queued
triggers before the next-top reveal; every later prompt/decision sees settled
knowledge. Opening setup settles after shuffling and dealing. CR601.3f concerns
face-down exile permissions and supplies no library-inspection permission.

The prototype and the inspected Rust battle-rules document offer no applicable
top-deck play rule. The primitive and synthetic contracts implement these
rulings without authoring this production card; its composition belongs to
hv-umm2.150.

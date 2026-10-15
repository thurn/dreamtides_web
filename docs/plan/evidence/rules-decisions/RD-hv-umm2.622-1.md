# RD-hv-umm2.622-1: First-event hand copies follow the completed global turn

- Ladder: not invoked; certified RD-hv-umm2.678-1 and C3 settle the clause.
- rules.md: § Turn Structure → Settled last-turn meaning; § Keywords and Effects → Copy and Ephemeral.
- Consumer: original hv-umm2.248, Dreamsign `7ec00da2-2b2d-4613-9a2a-8611d38199ca`.

`copyFirstEventLastTurnToHand({ ephemeral: true })` selects the resolving controller's earliest actual event play in the immediately preceding completed global turn. Both actors have independent first-event descriptors in each window. Every actual turn transition, including consecutive or opponent extra turns, rotates the windows before start-of-turn callbacks. Before the first completed turn the preceding window is empty. An Interrupt in the preceding opponent turn can qualify before the controller's first own turn.

The descriptor retains the public ordinary-card Printing and full Variant captured at play, independently of its original's survival or later characteristics. The existing captured hand-copy constructor applies event-copy modifiers, copy observers and C3's created Ephemeral lifecycle. Copies on the stack supply no actual play. Views retain public copiable values while redacting an unidentified physical alias. Sampling shares the current descriptor's occurrence with the first current PlayedCard and reserves separate absent previous-turn aliases before hidden dealing.

Absent legacy provenance and a null whole window mean unknown; a null actor entry means a known absence of qualifying play. Required unknown provenance is refused by saved import and verified checkpoint guards. Verified checkpoint loading uses preserved genesis and events for recovery; unrelated legacy snapshots retain their compatibility. New complete actual turn windows establish known provenance. This implementation records conformance to the certified ruling; original content authoring, C3 card-issue filing and complete consumer acceptance remain with hv-umm2.248.

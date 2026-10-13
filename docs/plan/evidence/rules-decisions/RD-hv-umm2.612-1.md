# RD-hv-umm2.612-1: A play-trigger Reclaim grant follows the played physical card

- Ladder: 5, the simplest reading consistent with the play-trigger text and the settled physical-identity rules.
- rules.md: Keywords and Effects → Reclaim; Zone Changes; Ability Types → Trigger timing and order.
- Affects: `2cbcbebb-fb79-4833-a770-2216873147c4` (original authoring and complete acceptance belong to `hv-umm2.254`).
- Outcome: A play trigger granting its played card Reclaim names that physical card wherever it exists when the trigger resolves. The gain applies on the stack and survives ordinary zone changes. An earlier trigger moving the card into a hand, deck, void, or Banished zone preserves the subject. A ceased card gains nothing. Reclaim is usable only from the card owner's void.

The normative Zone Changes rule preserves physical identity and properties across zones. The Reclaim rules already settle permanent unstated duration, latest explicit granted replacement costs, additional costs, and the owner's void as the play route. D14 supplies trigger resolution before priority passes. The ladder addresses only the unresolved play-trigger reference after earlier movement, rather than reopening those settled rules.

No D-, C-, or P-entry supplies this particular retention rule. The current prototype has no corresponding implemented play-trigger grant. Read-only Rust inspection finds the `GainsReclaim` enum and parser/serializer, but no mutation implementing it, consistent with RD-hv-umm2.494-1's inspected precedent. There is therefore no earlier ladder behavior settling this reference. Step 5 reads “it” as the played physical card, consistent with Dreamtides' identity-preserving zone changes; no external Magic analogy is needed.

The discard-trigger rule in RD-hv-umm2.494-1 names its discarded card only while it is in a void. That settled rule and the existing `grantReclaim` void-only API remain separate. The new public `grantTriggeringCardReclaim(triggeringCard(), costs)` form implements the play-trigger instruction using existing physical subject resolution and permanent floating keyword changes, with existing UUID event logging, replacement costs and view redaction.

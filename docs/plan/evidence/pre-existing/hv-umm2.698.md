# Pre-existing observations for hv-umm2.698

At source8eb2e0d1e5d27737375e9b6cf619be49c5b5dffd, saved isCardStatus validates the ordinary resource/status fields but does not validate playedViaReclaim. hasConsistentZones checks zone/reference consistency but does not enforce all nonhand owner/controller relationships; the ordinary invariant checker does. These are bounded source observations, not executed exploit proofs. Both unrelated validator behaviors are preserved by this bead; its new fields receive their own exact validation.

The same base's commitCardPlay writes playedViaReclaim after moveToStack,
whose handEmptied announcement matches triggers synchronously. The current
integration's executable both-actor Reclaim→legal return→last-hand replay
witness reads that prior method during admission: normal replay scores2
instead of3, and a card-alternative replay scores0 instead of1. The legal
return uses the existing reclaimNotBanished static keeper. These executions
are qualified to the current integration source; the base ordering is a
bounded source observation. This bead's method-pair contract records both
latest methods together after payment and before stack announcements, while
the reclaimed replacement status keeps its separate zone protocol.

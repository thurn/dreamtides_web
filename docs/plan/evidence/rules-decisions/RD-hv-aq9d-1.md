# RD-hv-aq9d-1: An opposing resolving payment suppresses its unpaid effect

- Ladder: 5 (the simplest reading of "draw a card unless the opponent pays 1●", consistent with resolving payments and the existing public opposing payment in Prevent)
- rules.md: § Costs, Requirements, and X → Opposing resolving payments; § Keywords and Effects → Prevent; RD-hv-7x4l.6-3 → positive character challenge scoring
- Affects: Avatar 9e4862fd-e18c-463e-9d5f-e5d73c29a66f
- Why: The opponent of the ability's controller chooses during resolution. Paying the whole fixed amount stops the effect and spends only that payer's energy. Decline or unavailable energy runs the unpaid effect with its original source and controller. Its choices are deferred to that branch. The trigger's first positive scoring match consumes the once-per-turn use before payment, so either answer retains that use until the ordinary turn reset.

Clause audit: `triggered(whenOpponentScores(), unlessPays(1, draw(1)), { oncePerTurn: true })` matches a positive `laneResolved` award by the opposing active side. Flat point gains, Fatigue and zero scoring awards do not match. The existing first-match trigger protocol consumes the once-per-turn use. The opposing payer's accepted payment skips the source controller's single draw; decline and insufficient energy draw for that original controller. The Avatar has one printed form, with no amplified text. The existing printed fields and tide pool are immutable.

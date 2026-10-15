# RD-hv-umm2.728-1: Replace the purchased shop vacancy once

- Ladder: 5 for the vacancy/source rule; 2 for committing the existing Dreamsign draw's returned remainder.
- rules.md: § Journey Shop Effects, purchased-position replacement and offer revisions.
- Affects: 883f88fb-ac50-419a-8382-c22edee29755; its catalog authoring, registration and full P8 acceptance remain hv-umm2.273.
- Why: Native hv-umm2.728 adopts one replacement of the item just bought. One vacancy is shared by redundant sources; physical post-domain held order attributes its first applicable source. This includes gaining the source with this purchase and excludes a source removed by it. Replacement stock is an offer, not a purchase, acquisition or Restock. Empty eligible supply records a successful purchase with unavailable stock; missing required content and provider exceptions are atomic transaction errors.

The actual reducer commits a domain purchase speculatively before its modifier
registry freezes post-domain physical sources. Acquisition preparation and card
observers precede ordinary held hooks. The new shop hook uses that existing
order and global random-draw cursor; it does not rediscover holdings or restart
randomness. The single receipt records its accepted expected offer and one
replacement outcome. Its presence persists after source loss and Restock.

The offer identity is the pair of successful purchase count and successful
Restock count, together with site and position. Purchase count distinguishes a
repeated UUID offered at the same position; Restock count distinguishes a fresh
shelf without another purchase. Same-actor CAS permits self-chain intents, so
revision validation is required before price/form randomness. A source-gaining
purchase also requires the revision. Absent revision remains compatible only
with a visit with no recorded replacement and no post-purchase replacement
source. Supplied revisions require the exact active site. This is an explicit
bounded persisted-input contract, with captured pending overlay data and no
uncommitted purchase on cancel/reload.

Counterevidence: docs/design.md's Tides and the draft pool paragraph says a
Dreamsign is spent when offered and never offered twice in a run. The preceding
renewable-pool sentence concerns cards. Actual current drawDreamsignOptions
rebuilds its working UUID pool from the supplied fixed regeneration pool, and
current site providers supply it. RD-hv-umm2.598-1 explicitly preserves that
regeneration-based standard provider baseline. D10 step 2 therefore governs
this bounded result-commit operation: stock generation retains exactly the
producer's returned unoffered remainder, including after regeneration. Its
choice, eligibility and rebuilding algorithm and fixed pool remain the current
runtime contract. This ruling does not use the design sentence as evidence for
renewable Dreamsign supply or adopt a different global pool policy.

The generator's consumer assigns the authoritative returned remainder. Public
synthetic contracts cover exhausted input, regenerated output and continued
draws; per-purchase contracts additionally establish repeated refill supply,
exact payment, source attribution, refusal, rollback and replay.

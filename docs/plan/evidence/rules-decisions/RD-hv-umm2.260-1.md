# RD-hv-umm2.260-1: Additional site enhancements and Exploration rerolls

- Ladder: 5 (simplest reading consistent with the printed clauses and current journey design)
- rules.md: § Journey Site Effects
- Affects: 58472ad2-88b1-4dc7-a161-c6dea7d8c43d, 3c0ced1a-7a2a-4f18-9ab4-5d6055d1dc59
- Why: The Dreamsigns' printed clauses specify an additional enhancement in each dreamscape and an optional reroll of dream journey sites. Current design distinguishes ordinary generation defaults from guide-site enhanced behavior. Existing journey registry timing applies held copies after validated gameplay changes, including gains, and excludes administrative edits.

Rainbow Mushroom applies in the current dreamscape, including starter and
final nodes with an eligible unopened guide site. Battle, Draft, Essence, and
Reward have no guide enhancement. Already enhanced and visited/opened sites
are ineligible. One held copy consumes one distinct enhancement entitlement;
per-node source UUID provenance preserves historical grants through loss,
reacquisition, site replacement, and held-order changes. New copies raise the
maximum grant count. Existing enhanced sites consume no entitlement.

Curled Tail applies to unresolved Exploration, including Random Site
materialization. The phrase refers to a particular narrative site: the older
Rust quest design (`~/dreamtides/docs/plans/quests/quests.md` § Dream Journey)
describes narrative choices with deck/quest consequences, while current
Exploration offers catalog-authored narrative choices. Relating those terms is
a semantic inference. Commit `da3de9d69` directly renames TemporalFork to
Exploration; it does not establish a direct Dream Journey rename. Each held
copy supplies one site-local use; consumed uses persist through loss,
reacquisition, and reload. A successful use redraws to a different usable
encounter and rebuilds its prepared choices atomically. "Usable" means catalog-valid
and fully prepared under the ordinary site-opening contract; existing costs and
current action prerequisites determine which choices are available. It preserves the site,
graph, deck, and essence. Missing alternatives consume nothing.

D10 steps 1–2 supplied the current design/timing constraints but no implemented
clause-specific precedent: a bounded history search found no implementation in
journey rules, atlas, session, or state. Authorized read-only step 3 searched the
two exact UUIDs and printed clauses, then the matched quest state/view files
and quest/battle-rule text in `~/dreamtides`. No exact clause or implemented
reroll/enhancement rule was found. The old enhanced-site list differs from the
current design, so it cannot establish an unchanged ruling. Step 4 has no
applicable Magic analog for this procedural journey operation. Step 5 settles
the outcome above. Parent acceptance and Areas admission preceded writes.

Validation uses synthetic public journey contracts and real provider/site workflows. Both scoped UUIDs are journey-only: the actual battle FuzzPool rejects empty battle abilities and card-lab preflight handles cards/Dreamwell rather than Dreamsigns. Parent explicitly dispositions recipe steps6–7 as inapplicable; P8 synthetic contracts and the original two UUID judged site workflows supply the required coverage. Final QA passes all nine enhanced guide types and three Exploration reroll modes on desktop/mobile; ordinary action costs and prerequisites remain part of the prepared encounter contract.

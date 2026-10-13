# Journey capability audit — hv-umm2. 604

Evidence-only audit. Source base `03efe7bf5495a7600910aae76b8cd463b2b232b4`; own worktree only. Native authority is the frozen claim plus original Entities/Filed entity UUIDs/Areas/acceptance, with the complete admitted and intended unfinished snapshots and parent-refreshed 241/246/274/275 top-level notes/dependencies. External scratch artifacts are supporting research, not scope authority. Repository writes are limited to this audit, its friction record, and its measurements. Native graph, production source, tests, catalogs and plan pages are read-only; no browser/runtime work or foreign worktree access. Sage and executor conventions read. The parent’s 04: 23: 33 UTC sample is a pre-tool-dispatch proxy; actual model start is unknown.

## Native scope and exhaustive method

1. Deduplicate unfinished admitted/intended rows by native ID, then extract only each original description’s Entities or Filed entity UUIDs clause; never collect unrelated UUID mentions or candidate positional keys. Reconcile current journey snapshot against the full unfinished snapshots and original 270 record. This adds 270 and 275 that the narrow journey snapshot omits.
2. Match Exploration action IDs from actual `EXPLORATION.encounters[].action[]` in `src/content/exploration.ts` to native UUID ownership. Join Dreamsign modules by the exact declared UUID, and forms by `glossaryUuid` in `src/content/transfiguration.ts`. No name equality or name keys.
3. Partition all 1, 042 authored actions across the closed 65-kind discriminant from `src/data/exploration-effect-kinds.ts`. Native pending cohorts contain 440 distinct actions, in 12 kinds; each of the 440 maps exactly once to mods 280–288. All 53 other kinds remain in the exhaustive table as context, with zero pending UUIDs in this assignment, rather than invented execution scope.
4. Current authoritative scope equals 483 distinct UUIDs: 440 actions + 34 Dreamsigns + 9 forms. Candidate 483 reconciles only after 270/275 original scopes are restored, not by granting its keys authority. Current journey-only snapshot yields 480 (440+33+7). Native/scenario/acceptance records remain original. `uuid-scope.json` retains every native membership; `source-input-manifest.json` retains SHA 256 for frozen inputs and exact inspected source. The appendix embeds compact UUID lists grouped by native ID.

| Native cohort | UUIDs | Behavior/native proof ownership |
|---|---:|---|
| hv-umm2.261 | 3 | Event transfigure-copy, two-card site count, post-battle random window |
| hv-umm2.263 | 3 | post-battle Dreamsign choice; on-gain random half-deck transform and held-sign copy |
| hv-umm2.264 | 3 | Nightmare admission protection; acquired Warrior spark and deck-size random transform |
| hv-umm2.266 | 3 | site-local first free restock, additional shop slots, Bazaar card transform |
| hv-umm2.267 | 3 | live additional draft choice counts; targeted Reward/Revelation enhancement (598 prerequisite) |
| hv-umm2.268 | 3 | post-battle duplication; first shop-card copy; four duplication-site copies |
| hv-umm2.269 | 1 | on-gain chosen Event entry guaranteed opening hand |
| hv-umm2.270 | 1 | C12 stored selector/condition and eligible-figment type remap, including later additions |
| hv-umm2.271 | 4 | purge prohibition+draft count; on-gain subtype choice; acquired Character chance transform; first Event draft transform |
| hv-umm2.272 | 4 | battle-event Essence payout bridge for two UUIDs; on-gain starter purge and Perfected transform |
| hv-umm2.273 | 4 | pre-battle purge minimum; immediate bought-slot restock; first Bazaar discount+transform; additional transfiguration |
| hv-umm2.274 | 2 | fewer draft choices+Dawn battle energy; on-gain Nightmares+battle anthem |
| hv-umm2.275 | 2 | Attuned activated-cost modifier and Perfected composition |
| hv-umm2.276 | 6 | Empowered, Amplified, Kindled, Inspired, Enduring, Hastened transforms |
| hv-umm2.277 | 1 | Resonant transform |
| hv-umm2.278 | 0 | no UUID transfer: final stratified transfiguration sweep |
| hv-umm2.279 | 0 | no UUID transfer: exhaustive engine mapping, card-lab mods, random fuzz variants |
| hv-umm2.280 | 111 | spark bonus (62 increase-all+49 purge-subtype) |
| hv-umm2.281 | 42 | cost reduction+Nightmares |
| hv-umm2.282 | 34 | Fast (33 all+1 predicate/Nightmares) |
| hv-umm2.283 | 58 | purge duplicates+granted/overridden Reclaim |
| hv-umm2.284 | 32 | subtype (18 selected+14 all) |
| hv-umm2.285 | 1 | Event-to-Character card type |
| hv-umm2.286 | 67 | next-battle extra opening hand |
| hv-umm2.287 | 66 | next-battle starting energy |
| hv-umm2.288 | 29 | next-battle smaller hand+cost discount |

## Actual source semantics and evidence

**Supported foundational behavior, with existing observable contracts/delivery evidence:**

- UUID registry: `modifier-registry.ts:78 createJourneyModifierRegistry`, held snapshot loop: 99–118, production registrations: 124–133. It iterates post-domain holdings once per held copy in stored order, each hook sees earlier results; acquired copies participate immediately, lost/replaced copies do not. Synthetic contracts `modifier-registry.test.ts:210,230,250,270,348,380` cover order, invalid/CAS events, containment, replay, admin exclusion, gain/loss. Native 259 completed; subsequent 320 disposition recorded in 259 notes. Eight production registered UUIDs are Star Badge, Pearl Shell, Banded Worm, Rainbow Mushroom, Curled Tail, Fruit, Slug, Sickle, identified in actual imports, never as content keys.
- Normal event fold: `session/actions.ts:393 makeActions` uses typed `EventPayloads`; `reducer.ts:87 reduceGameEvent` validates CAS/prompt then routes; `finishTransition:121` calls hooks only on applied gameplay changes that changed `journey`; admin writes are exact. `register-game-providers.ts:51–64` installs actual site and battle providers. Direct admin setters in `deck.ts:364–454` are lower-level pure mutators, not a normal player hook activation path. An action constructor/descriptor/type alone is not behavioral proof.
- Essence quote semantics: `journey-essence.ts:6 essenceSiteGain`, first-source replacements: 18/32, per-copy hooks: 43. Site base quotes are immutable; collection multiplier uses live holding; prepared Pearl reward survives source loss; Sickle permission is fixed with initial quote. `sites.ts:371 prepareEssenceReplacement`, `openSite:389`, `acceptEssence:658`, `acceptReward:599`; synthetic tests `journey-essence.test.ts:72,85,140,152,196,224,242`, `journey-purge.test.ts:140,209,249`. Native 262/265 completed; newer 601 native browser acceptance remains peer-owned.
- Earned Slug choices: `journey-purge.ts:67 journeyPurge` appends each held source to folded after-battle `sources` with exact terminal route, including victory/final/defeat/draw. `resolveJourneyPurge:102` checks source UUID/held slot/ordinal/site, distinct current entry targets, consumes one permission and restores route. `validJourneyPurgeScreen:21` supports lost-source reload and validates purpose. Contracts `journey-purge.test.ts:155,209,249,259–307`; this is a queue for purge-only purposes. It does not prove composition with pending transfigure/duplicate/sign-choice windows.
- Semantic purge receipts: `site-provider.ts:1007–1015` resolves the actual action then `journey-purge-receipts.ts:7–73` classifies all 65 kinds through `Record<ExplorationEffectKind, boolean>`, preserving original paired CardId/DeckEntryId. Compound authored purge yields receipts; replacement without purge, Nightmare expiry, debug deck removal and Dreamsign replacement do not. `journeyPurgeCase` in `reducer.ts:623` forwards validated receipts; Fruit in `journey-essence.ts:62` pays by occurrence, not a deck size delta. `journey-purge-receipts.test.ts` and `journey-purge.test.ts:82,98,107` pin public outcomes. Native 600 follow-up is source-qualified; 601 adds actual 3-site browser proof. No competing repair.
- Site enhancements/rerolls: `journey-sites.ts:20,25,38,113` preserves earned entitlements and used counts across loss/reacquisition, excludes visited/open/already-enhanced sites, deterministic canonical UUID selection, source-specific rerolls and stale encounter comparison. Tests `journey-sites.test.ts:87,100,112,126,175,192,205,218`; native 260 completed. Rosemary’s targeted static projection and 598 enhanced Reward choices are separate planned work; current random enhancement descriptor cannot by itself implement Rosemary.
- Deck mechanics lower seam: `reward-effects.ts:291 applyEffect` validates UUID+entry before atomic composite application: transform: 332, full variant copy: 344, keywords: 363, type: 379, spark: 391, cost: 403. `deck.ts:240 duplicateDeckEntry` also preserves full variant. Actual duplication-site consumer `sites.ts:862` creates one plain copy, while pending 268 requires four and post-battle/first-shop semantics. This distinction prevents declaring 268 supported merely because duplicate exists.
- Engine actual modifiers: `engine-battle-init.ts:118 engineDeckEntry`, `deckModsOf:141`, `nextBattleEffects:172`; `engine/state/create.ts:57–90` applies all-deck discount and hand-size delta; `begin-battle.ts:28/51/63` consumes extra filtered/ordinary opening draws and starting current+max energy. `engine/catalog.ts:185 instanceCard`/`modifiedCard:194` consumes type, energy reduction, Fast for standard speed, replaces every printed Reclaim in place or appends, then spark; Event→Character gives zero when printed spark is null. Observable synthetic `battle-init-provider.test.ts:203–269,320–356` proves these actual consumers. Variant carry-only assertion: 358 is explicitly not a transform proof.

**Planned runtime work (reuse canonical IDs), not distinct new APIs:**

- `hv-umm2.261` owns journey transfiguration hooks and repeated site selection.
- `hv-umm2.263` owns on-gain transitions.
- `hv-umm2.264` owns new-entry admission and acquisition hooks.
- `hv-umm2.266` owns shop source and local purchase projections.
- `hv-umm2.267` owns draft counts and Rosemary projection.
- `hv-umm2.268` owns copy hooks.
- `hv-umm2.269` owns a guaranteed chosen Event entry. Current `OpeningHandDraw` supports filters and extra draws; it does not identify a specific physical original entry.
- `hv-umm2.270` owns C12 persistent AST selector and figment remapping. Beads 271–274 own the remaining compositions. All 34 scoped Dreamsign source modules are currently pending at this base; shared 274/241/246 leaves use the native journey-first D36 status order; lower primitives and successful unrelated foundation QA do not clear them. Native 272 expressly says its two battle-trigger Essence UUIDs build the battle-result hook, so its missing current bridge is already planned.

- `hv-umm2.275`–`hv-umm2.277` own actual engine transfiguration transforms. Display/stat helper `transfiguration-logic.ts:273 eligibleTransfigurations/306 applyTransfigurationToCard` and actual seeded prepared offers already exist; `assignTransfiguration`’s ambient random helper is not proof of a production consumer. The actual engine catalog `engine/content-catalog.ts:57` takes printed fields and authored AbilityList unchanged; `engine/catalog.ts:185` currently applies deckMods directly. Engine variant storage/hash/clone and Amplified boolean alone do not implement Empowered/Kindled/Inspired/Enduring/Hastened/Resonant/Attuned/Perfected. The transform seams are canonical 275–277 scope, with D39 transfiguration-before-modifier ordering and eligibility/text agreement still to prove.

- `hv-umm2.279`’s exhaustive engine-field mapping is a different contract from 600’s exhaustive purge classification. The provider’s resolver has pre-split branches and a non-exhaustive final switch; mere coverage of today’s 65 mechanics does not make new modifiers compile-fail into a mapping. Reuse279; no duplicate mapping task. 280–288 own synthetic stacked-transform contracts, D10/RD decisions, both-side samples, judgments and real encounter→battle QA for their exact 440 UUIDs.

**Unresolved semantics / proof limitations:**

- Glow Pouch UUID34ce9428-dda 9-4 efa-bacd-5ec2698561c1 (“additional random transfiguration”) versus `docs/design.md:211` one form per card, `types/journey.ts:124` single nullable form and `reward-effects.ts:332` assignment. `engine/Variant.transfigurations` array does not solve journey persistence, display, eligibility, repeat chaining or hook recursion. 273 must settle the D10 ladder, then the implementation owner can decide whether a representational prerequisite is distinct. Do not invent multi-form storage or waive printed text.
- Multiple after-battle purposes (Slug plus Green Slime261, Spider268, Red Cheese263), on-gain prompts from an after-battle gain, and pre-battle Scorpion must compose source order and retain every terminal route. Current purge-only queue proves one purpose. Existing generic screen/site runtime/data flow cannot justify overwriting its queue. Canonical 261/263/268 need a source-backed proposal for their persisted continuation contract before future body admission; this audit does not admit a new API; source loss should not cancel earned rights and acquisition should not retroactively earn old rights. Do not issue new blocking edges just to read these consumers.
- Acquisition/transform/permanent purge protection need typed domain occurrences, not generic deck diff. Replacement, full-variant copy, plain site copy, temporary expiration and actual purge differ. 264’s Nightmare guard must cover real acquisition producers, 271’s Tortoise guard must prevent actual authored purge before cost/continuation effects, 261’s Spell Tome must act on actual transform receipts and avoid unintended repeated hooks. Current registry exposes purges, while acquisition/transform receipts and event context remain contingent future seam proposals within canonical scopes. Their future exact body admission must verify deterministic random source and replay requirements; this audit admits no new production API.
- Battle Essence hooks in 272 need current challenge context/controller/event subject and success occurrences. The registry skips BATTLE_ACTION when journey is unchanged; presentation-only `observeEngineFolds`/`batchStates` in `engine-battle.ts:50–145` are absent on replay. A correct bridge must use authoritative fold results, not presentation, polling/log text or END_BATTLE deck differences. 272 is canonical; review/full event matchers stay in 603’s audit ownership.

## Exhaustive kind/cohort table

`P` means lower-level producer/consumer exists, with canonical real-content proof pending. `C` means a current producer branch exists outside this native 440 UUID cohort; no fresh behavioral verification claimed for that kind. Every row’s body pointer is to `src/session/providers/exploration-provider.ts` unless labeled helper. Count columns are total catalog actions / native pending UUIDs. Common target mutation seam is `applyJourneyRewardEffect` above; current quote/provenance/stale guards live in resolver 1791–1885. The split branches validate frozen plans against current identities and signatures before atomic mutation. All 65 kinds are accounted for.

| Effect kind | Total / pending | Classification / canonical | Actual resolver body |
|---|---:|---|---|
| `purge-and-copy` | 37 / 0 | C; outside native cohort | 3709 |
| `purge-one-transfigure-and-copy-others` | 1 / 0 | C; outside native cohort | 1926 compound dispatch +2290 purge-transfigure-copy; helper264 |
| `gain-dreamsign` | 18 / 0 | C; outside native cohort | 3258,3265,3770 |
| `gain-nightmare-and-dreamsign` | 1 / 0 | C; outside native cohort | 3239,3333 |
| `gain-nightmare-and-offered-dreamsign` | 1 / 0 | C; outside native cohort | 3242,3321 |
| `gain-card` | 4 / 0 | C; outside native cohort | 3811 |
| `transfigure-selected` | 30 / 0 | C; outside native cohort | 2822,2860,3833 |
| `transfigure-random-cards` | 1 / 0 | C; outside native cohort | 2799 multi-card transfiguration; helper221 |
| `transfigure-fixed-random-cards` | 1 / 0 | C; outside native cohort | 2799 multi-card transfiguration; helper221 |
| `purge-selected` | 17 / 0 | C; outside native cohort | 3873 |
| `purge-starter-card` | 1 / 0 | C; outside native cohort | 3097,3102,3107 |
| `purge-random-starter-card` | 1 / 0 | C; outside native cohort | 3098,3103 |
| `purge-random-starter-and-gain-card` | 1 / 0 | C; outside native cohort | 3156 |
| `replace-all-starter-cards` | 1 / 0 | C; outside native cohort | 3157 |
| `transfigure-random-starter-cards` | 1 / 0 | C; outside native cohort | 2986 starter-card dispatch; helper212 |
| `transfigure-all-starter-cards` | 1 / 0 | C; outside native cohort | 2986 starter-card dispatch; helper212 |
| `transfigure-all-cards` | 1 / 0 | C; outside native cohort | 1926 compound dispatch +2003 all-card transform; helper264 |
| `choose-pack` | 25 / 0 | C; outside native cohort | 3924 |
| `draft-card` | 120 / 0 | C; outside native cohort | 3932 |
| `purge-for-essence` | 56 / 0 | C; outside native cohort | 4176 |
| `change-subtype-selected` | 18 / 18 | P; hv-umm2.284 | 4207 |
| `change-card-type-selected` | 1 / 1 | P; hv-umm2.285 | 2500,4247 |
| `change-subtype-all` | 14 / 14 | P; hv-umm2.284 | 4298 |
| `take-cards` | 30 / 0 | C; outside native cohort | 4326 |
| `take-transfigured-cards-and-gain-nightmares` | 1 / 0 | C; outside native cohort | 1926 compound dispatch +2201; helper264 |
| `replace-selected-with-card` | 1 / 0 | C; outside native cohort | 4339 |
| `replace-random-with-card` | 1 / 0 | C; outside native cohort | 2706 |
| `replace-selected` | 19 / 0 | C; outside native cohort | 4388 |
| `gain-nightmare-and-card` | 1 / 0 | C; outside native cohort | 4414 |
| `gain-random-cards` | 12 / 0 | C; outside native cohort | 4423 |
| `transfigure-fixed-selected` | 5 / 0 | C; outside native cohort | 2823,2891,4442 |
| `gain-offered-card` | 3 / 0 | C; outside native cohort | 3816 |
| `transfigure-all-for-essence` | 10 / 0 | C; outside native cohort | 3446 |
| `purge-disclosed-and-transfigure-same-type` | 1 / 0 | C; outside native cohort | 1926 compound dispatch +2040; helper264 |
| `transfigure-next-draft-or-shop` | 12 / 0 | C; outside native cohort | 4486,4488 |
| `gain-essence-per-card` | 20 / 0 | C; outside native cohort | 4562 |
| `increase-spark-all` | 62 / 62 | P; hv-umm2.280 | 4586 |
| `gain-essence` | 1 / 0 | C; outside native cohort | 3363 |
| `gain-random-essence` | 1 / 0 | C; outside native cohort | 3390 |
| `double-essence` | 1 / 0 | C; outside native cohort | 3422 |
| `purge-random-subtype-and-increase-spark` | 49 / 49 | P; hv-umm2.280 | 4611 |
| `gain-random-dreamsign` | 10 / 0 | C; outside native cohort | 3790 |
| `purge-dreamsign-for-essence` | 1 / 0 | C; outside native cohort | 4147 |
| `gain-offered-dreamsign` | 1 / 0 | C; outside native cohort | 3241,3320 |
| `replace-selected-dreamsign-with-offered` | 1 / 0 | C; outside native cohort | 3243,3322 |
| `replace-all-dreamsigns-random` | 1 / 0 | C; outside native cohort | 3236 dreamsign dispatch +3298 plan mutation; helper149 |
| `purge-selected-dreamsign-and-gain-random` | 1 / 0 | C; outside native cohort | 3340 |
| `make-fast-all` | 33 / 33 | P; hv-umm2.282 | 4683 |
| `make-predicate-fast-and-gain-nightmares` | 1 / 1 | P; hv-umm2.282 | 1926 compound dispatch +2119; helper264 |
| `reduce-cost-all-and-gain-nightmares` | 42 / 42 | P; hv-umm2.281 | 4704 |
| `copy-selected-card` | 7 / 0 | C; outside native cohort | 3499 |
| `copy-selected-cards` | 5 / 0 | C; outside native cohort | 3522 |
| `copy-random-cards` | 1 / 0 | C; outside native cohort | 2610,2674 |
| `copy-offered-deck-card` | 46 / 0 | C; outside native cohort | 3539 |
| `next-battle-opening-hand` | 67 / 67 | P; hv-umm2.286 | 3554 |
| `next-battle-starting-energy` | 66 / 66 | P; hv-umm2.287 | 3579 |
| `next-battle-smaller-hand-and-cost-discount` | 29 / 29 | P; hv-umm2.288 | 3601 |
| `choose-avatar` | 4 / 0 | C; outside native cohort | 3623 |
| `purge-duplicates-and-grant-reclaim` | 58 / 58 | P; hv-umm2.283 | 3647 |
| `transfigured-card-draft` | 45 / 0 | C; outside native cohort | 3948 |
| `add-fixed-site` | 5 / 0 | C; outside native cohort | 3990 |
| `choose-site-type` | 1 / 0 | C; outside native cohort | 4055 |
| `add-site` | 33 / 0 | C; outside native cohort | 3983,3996,4063,4079 |
| `free-next-shop` | 1 / 0 | C; outside native cohort | 4499,4507 |
| `lose-half-essence-and-free-purchases` | 1 / 0 | C; outside native cohort | 4524 |

## Native proposals and safe boundaries

No distinct unowned missing primitive is established. Current 274→241/246 journey-first serialization is already filed and preserved after reading the fresh native records; no reverse edge is proposed. Ranking truly distinct missing causes therefore has zero entries; pending native downstream bead count is not an independent workload claim. Highest cohort workload is existing spark 111, opening 67, energy 66, Reclaim 58, cost 42, Fast 34, subtype 32, smaller-hand 29, card-type 1; none needs a duplicated API bead. Existing transform native work affects 9 form UUIDs, not every card waiting for the proof. Native drift/canonical ownership accounted for, no parent filing requested.

Exact proposals for parent 606 integration review; this audit requests no native graph mutations and admits no production API:

1. **Keep current runtime and body prerequisites.** Preserve 263/264/266 after 261, 268 after 266, 269 after 263, and 270 after 263/264. Preserve composition prerequisites already filed. Keep 267 after 598 for enhanced Reward behavior. The current 261/263/266/268 dependencies on 598 also order potential terminal/reward/purchase bodies until a fresh exact write-boundary audit proves a narrower scope safe. Active 598/601/453 and their edges stay with their owners. Preserve 573 and all final joins; 606/605 own any authorized implementation/final-acceptance split.
2. **Use independently bounded future modules.** A hook can own a dedicated pure module, catalog descriptor and synthetic public contracts. Registry imports and list entries are additive. Shop count/free-restock quote projection (266), on-gain one-shots (263), and draft count projection (267) may proceed independently when their admitted provider/reducer bodies are distinct. Original full acceptance remains required before closure. Directory-wide Areas alone do not prove independence.
3. **Serialize actual shared bodies after fresh admission.** If 261’s eventual scope includes a common earned-choice continuation or occurrence/context body in `types/journey.ts`, the registry or reducer `finishTransition`, keep 263 and 268 after that exact body. Dedicated 263/264 modules can be parallel only when neither edits the shared continuation/receipt body; otherwise order 264 after 263 for that specific overlap. Preserve 268 after 266 for `buyShopSlot`/purchase-history semantics, 271 after 267 for draft count resolution, and 273 after 266 for first-Bazaar price/transfiguration and bought-slot restock. Preserve existing 556/560/581 ordering for 270’s AST/matcher/value bodies. Imports, own tests and read-only consumers do not require serialization.
4. **Reuse existing causes.** No added runtime edge is proposed. Glow Pouch’s interpretation is an unresolved D10 clause already assigned to 273. The battle-result Essence hook is already assigned to 272. A future bounded preparatory 272 bridge split would retain its two exact UUIDs and all final checks; 272 would depend on that child, whose prerequisites would be only freshly verified overlapping fold/matcher body owners. Such a split needs the parent’s complete duplicate/Areas/graph admission. Later transform/modifier final-join restructuring belongs to 605/606.
5. **Preserve the current journey-first hybrid order.** `hv-umm2.241` depends on `hv-umm2.274` for `mushroom-caps-6b95d6bd.ts`; `hv-umm2.246` depends on `hv-umm2.274` for `twisted-herbs-1cd25b9a.ts`. Fresh top-level native records show the existing justiciar repair and both dependents open/unassigned. Historical “Serialized after 241/246” notes are qualified by the current edges. D36 and mutually exclusive `ContentStatus` (`define.ts:27–39`) prohibit pending plus battle abilities. Journey 274 supplies descriptors and UUID registration while those leaves retain pending, zero battle abilities and no verifiedText. Battle 241/246 then supply their clauses and whole printed verification after 274. Adding either reverse edge would cycle. No graph change is proposed.
6. **Keep all final checks.** All 34 journey UUIDs retain ledger coverage, synthetic hook contracts, affected-site browser QA and scoped judgment/sweep; mixed clauses clear pending and acquire whole verifiedText under the existing joint status order. The nine forms retain transform/text eligibility agreement, random-transfiguration fuzz coverage and 278’s sample of at least 20 eligible cards for each of eight non-Amplified forms, every Resonant-eligible card, and three judgments per form. Foundation 279 retains exhaustive TypeScript mapping, card-lab mods and fuzz variants. Modification 280–288 retain at least 20 eligible cards per kind as both player and enemy, one judgment per kind, and native encounter-to-battle QA for each next-battle effect. Gate 46 retains pending/coverage/mason/review/QA/fuzz joins; AI implementation/tuning remains last. D10/RD, D19 stable synthetic tests and D17 resources remain binding. Required reviews use temporary read-only `gpt-5.6-sol` routing until its deadline, then ordinary routing.

## Disposition and verification boundary

Parent authorized the exact three evidence files through native comment `01a1338d-1b58-7b2b-acf8-b886b4fbca2f`, acknowledged at 2026-10-13T04:37:28.063786Z. The parent owns native filing, graph edits, review and delivery. The disposition is to reuse existing canonical work and preserve current edges, including journey 274 before battle 241/246; no distinct unowned missing cause is established and no new bead or edge is proposed.

The fresh prefiling freeze, observed at 2026-10-13T04:35:35.462081+00:00, contains 132 admitted plus 21 intended rows, deduplicating to 132 native IDs. Original 134 plus 23 rows deduplicate to 134. The two dropped unfinished records, 602 and 33id. 13, are outside this assignment’s capability UUIDs. No new row appears. All 26 assigned native scope records keep their exact 483 UUID membership and remain open/unassigned. Active 453/598/601 retain their current owners. Exact descriptions, acceptance and frozen input hashes are retained in the measurement file.

Validation is evidence completeness, source/input hash and pointer consistency, record schema, `npm run review`, `npm run knip`, and exact allowed-path/diff checks. No fresh runtime verification is claimed for this source audit. Existing observable contracts and delivered native evidence support the qualified foundational findings above; current pending clauses retain their complete future acceptance. The measurements retain actual command groups, times, CPU and host-load samples, including any failure. There are no source or test changes. Parent reviews READY before a fresh commit-endpoint ACK; exactly one local Conventional Commit follows that ACK.

Meaningful research corrections are retained: the initial narrow scope projection contained 480 UUIDs and omitted original 270/275; the complete current reconstruction is 483. An initial helper proposal to reverse 274’s shared-leaf ordering was withdrawn after reading fresh native notes/dependencies and the mutually exclusive `ContentStatus` union. Current journey-first ordering preserves D36, zero battle effect while pending and whole printed verification. Numeric source pointers were checked against actual function/dispatch starts. A parent source search tried three nonexistent guessed paths, then used the actual path inventory; exit 2 and zero effects are known, exact PID/clock unknown. No command receipt or timing is invented for research-only observations.

The initial 130-row prefiling proof is retained verbatim below; fresh 132-row duplicate/Areas/current-scope audit retains the no-new-filing disposition. The supplied candidate map remains a comparison artifact, while original native clauses govern scope. Source hashes remain tied to the own worktree base, not a later peer’s branch or staging update.

## UUID scope appendix

One compact membership list per native bead; these are exact original native UUIDs. Dreamsign names never key content or scope. The 65-kind table supplies the action-kind cohorts and source bodies; the native lists below supply all UUID membership without 483 narrative rows.

### hv-umm2. 261 — 3 UUIDs

0c52e8c3-a792-4eea-955f-a0c61463c066 d9f0f7ff-63c0-4247-8831-054d7fed931d 452b7cd6-9dc3-48a8-b9aa-412ca6dd5f19

### hv-umm2. 263 — 3 UUIDs

7e8c86cc-788f-4648-be84-e0935c40c31e ab1da9d3-376a-460a-a9dc-4737e59e558b 0df9d72c-58ea-42a0-a72a-cbc540a1836a

### hv-umm2. 264 — 3 UUIDs

31df4c62-6ab2-47f2-a4ff-c32b8e554b3b 9f34b5f6-4766-4a7e-a841-d7b945cad504 c2af5460-e61f-409b-9b86-6ac7db34d748

### hv-umm2. 266 — 3 UUIDs

8a2c7b32-26ea-40e2-845a-689da5673b4d 8408b8c2-5a3f-40dd-bac4-98f2736c4176 10bd78de-87ec-44e4-9b16-e755da2a9717

### hv-umm2. 267 — 3 UUIDs

2dcf92bf-93b3-400c-ab97-69d3098f8868 cd81a49d-df58-4e0e-b1b2-33a82b386052 1c505034-e405-495d-8418-6e3c06d974f0

### hv-umm2. 268 — 3 UUIDs

025ce7f1-066b-480a-8a2f-364379890abd 1cf06f9b-d698-434b-8e36-8a47206f4c0c da7e4b45-9106-4116-bc1c-3aec8885396b

### hv-umm2. 269 — 1 UUIDs

069c6e8f-4f41-4f13-9ec9-2009b4186e3b

### hv-umm2. 270 — 1 UUIDs

3d86f8ce-42ac-43dc-96d5-121e6d1a6167

### hv-umm2. 271 — 4 UUIDs

e377c3ed-16f5-4424-a9f1-73f9750ace9f 8e2d26a8-ff39-48a4-a30e-434479c4675f 8b69de8a-835d-4f0c-ac25-dc0e700e2983 4f21a4ab-e4aa-4718-8563-9afb72d140c0

### hv-umm2. 272 — 4 UUIDs

427c71e3-178f-4352-8d6f-f0789cb13c2d eb55b141-82f8-4ba4-b319-420f762e9ee4 1328e611-fa2f-426f-87e2-97f26c061866 e7d23bf7-4d60-4b43-94c4-14a06c0f9116

### hv-umm2. 273 — 4 UUIDs

71f77dd5-3bb5-4987-80f4-13dc69f74e6b 883f88fb-ac50-419a-8382-c22edee29755 cd4bb1f4-66bb-45ea-abfe-ce0c66e4ec4f 34ce9428-dda9-4efa-bacd-5ec2698561c1

### hv-umm2. 274 — 2 UUIDs

6b95d6bd-c970-4465-9536-4f21e7630d0a 1cd25b9a-b176-4c51-8349-bb4df35cbf05

### hv-umm2. 275 — 2 UUIDs

22adf539-d2c9-4f33-9416-159d03a220ad 980d283a-9558-4b66-84a0-fcb91fdf4ceb

### hv-umm2. 276 — 6 UUIDs

19f6c2c9-dd6b-4d65-9f95-f6a3486772cc a2c070ca-eacd-4cca-b69d-3d48f0787a16 a66c513e-500b-4891-8c09-9641ae300ba4 c3fa83af-ee3b-47cd-8112-5e5cc38821de
eb4cfc5f-237a-47cd-9215-7cce3f15583f f0ff63b4-424b-4ae9-81d5-a4f6546afa3f

### hv-umm2. 277 — 1 UUIDs

f40df441-0e44-4122-b4d4-cdc4085a9ffb

### hv-umm2. 278 — 0 UUIDs

No entity UUID is transferred by this foundation/final-proof scope.

### hv-umm2. 279 — 0 UUIDs

No entity UUID is transferred by this foundation/final-proof scope.

### hv-umm2. 280 — 111 UUIDs

fbd22f73-9eb7-458a-bd2c-6a65ac5cdd6d c6be47aa-68dc-4d5e-aeff-ac85de91f368 571d4537-5ff6-47df-bdc0-77be447f411c 65bcfadc-5775-4dd5-9147-4e82fa75e2ad
72ab2b5b-cf89-4981-8398-acccbe026886 8f3c1320-83e9-4198-9927-00d9345cdcad 867723b0-3489-412a-813a-1c0ef8098be2 41c670d1-c12c-4152-a184-05a4cbed2be9
bb8d9d56-cb78-44a9-8bef-6b4c87c20ec8 1ebb9a53-fb79-4cf2-a9a7-2a00a6fb4b8c 091b66c8-316c-4ef5-9bbb-26db6c8d45d3 d1233e3f-06e7-4a78-9192-4ca49cb0728c
910acca3-f35d-4fe7-9a5d-b7d91fdc2818 bbf77c1f-5f24-4e37-8062-ca2b30dc65d8 739338ed-18ee-405f-ac7f-d61b172ef040 003415d5-e8d0-446e-8f2c-70da5c55d79a
bf8e314f-074a-422a-beb4-d55092114bb4 8dfae3bb-c49b-49bf-ac27-c7293d293dc1 61faffda-a3cd-4b60-b033-bd6bc412207c 19e2443d-3b39-43e8-a1c6-afac64aeab2c
cbe7a8e8-0275-4f1d-9be5-077f004aa4d4 59d712a3-f2d7-460a-937c-3c0808e4874d 1b8b8de3-a11b-4280-aa12-939aa0dd0489 d8efb5f7-1149-475f-b109-999f89f9a97c
e4d90d10-b9ad-464d-a7ab-e7a261fdcb59 80701c20-b897-4307-9222-1d56aa1b446f 63fb1aa5-e761-47f4-9c94-e407967cb6dd ec53cc34-edb3-4264-9998-457672f91662
750bc96a-ac8d-499d-9618-1f27e5e6dea0 15a3b944-2a40-4c5c-917e-bf708fd13ea6 7ce8a057-9d68-41b1-94d0-c2c05ec827ef d4cb0655-c311-4497-b06a-548a1549ccd4
bbaf2e35-d7fd-4d0c-a0f9-6d67af20f6ce 2532f464-2151-49c2-a130-2e94b89ca8e8 10325095-5749-422a-9398-68fc12eb3830 f13f121e-f02d-4bff-adb6-d42276e218f9
daf9c800-5a82-4af4-8ecc-ca97fe78ba77 0a6038e3-2a98-4a27-b03a-707355b4fee2 3fd7101f-f88b-4025-a708-291934eeea31 e78e529b-a267-46cc-846c-46d6d5b6c7f7
d7e68bf2-a5b8-4d37-90c5-0a0e81e61add fccc9055-cae3-427e-8055-4951d19accf6 06726bb6-4ec0-433d-b88a-87f752f7dbc2 302b8c4c-ab36-4730-8ac1-f3fdcf192f10
255a201d-6779-4805-ae59-857756c7a8df 08d29b7e-55bf-4b88-b61a-88c2e7f56a88 ffd8190c-a34d-40d4-8e9b-65142eff53e8 ded01c5a-c919-4f61-bb4f-31f7bb64680c
c007cf3f-7779-4081-bcae-b1726dc816c2 75579971-169c-42bb-a622-684d551de035 5b4149c5-5097-48be-ae56-c6609fa42175 e4c739a2-ff7f-4b8f-9f48-4dcd4fcd19be
90036feb-0132-4ba8-8415-0f11a17c898d 63648d40-a6ec-442f-aa36-24aafcb01ddc cb27950c-7df6-4a8e-a540-0a9ae04cae1c e9d14079-adda-42b1-a0e1-8fe8fa8113a7
6b56baff-fe52-4b32-9e52-534d34863444 a6c5d591-c423-4700-9a69-7ea25fc80236 b718d1a0-af08-4d66-977f-5a8fa2a08ee6 b6e5c3c3-cff9-404f-9521-b890c1c5139c
aea75970-6235-40ac-b422-c6327f0a9c8f 50c0f784-ad01-4fde-9cff-27a0fedbe1d6 d244c4b0-3a78-4961-a975-ebadcae7df6f 51f5fe3f-8c57-4366-94db-d270fa71ea04
124bc32b-bb3e-4f6e-bddf-2bf6545c0e07 8f7e4825-8e28-4a4b-97c3-289dde13c3b1 42531eee-ce02-47e4-92bb-4d80217bef9e ced812d9-7943-4625-aead-10e08af7d0ea
eeefd61b-d20e-439c-966b-c6ce07870182 ffa72a9e-4858-4a3d-8ba2-5b3f9ae86256 d33d4cc1-d5dc-4ff5-ac11-195a72be9a5e 2fe0502f-ba70-4c91-8af0-37f907731203
b7321ee5-b0a5-48b8-b320-4ae9fbc8aa76 525c322c-6a70-4874-bfcf-27eca02508cc c577d037-bd4f-432e-b0af-09e77e7ba94d 8c75f115-e1a1-473f-83bf-c8369b8d0a31
e8b93126-2317-469b-b1b8-8427e8b92322 581f1236-2c9a-4f47-b4e8-f980581baec6 5ab02a06-fdb4-4a8a-a377-70c4f0148323 b1b1d7c9-f765-413b-aaa6-a1ad41eaf413
d9a98018-25d4-4def-aa1d-ae1c71a4a8fb e9d4f9de-8795-4c88-9f88-f125b6dd621b 542ca815-ab73-4251-8de4-ea8e932135ac ac2d6b33-402a-469f-a032-e41903b7811a
f3beb8c5-cb4e-408d-bdb2-b0d2249712f5 71311891-4fab-4956-a346-959b2dc7e031 ade4e283-b41c-4291-b7f2-c8016e6bfb0b 875aa793-b67b-401d-b957-510315aa0922
7382f0c8-6815-496f-a49a-16a982db9448 345db217-c611-4c41-b844-1232492b9a92 88f91d60-01ef-48ee-a2aa-49bdba4f3d86 82892492-1abf-411f-b26a-bda5cadeb706
46e7de23-2c95-4611-aa5c-ba39b9507229 653fffee-ea77-4cd3-b1ec-b3409ba82760 b284f3ab-e20b-411b-9f81-1ea25f8470d0 9e777f6d-6c26-4dc3-b049-a5bb8767c249
c799b0b3-dde2-40db-a569-a76fe90185de fb9586f5-4a9e-41c7-a711-9e808662ddeb 26a4b37c-865c-4cb8-9105-879709f23ae5 438b139d-835e-4eba-93e0-34d152681365
0d57b28b-3f03-46ed-9bfe-5ea8f4b80cdf 5dae9bee-5718-42ce-a4dc-55b5f7973af8 a9f63ed8-65e6-412a-b515-af6c12ee531d 4a59f8a7-6704-4aa3-a7b3-00683145565c
6265b65f-5d85-4cfc-b1a3-5d2ac17f1184 f08b8e9c-69cf-4de9-b93c-e35859a2df98 008c0224-5be4-4b37-b0b6-c05213a3af0b a5fe7663-d7a0-46b2-99ec-f9fc1cff2be2
34b990e1-387f-4d61-a7f7-2bff50fd4c2f 0728a8ae-a839-4851-abe0-2df32da02553 72785214-e131-4966-8d37-93abb25ffc69

### hv-umm2. 281 — 42 UUIDs

b8e30996-eb1b-48b6-95b7-484a2be31d64 d134b0e1-68d5-4edb-925c-e24f77ec4b74 e9d289fd-26bf-4e5f-a02a-807f1f4c3464 41d2f0f1-09c2-4fa8-8d14-1c2f3c070ddd
8fbc7243-142a-4724-b683-161b463e8a66 ebe3c30f-702b-4679-8b69-6ea288dab2a4 a7469f8f-b4ff-44c7-b9de-679249a826d4 c69786b7-190b-41f1-9798-5dbc26953eb4
7f2cf279-7d99-43ea-b17a-a9a4b379dc7a ff89acc5-e4a2-4be8-9975-ba6e3e2be325 b0788f98-475c-495e-88b1-10cda2e72702 ef6f3edd-fa06-4711-b772-22dc5a36ef3a
2efe46a7-9203-4366-98c3-e59253ca7b2c 823736ec-b4ed-4c34-a863-cbfadcedb8c0 d53b7ccc-dd63-4927-a711-02810c66a739 cbf843b9-5924-4a54-a8f5-2cdf7a177289
3512bf48-b98f-42ed-9fd2-841e1177646c 8e31bd08-b5d9-48c6-9772-4a1aa7c26281 506f34cf-e826-4d7a-a0a6-a3a456c9019d 2a87956b-3dfd-4bf7-a83a-5f7bc7c017dd
69770100-9d41-4daf-9edf-527488df4fd4 214467f4-5cb2-49f3-b734-040890792a4a 07a0dba2-5ac1-47a6-ae23-6b8c98ee2a2f 871d3b6f-2fe3-47d2-afca-72d52a0e5e80
2269992d-019c-45c2-b171-14c4814053a6 b6bcb0bc-0c40-4f60-bf1e-30e7c3ab26a7 d78945e5-7d47-47fd-a14a-18737a3ca1a3 bbdcaf49-b077-417d-8f7a-18c6c355478b
bfdd2306-a1e3-4aab-ac1c-87474b1d562d 6fe876b1-ed04-4227-91a2-6af5780d9a69 27077f5a-473e-4973-ae36-91ae63d42f0b 3ef10694-2df5-4cea-917a-65007ac58d16
da72a623-3e95-480c-a53f-a76c5b8a10a5 f30ff862-8146-453f-b518-72fbeb2de224 20e033a7-dffc-4cae-a89d-9fe674c28a9d 37f1b36b-9179-4e38-a937-a856d30e56cd
7433289d-5cc3-4023-852a-2ae9635ab213 48294bf5-bf99-47c8-8e12-f8e1e4d8c63d e69d6716-d497-48ac-a334-a23fe747360a 9163853b-42a6-4465-8e7a-11c60d92959b
6d43d558-7a09-4d22-8d14-9aa503f78156 fc40fd6a-43b4-4074-a5f1-ad3d3247b9e5

### hv-umm2. 282 — 34 UUIDs

cb4a0eae-a464-4888-a2e4-390c3e986899 83a3d2b7-0ca2-40f4-89fa-726f6efb732b ff2a2adc-9678-4e91-8c29-853a045270e5 75a6bd0b-714b-46ed-b5c4-9485f8319959
a63c84e0-5d10-4155-8fcc-f6c967330014 ed726ca9-6e65-4680-8596-444d872c28db 66957744-1b9e-486c-a015-ece9cc8ded3e 902931da-6ab3-4987-b345-3317b4ade36a
8fd01df5-2022-4ed9-8a80-b24b41cdcfd5 c7e23aa9-7ff6-4d41-b0bc-0993d9bb0b6c d70a2fb9-6b0f-4c6d-87f8-b39beeef5bc8 f1a48400-d96b-4aa2-8b3f-cb9a93dc8ad9
d451ccef-f4be-407e-800b-55c04608896b fcce63dc-f8c5-4183-be2a-9de4929ca8c2 7f5989f5-dcea-452b-a678-4febe5f6baba 2dbedc84-1c2f-459e-9e6e-acafa1cd93ee
485a331a-b263-4921-a342-81453dfd1dbf 305154b4-f3c1-44f7-804a-70a7c01f7c7f 52949805-3fb2-40fd-b72d-4448a49b2722 9f73489e-d41f-4883-b2cb-d571ef95fd2d
66a93ab4-c049-46eb-a176-d4b63e69c840 2719cc15-94db-4fea-b061-e92a78371fb5 eb808cb8-fdf4-4ad2-ae06-60103b5321ed 5ce24a74-9a00-40ec-92ec-8caba0836f98
363b6fc0-cc56-459f-8940-18c0a0b3717a 4790344c-2167-4bf9-bef0-5d33787d7f68 c9b12011-3160-443e-ae04-ff36762059a4 8e010cae-a23c-441c-b807-ac4186f49c55
bac27741-0ac8-448b-a838-0e624b5b5846 d449caaa-9d41-4d63-af5c-23b6aa9d6ce5 90d2a24d-5eb8-44bb-85dc-97cc700497e3 08b717a3-c3fa-4f94-8758-f6449d528c52
34f9fc83-52e4-4709-9361-6cc10129354d 30a4aa09-ccb4-453d-8e92-ce059736c678

### hv-umm2. 283 — 58 UUIDs

2df93add-1e2a-4b89-b543-4bbf9df54aa1 336c6140-542b-4d42-b19b-5736d864669f be14d140-b1b2-4372-b0a6-c4228d463627 c9a6b1a0-6340-48cb-b30c-a0917271546a
496eb06b-c9a2-44bd-8e3e-a047b2043af2 ab93596a-375d-4a22-946e-75423ac3c0ec 2542e069-c6c6-4d76-b4b1-c71138371931 9d85ef97-4f53-4633-bbb1-699cc25e6944
0b596a61-2355-4932-b6d7-e174a38bf85a 7fe9453a-3e29-443f-bf5d-72c779b4def3 42ec0173-42f1-433d-8366-0f3aadb47d7a f863131d-c742-4d99-90ea-088701382e53
29905ca2-3a18-4024-a443-d8cb28c91446 35d2eb8c-44d9-48b6-8bc6-be9436e3370d 1dfb9178-2259-4bd4-a269-d8b91b8d7ca6 f372f27e-3d53-4bb4-8c20-e695c7cd0895
9e861f68-e885-411d-97d8-6ccdcab6c80e 2ce3f099-f892-4753-a540-c939beb664d5 4bf1fa01-1890-45b5-80a7-6b6163e8cf25 a9e2feac-1f32-4a95-9555-810ea083cbd4
b1c14803-7be3-4ca1-82f6-dbea16be7c7b 4eb72353-e83a-4548-8099-19e9ab34f657 64f25dd3-dac8-4694-b4f3-24176287fcc2 abc6d977-d2cc-4828-b725-ee4a0d5765fa
831d6520-da93-4290-b33a-9ba4554cf675 3e78f870-b864-4704-8c4b-cdcb59e76cc7 a9fd3639-8d1c-4456-930f-13f4589db33c 2de081c2-6567-4e13-99e5-a0bbf16923b3
242770a4-8c81-4b66-8abb-6e8a9c5cb53d e441b406-a8d6-47dd-bd44-9ac9a0fca791 d5131386-f24a-4070-bc85-bb87da15f384 f5f7b66b-1dbd-43cf-89b0-590f2dcca456
c139e3d4-6751-4b4f-9349-9cc38238e26e 42b861a7-ad92-47ff-9ead-3e2933a0352c cc08e452-0c6b-4968-b92d-2e5903c93fdd c183f486-9701-456c-ab94-cb53c9c4269a
4a886ca5-dac7-4b24-af91-8134f1a6e3b8 9c4b8c33-8b94-4a38-9e7b-80602cc8cbee 05c51da2-77d3-44e2-8ade-a5865c94854c 7c9f191a-dee9-44d3-b8af-b35209ebb22b
d3bacfb6-7cf3-42ca-93f4-4189cf3632c6 2da3c9e3-9b89-4df5-ae5c-11448f92bc5e 316e3f24-aa54-4da3-863d-d05985ba0dc4 b9287b66-b27a-4b72-88b9-a46d925ef226
3da6819e-c190-4156-9b36-956bcf0d9be2 664c9209-ac07-4381-9a60-8344ac189192 e27832de-1271-4fb5-948e-543dc377c28a 5b64dd00-27d1-4ba2-a383-afef20a30f64
e793121c-e0e3-4f9f-8738-ff4d1c4f95df 3e737b61-414c-4f8f-8ab2-d3f5e5e581b9 becc81bd-e2d4-4f50-a334-9b673dba825c f757e8c1-b6e0-44d5-abc1-00305cd3387c
6a76e445-0f00-42cb-b311-10dfe06ee0c6 cc177a0b-1939-4e16-a21b-33660d97666f 3471e8f7-69db-46ae-9bbd-180c8b02f426 d43566ce-c720-428e-92f1-62651c78d092
6589c495-c09e-4eed-a502-1db46ee6b263 b312af6f-756d-4c19-bb2a-ac62908bbecd

### hv-umm2. 284 — 32 UUIDs

4ec18326-6968-40ee-91b0-de6c00440ddc 252c81f8-0a07-4899-8ab2-a2e19bf89de6 1856ae77-4bf6-4d99-88ae-aee46b2f647b 975398f9-e1f0-4a77-ad46-c989b0df2c2e
effc05ad-ee43-4fc2-83c1-f25bd6bf1754 cc63a163-3e80-4f63-a252-2d89a4c7270f b4c9022f-0397-4d02-b058-f43f9c444139 0dc54870-c1be-4900-9d2f-6f5adb53e8a1
780b903b-235a-4c7a-9030-435671d88afc 622b741a-3ba2-4626-936f-2e442cbc9abc fbd06d78-d18a-4248-9f31-61db84d2c1ce be58a8a4-c10f-4cdd-9278-e27a3a4605ae
c19aed98-18f8-4fb6-a7fa-9b84f210c218 5bf49a6e-ada6-4e3e-b381-f333178599c8 75469517-395e-4612-aba2-242850b93483 d963a026-84f2-4599-8bd8-cb19f4132163
b00478b9-2366-491a-98ce-3f8c37364063 2a59080c-2ddb-4f58-909c-580884fdc0ba 47171f27-08de-4baf-a409-4e1ddacd96ff e3c70736-fe3b-47e2-9aba-019beb235974
e299eea4-62d6-4817-b2ce-4ef28a68e14b 5954ad36-d709-4fd0-b024-11420bdf6bc9 a4efcf82-5a4e-4116-bbfe-5d3ea87ca882 599e17cc-10c3-4ece-a0d5-2b8d17d98041
65ddbb3a-bcba-41c1-a81e-128a8e412dc8 285fb938-05ce-461e-90f9-5e014925908a 918a26e9-e0a3-4e85-8fad-5504f8cbe02a 1e27d150-b8e4-45be-a90d-117adef035fa
487aaad7-7fc3-419e-b139-98dfdcba5747 132b7409-efb0-4622-b312-5c29fc2432e9 df14d3e7-b6ad-4414-afb2-e19721b8aaa4 afd46c27-23bd-4e51-957a-5b0aa5a4cab6

### hv-umm2. 285 — 1 UUIDs

b59b7e6a-aa32-428a-9397-06766ebe9b7d

### hv-umm2. 286 — 67 UUIDs

82510dd1-0824-447d-a780-c8fb37bd5864 267846c9-c8d3-4c57-9f29-f0ce9f30653d 18069673-2c22-4f94-88ca-b71ac87612bb 22c53836-f2e3-478c-be8c-e88a4ca95ebb
f2a61678-17b0-4d50-b75c-f1de61fa0d5c 1dcc31bc-9b61-42f5-944e-bfdb7d3e52fd d00054fa-6184-4cc2-bdc4-36d9bdd4bcaa 9f3a1823-df4f-457f-80f6-a8745ec38334
8e628041-47ac-4a18-b62b-79672762b53a 61f8ab2d-c18a-4213-a853-407ff9564af2 e892a1ed-f70e-46d8-afd0-53882ef5d741 7556e80f-6234-4d38-a1be-d3a9e7df8d6b
d364351c-0313-4c21-8248-e6ae4ab3d6da 31edb3d9-9dbc-4424-86f8-72471a3de0a8 448f22fb-04d2-417d-ab29-0ed9fc2bea8a fb0813b8-bfb8-4844-9915-ba04bb3476c8
d34c602c-c0b4-4298-97a3-af067500f1ef d9919f67-027e-4a53-bb72-395e11573c89 d8ac6a21-d668-4f81-95d9-ffb238c09b24 4f5a4e00-bb9d-437b-9afd-9792af6caec9
2ca7d5ee-101e-429f-99ce-fbccc069edfa 969ce2f6-6e1f-4e5f-9710-5683ff3dc498 d49df15d-c49a-4822-84e6-bb1600b617d1 7bdb9e6e-6eb6-40f0-b9bb-f07e9c10393a
89bfc76a-2ab6-435b-9ab6-7b11faad6fbd 4cfe1c71-e9fc-4e35-8d73-44021ca161b4 60ffaf18-ff58-4c6d-b86a-09f10b0db8e0 f1ca6a23-c366-4515-91ee-0ee5cc0a0f3a
67b15aa1-5b28-4da5-9830-86617b90a934 404f43fa-2119-48d2-bfc0-879f6972a7f7 660f7fb5-240c-4c8c-9853-cc93851d938d ce3b0d6d-27c2-4b57-ab97-1e81a968b0de
e3375d56-4eaa-408b-b471-e0df76239715 b1184d31-cc69-4f4f-a145-640b2b2b20bb 53e95bb4-6743-41d8-80db-9daed79a4123 319999a1-16dc-4064-86ed-1b46947315da
7069b48b-aacb-4604-9202-120cff1567c8 815b977d-dbef-47d6-9fa9-f4e0e8e4f597 fdac337f-2d71-4e91-9a10-7b7bac538fdc 67d04a76-98ab-4a50-b863-9547b92d738e
d83ed895-db5f-4851-8cc7-cd9a194f5e85 2b68abf4-20a2-4002-9eee-7007ac874b40 1663a82a-e0f6-4979-b90f-39f46037eb2d 2f58737a-51b7-45b7-aaf6-875680d96c1b
796f52f1-14cc-414c-85c7-9b8a2694e6bb a9ca68b4-f32c-44c7-99f4-921431f6771b 839b2fd1-4bb6-4b61-a378-eb25863fbc2f 423e54a7-d0ea-4ac6-8115-dd7be68a5f41
af23b52e-0222-4fe3-a66a-a9bbaf135a38 48671e80-d720-432d-83dd-f3d9a613736f 9780b16c-75ed-4ad0-9efb-43e087fe5dc1 57e55570-d3c1-4aef-aa23-9a0d12bf13aa
e34914e1-adf5-4a41-abc6-9e629446cbe7 a69f3ea4-0568-40dd-af62-b1c35cd0a32b 56604a49-0920-4242-bc4c-233859bb882f 0fca674c-72cd-4774-b6d4-587edff1f57a
fca79f5e-194d-4468-9c0d-3b0f103bdf8e abc400a3-066d-47c4-8466-6c7a021d94ff a9ce3029-2c87-41c3-b1fa-ce803135d1f1 8d77cfda-9be0-4e3a-abfc-9814fb14d0b1
022723f4-d18e-4d2e-9600-c44303ff3d36 ab98f7d2-176c-4a2f-867c-944821be5c2e 5221f0ab-7a1d-411d-8e7b-fa0d8c128658 f19f245d-ba05-462b-8db4-853833ba4bb9
7213ad24-4cff-466c-9288-f2f8d610b000 e77e78d4-7b74-478f-9d27-2ca6709712ce 2ee82d80-05c4-49f5-a1b7-9386314bac2f

### hv-umm2. 287 — 66 UUIDs

581e129b-3b9b-4a7b-9dbd-b358f9fa5d8b 945dcf24-a548-4391-9cbf-785a584c76d8 009e949f-2c69-4d72-b444-efb972ffb37f 42607972-b7e0-47bf-ac8b-338f6f6f0325
a56f8765-f859-445a-896f-e9377526ab03 86f613c2-6f0e-43cb-a4ad-7385158656ba 20cfd197-f247-431b-8335-9c7d401806da 57e56e5c-48c3-4b17-9ee2-80651d7ed7fb
665a94ac-2e17-4450-9ae3-3a7549bffe1c 50d54415-8488-43a2-9b64-caea9c0825dc 8271a330-b4f0-4931-ba41-08b268d6edd1 6954d3b6-64d5-4a8a-8828-fcfe269d9037
97759157-5ba7-4e8c-8923-53bc06ead192 87efe01b-525e-41b4-80d4-db4c4bf3e656 21023675-4a7e-4f5e-afed-56f70c0d68cd 6252f2e0-f865-4468-bf91-64d94646c851
17a96db4-e97d-4a7d-9118-81fef35832c6 5169756d-be6e-4b9b-8f95-d914714108a6 430fd519-1c75-4657-8b8a-2ff5e4e5633f c6279afc-2819-4141-a1cb-20917bb00e2f
842a4c2f-49ab-4f74-809e-a3bb4380f7c4 91bdca62-29cd-4bb4-adcf-4209a86833e9 072ff391-7b19-4b7f-83d7-11f71646df3e 5db20830-6098-4243-9b8b-d476c2d206f0
ae385aff-6eb4-4035-8875-0edb357c3205 7c543c64-35fb-481d-b1d3-af9a6caf99c4 1f8131d0-730f-45a8-a074-6a2eff77584c e162a1b7-4056-4896-b8a6-e0c0d8389216
d00b1861-631c-4990-8a64-0fd1f0aacf2b cd713f4b-bbb7-4761-a75f-579222eef578 c6f9e2d6-306e-4db7-9961-d8154f5132e6 ea92b9ab-1dde-4903-90b7-30a52491b7ae
4971417d-2b6a-4f5d-b47f-03555d2051f0 2d29f3a3-353b-45e1-a499-978337af2dd5 d6e5dbe1-22a4-4f1e-a224-97c81e0138d2 736cbb15-73c5-4efb-b550-0641ea58a24d
1adca56f-6e11-4772-b8c1-8712df94c1a8 63586673-781f-4281-bc1d-e4f8b11ead28 56500107-6da7-47af-9807-83e4a6ed8e38 50684e69-b2c6-4e55-a8f1-6e92298fdefd
09fd2af7-8067-4616-b361-c5958d670f2f 085c6812-0210-481f-85fe-3ee0054cd43e 9a760ddb-ee2b-4f29-b2a9-c32973428346 efef24e0-3342-4c55-9823-5491e293d1e7
d7d0168a-6fc5-43d8-a0ff-5d79bbcfa8d7 07f25e60-96ac-4776-85db-2652342b78c3 66233bad-6370-48ea-a3dc-4148e7de5de2 ff1f7348-a85e-406f-b6a0-0727f9194c72
d0827a70-ec6d-48c8-8406-4840c1793070 865623c9-731a-4001-b9b5-c6c4d924da42 69bab67f-b41c-4f6c-a4d4-961be805121e 2e5b0300-5ef0-406c-a891-69578ec86175
be64aeeb-da6f-4b6e-af0b-4c47fda4f2cd 034d737d-db81-404b-88e0-28b2b83fbd06 b456a39f-2b40-4ebf-a4fa-66add8e6125a 52b0afe8-8f54-49f3-9f71-d0493220060c
fcea4f01-7d04-41c2-a139-a7cdfc9ae480 12f4e09f-07e3-4db6-9db7-72d42b4a064e c44535c8-4490-4893-8037-fb40db5fb7c8 fd89e187-5fbe-4096-8e30-c2705957a135
82bc3723-34ab-4743-b12f-75589225ce80 7f0d6a6a-fb11-4314-841a-532724aa3e9c 730a3c57-a309-45a6-acd4-aea3b99664b2 905cf858-d8b3-4884-af24-1c953c00b0cf
f4a4ee8d-9610-4841-8e24-20a51f6868ba a99a5ce8-d73b-42b4-88ef-f71ea3e0491f

### hv-umm2. 288 — 29 UUIDs

a5042cfa-d3dd-4a62-b4e2-5d86d3cc2874 49273949-f29c-440f-b843-5a9d0640c236 c0d41e23-2f38-4d17-a1a3-32285b7e4da6 92feb9c6-efb6-48da-ba52-936841f17de8
4ebf0221-0b1b-4a47-9d68-0138cdba2cfb c7c50596-f234-4f4e-823d-88700dc1ab99 a6d3bfe2-72d9-42d7-8380-fe97fff4de47 38549dea-c5b6-49df-bda9-d621a7e0ca6f
8b3c547f-3043-4d29-b40c-3629a38f848f 472e903b-f832-4cd9-90ab-82dee9f8177c 1bf1f186-404a-44f2-a705-6474fca1ddf6 3d435a07-0fae-46cb-b589-03bb93b15c55
7bcb0ab4-5d61-41ca-8f88-c9d9502ef82b 09917d76-41ef-4117-a0e6-84f716663df2 285662bc-bb49-489f-9ae2-c957e218aeba 3994f237-6cdc-4047-b98d-97e7f31fcfb0
fb695274-f200-4f17-8dc5-7745ae63a2f9 514d3ba6-e57a-438e-8dfd-28cf7db97e5d e9875a87-289d-40b1-a19e-2e566c3b332d 8c2fbeca-9f8e-4156-9437-ae3405daff0e
144f5e25-c537-4d71-8dab-7de719eb93a5 c890dbf0-4d74-4a0e-8ffc-2e5aef3cb38f ee5061c9-ec09-4b86-b5aa-8cef605a1796 eb514a7e-b571-45c5-b672-488df11e1fa4
af570fe6-7543-4c9a-9b1e-a103cd739945 8e112255-2140-4e46-bb60-d30d286fc8ac f6bf3f1f-ef1d-4f94-8a85-b8620c7bfc6a 2ff475a8-37b2-4cd2-ad8b-648968b27ec3
07145c6c-20f3-4a2d-9058-d8dba4fc23e0

## Native Dreamsign and form source witnesses

| UUID | Native owner | Actual declaration body |
|---|---|---|
| `0c52e8c3-a792-4eea-955f-a0c61463c066` | hv-umm2.261 | `src/content/dreamsigns/spell-tome-0c52e8c3.ts:4` |
| `d9f0f7ff-63c0-4247-8831-054d7fed931d` | hv-umm2.261 | `src/content/dreamsigns/leaf-ledger-d9f0f7ff.ts:4` |
| `452b7cd6-9dc3-48a8-b9aa-412ca6dd5f19` | hv-umm2.261 | `src/content/dreamsigns/green-slime-452b7cd6.ts:4` |
| `7e8c86cc-788f-4648-be84-e0935c40c31e` | hv-umm2.263 | `src/content/dreamsigns/red-cheese-7e8c86cc.ts:4` |
| `ab1da9d3-376a-460a-a9dc-4737e59e558b` | hv-umm2.263 | `src/content/dreamsigns/white-rat-ab1da9d3.ts:4` |
| `0df9d72c-58ea-42a0-a72a-cbc540a1836a` | hv-umm2.263 | `src/content/dreamsigns/voodoo-doll-0df9d72c.ts:4` |
| `31df4c62-6ab2-47f2-a4ff-c32b8e554b3b` | hv-umm2.264 | `src/content/dreamsigns/raven-skull-31df4c62.ts:4` |
| `9f34b5f6-4766-4a7e-a841-d7b945cad504` | hv-umm2.264 | `src/content/dreamsigns/brown-acorn-9f34b5f6.ts:4` |
| `c2af5460-e61f-409b-9b86-6ac7db34d748` | hv-umm2.264 | `src/content/dreamsigns/blue-crystal-c2af5460.ts:4` |
| `8a2c7b32-26ea-40e2-845a-689da5673b4d` | hv-umm2.266 | `src/content/dreamsigns/witch-coin-8a2c7b32.ts:4` |
| `8408b8c2-5a3f-40dd-bac4-98f2736c4176` | hv-umm2.266 | `src/content/dreamsigns/cracked-orb-8408b8c2.ts:4` |
| `10bd78de-87ec-44e4-9b16-e755da2a9717` | hv-umm2.266 | `src/content/dreamsigns/red-shard-10bd78de.ts:4` |
| `2dcf92bf-93b3-400c-ab97-69d3098f8868` | hv-umm2.267 | `src/content/dreamsigns/clam-shell-2dcf92bf.ts:4` |
| `cd81a49d-df58-4e0e-b1b2-33a82b386052` | hv-umm2.267 | `src/content/dreamsigns/rosemary-cd81a49d.ts:4` |
| `1c505034-e405-495d-8418-6e3c06d974f0` | hv-umm2.267 | `src/content/dreamsigns/sea-urchin-1c505034.ts:4` |
| `025ce7f1-066b-480a-8a2f-364379890abd` | hv-umm2.268 | `src/content/dreamsigns/spider-025ce7f1.ts:4` |
| `1cf06f9b-d698-434b-8e36-8a47206f4c0c` | hv-umm2.268 | `src/content/dreamsigns/cracked-mirror-1cf06f9b.ts:4` |
| `da7e4b45-9106-4116-bc1c-3aec8885396b` | hv-umm2.268 | `src/content/dreamsigns/spiral-shell-da7e4b45.ts:4` |
| `069c6e8f-4f41-4f13-9ec9-2009b4186e3b` | hv-umm2.269 | `src/content/dreamsigns/spotted-mug-069c6e8f.ts:4` |
| `3d86f8ce-42ac-43dc-96d5-121e6d1a6167` | hv-umm2.270 | `src/content/dreamsigns/theater-mask-3d86f8ce.ts:4` |
| `e377c3ed-16f5-4424-a9f1-73f9750ace9f` | hv-umm2.271 | `src/content/dreamsigns/tortoise-shell-e377c3ed.ts:4` |
| `8e2d26a8-ff39-48a4-a30e-434479c4675f` | hv-umm2.271 | `src/content/dreamsigns/toad-8e2d26a8.ts:4` |
| `8b69de8a-835d-4f0c-ac25-dc0e700e2983` | hv-umm2.271 | `src/content/dreamsigns/glowing-crystal-8b69de8a.ts:4` |
| `4f21a4ab-e4aa-4718-8563-9afb72d140c0` | hv-umm2.271 | `src/content/dreamsigns/star-anise-4f21a4ab.ts:4` |
| `427c71e3-178f-4352-8d6f-f0789cb13c2d` | hv-umm2.272 | `src/content/dreamsigns/carved-bone-427c71e3.ts:4` |
| `eb55b141-82f8-4ba4-b319-420f762e9ee4` | hv-umm2.272 | `src/content/dreamsigns/mortal-skull-eb55b141.ts:4` |
| `1328e611-fa2f-426f-87e2-97f26c061866` | hv-umm2.272 | `src/content/dreamsigns/paired-teeth-1328e611.ts:4` |
| `e7d23bf7-4d60-4b43-94c4-14a06c0f9116` | hv-umm2.272 | `src/content/dreamsigns/rainbow-jellyfish-e7d23bf7.ts:4` |
| `71f77dd5-3bb5-4987-80f4-13dc69f74e6b` | hv-umm2.273 | `src/content/dreamsigns/scorpion-71f77dd5.ts:4` |
| `883f88fb-ac50-419a-8382-c22edee29755` | hv-umm2.273 | `src/content/dreamsigns/charm-staff-883f88fb.ts:4` |
| `cd4bb1f4-66bb-45ea-abfe-ce0c66e4ec4f` | hv-umm2.273 | `src/content/dreamsigns/purple-crystal-cd4bb1f4.ts:4` |
| `34ce9428-dda9-4efa-bacd-5ec2698561c1` | hv-umm2.273 | `src/content/dreamsigns/glow-pouch-34ce9428.ts:4` |
| `6b95d6bd-c970-4465-9536-4f21e7630d0a` | hv-umm2.274 | `src/content/dreamsigns/mushroom-caps-6b95d6bd.ts:4` |
| `1cd25b9a-b176-4c51-8349-bb4df35cbf05` | hv-umm2.274 | `src/content/dreamsigns/twisted-herbs-1cd25b9a.ts:4` |
| `22adf539-d2c9-4f33-9416-159d03a220ad` | hv-umm2.275 | `src/content/transfiguration.ts:243` |
| `980d283a-9558-4b66-84a0-fcb91fdf4ceb` | hv-umm2.275 | `src/content/transfiguration.ts:222` |
| `19f6c2c9-dd6b-4d65-9f95-f6a3486772cc` | hv-umm2.276 | `src/content/transfiguration.ts:182` |
| `a2c070ca-eacd-4cca-b69d-3d48f0787a16` | hv-umm2.276 | `src/content/transfiguration.ts:104` |
| `a66c513e-500b-4891-8c09-9641ae300ba4` | hv-umm2.276 | `src/content/transfiguration.ts:72` |
| `c3fa83af-ee3b-47cd-8112-5e5cc38821de` | hv-umm2.276 | `src/content/transfiguration.ts:201` |
| `eb4cfc5f-237a-47cd-9215-7cce3f15583f` | hv-umm2.276 | `src/content/transfiguration.ts:162` |
| `f0ff63b4-424b-4ae9-81d5-a4f6546afa3f` | hv-umm2.276 | `src/content/transfiguration.ts:142` |
| `f40df441-0e44-4122-b4d4-cdc4085a9ffb` | hv-umm2.277 | `src/content/transfiguration.ts:125` |

## Retained prefiling proof

```text
Prefiling proof {"key": "remaining-capabilities/journey", "exact_key_matches": [], "primary_readonly_matches": {"src/rules/journey/": ["hv-umm2.286", "hv-umm2.287", "hv-umm2.288", "hv-umm2.282", "hv-umm2.283", "hv-umm2.284", "hv-umm2.285", "hv-umm2.279", "hv-umm2.280", "hv-umm2.281", "hv-umm2.272", "hv-umm2.273", "hv-umm2.274", "hv-umm2.267", "hv-umm2.268", "hv-umm2.269", "hv-umm2.270", "hv-umm2.271", "hv-umm2.263", "hv-umm2.264", "hv-umm2.266", "hv-umm2.261", "hv-33id.3", "hv-umm2.598"], "src/session/providers/site-provider.ts": ["hv-umm2.598"]}, "audit_size": 130}. All listed source/plan paths are READ-ONLY; output writes only unique per-bead evidence, so no production serialization edges are required. Direct user authorization begins this bounded parallelism pass; foreign active scopes and prerequisites preserved. Initial native snapshots: /var/folders/dw/rtc6lpnx293gdfl40kv4xt5m0000gn/T/dreamtides-parallel-plan-o4tk1dcq.
```

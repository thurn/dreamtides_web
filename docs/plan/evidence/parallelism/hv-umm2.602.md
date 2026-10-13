# Read-only Sage audit: pending Phase5.2 cards

Base `677d00a827104cc6a0e821f05f9d2ab72cd0a3e0`; own worktree `/Users/dthurn/dreamtides_web/.worktrees/pending-cards-audit-602`. Exact census:115 UUIDs in32 original native scopes, all pending at this base, zero extra UUIDs. Status counts: already_planned=39, missing=2, supported=72, unresolved=2.

This audit proposes **2 new bounded capability prerequisites**, for hand-source activation/reveal and stack-card return. Native integration belongs to **hv-umm2.606** after reviewed evidence; these reports authorize no graph, Areas, assignment or production changes. Key Sifter remains one of the115 audited UUIDs in original125; active453 owns its capability and exact source implementation, so no competing future source writer is recommended. Every “supported” finding denotes inspected source/API/contract evidence, not executed runtime validation.

## Highest-impact real capability gaps

|Capability|Affected pending UUIDs|Canonical home|
|---|---:|---|
|history|14|hv-umm2.100|
|counter-dynamic|10|hv-umm2.95|
|stack-bounds|4|hv-umm2.97|
|cost-first|2|hv-umm2.104|
|alternative|2|hv-umm2.103|
|optional-target|2|hv-umm2.471|
|hand-choice|2|hv-umm2.484; Mirrorlight caller newly identified in182|
|play-condition|1|hv-umm2.105|
|deck-condition|1|hv-umm2.514|
|abandon-spark|1|hv-umm2.543|
|discard-filter-count|1|hv-adeo|
|hand-activation|1|new proposal|
|stack-return|1|new proposal|

Counts are distinct affected printed UUIDs, with overlap between families; they are not downstream gate counts. copyCardTimes affects2 planned UUIDs but is not a proven missing primitive: repeat already composes two ordinary copies. Fixed counter users Grim Recruiter/Twilight Suppressor have all required fixed-payment contracts and are excluded from the10 dynamic-counter count. Mirrorlight needs **both95 and484**: its printed hand materialization is chosen, not every/random.

## Available contracts and canonical reuse

**flow — supported**. sequence executes instructions in order; repeat locks the count once; optional confirms at resolution; ifThen reads the selected condition.
`src/engine/effects/primitives/sequence.ts:17`; `src/engine/effects/primitives/repeat.ts:15`; `src/engine/effects/primitives/optional.ts:13`; `src/engine/effects/primitives/if-then.ts:17`; `src/engine/effects/primitives/contracts/sequence.contracts.ts:7`; `src/engine/effects/primitives/contracts/repeat.contracts.ts:8`

**resources — supported**. draw(count,side,{ephemeral}), discard(count,side), erode(count,side), gainEnergy and gainPoints; empty-deck draws/erodes cause Fatigue, whole-hand discard can read handSize before its instruction.
`src/engine/effects/primitives/draw.ts:17`; `src/engine/effects/primitives/discard.ts:22`; `src/engine/effects/primitives/erode.ts:16`; `src/engine/effects/primitives/gain-energy.ts:16`; `src/engine/effects/primitives/gain-points.ts:16`; `src/engine/rules/resources.ts:93`; `src/engine/effects/primitives/contracts/draw.contracts.ts:9`; `src/engine/effects/primitives/contracts/discard.contracts.ts:9`

**foresee — supported**. foresee reads count, privately arranges its top cards and moves selected cards to void; empty deck does nothing.
`src/engine/effects/primitives/foresee.ts:20`; `src/engine/effects/primitives/contracts/foresee.contracts.ts:9`; `src/engine/effects/primitives/contracts/foresee.contracts.ts:19`

**discover — supported**. discover filter uses effective type and copiable cost; private matching deck offer, chosen hand arrival and shuffle.
`src/engine/effects/primitives/discover.ts:49`; `src/engine/effects/primitives/discover.ts:169`; `src/engine/effects/primitives/contracts/discover.contracts.ts:71`; `src/engine/effects/primitives/contracts/discover.contracts.ts:153`

**activation — supported**. activated costs use timing, prepare mandatory X before targets, plan all payments, commit, pay and persist origin/X/optional flags; standard/Fast/Interrupt are distinct.
`src/engine/dsl/builders.ts:66`; `src/engine/steps/kinds/activate.ts:68`; `src/engine/rules/costs.ts:193`; `src/engine/dsl/types.ts:471`; `src/engine/effects/primitives/contracts/store-counters.contracts.ts:180`; `src/engine/effects/primitives/contracts/abandon-cost-order.contracts.ts:1`

**select — supported**. current controller/type/another/spark/cost/challenging selectors; anyOf forms OR leaves with outer AND; bounds rechecked at resolution.
`src/engine/dsl/types.ts:104`; `src/engine/dsl/selectors.ts:132`; `src/engine/effects/interpreter.ts:632`; `src/engine/effects/primitives/contracts/selector-any-of.contracts.ts:1`; `src/engine/effects/primitives/contracts/selector-challenger.contracts.ts:1`

**values — supported**. count(character selector), filtered public void count, public hand/deck size, times/plus/locked, resolving/source stored X and retained source spark; static readers use earlier layers.
`src/engine/dsl/values.ts:40`; `src/engine/effects/interpreter.ts:581`; `src/engine/effects/primitives/contracts/value-zone-counts.contracts.ts:1`; `src/engine/effects/primitives/contracts/stored-source-x-values.contracts.ts:79`; `src/engine/effects/primitives/contracts/last-known-source-spark.contracts.ts:104`

**triggers — supported**. named/either, filtered play/materialize/discard/draw/abandon/dissolve/challengeWith/startOfTurn triggers; nth play/draw already exists; oncePerTurn consumed on the actual matched occasion; functional void zone allowed.
`src/engine/dsl/types.ts:597`; `src/engine/triggers/matcher.ts:318`; `src/engine/triggers/matcher.ts:332`; `src/engine/triggers/matcher.ts:412`; `src/engine/triggers/matcher.ts:484`; `src/engine/triggers/resolve.ts:20`; `src/engine/dsl/builders.ts:57`

**spark — supported**. gainSpark gives a retained/permanent increment; sparkModifier is live static spark; supported(...) determines adjacent front cards from a back source; sourceSpark is pre-departure effective source spark, not paid other-character spark.
`src/engine/effects/primitives/gain-spark.ts:45`; `src/engine/effects/primitives/spark-modifier.ts:22`; `src/engine/continuous/support.ts:1`; `src/engine/effects/primitives/contracts/last-known-source-spark.contracts.ts:129`

**materialize — supported**. materialize names every/top/random/self/target zone cards; zone order controls arrivals, character filter and ordinary capacity/exhausted/awakened rules; random exact cost reads resolving X and uses deterministic selection stream.
`src/engine/effects/primitives/materialize.ts:25`; `src/engine/effects/interpreter.ts:698`; `src/engine/dsl/types.ts:252`; `src/engine/dsl/types.ts:278`; `src/engine/effects/primitives/contracts/random-exact-cost.contracts.ts:80`; `src/engine/effects/primitives/contracts/zone-card-refs.contracts.ts:254`

**figments — supported**. materializeFigments accepts resolving count and printed figment subtype/spark; ordinary capacity and created-card rules apply.
`src/engine/effects/primitives/materialize-figments.ts:26`; `src/engine/rules/figments.ts:1`

**counter-fixed — supported**. storeCounters increments a source still in play; fixed counter costs spend exact stored counters, persist payment and event; after departure storage does nothing.
`src/engine/effects/primitives/store-counters.ts:21`; `src/engine/rules/costs.ts:534`; `src/engine/effects/primitives/contracts/store-counters.contracts.ts:110`; `src/engine/effects/primitives/contracts/store-counters.contracts.ts:180`

**counter-dynamic — already_planned** (hv-umm2.95). stored counter numeric reader, static live bounds, pre-departure retained count and X counter-payment preparation absent. Reuse95; fixed-counter support does not supply these.
`src/engine/dsl/types.ts:90`; `src/engine/dsl/types.ts:313`; `src/engine/dsl/types.ts:498`; `src/engine/dsl/values.ts:42`; `src/engine/rules/costs.ts:256`; `src/engine/rules/zones.ts:189`

**history — already_planned** (hv-umm2.100). current turnLog records play/draw/materialize but no declarative count/condition over past discards/dissolves/leavesPlay or matching current void cards. Reuse100, with pre-departure controller and physical identity snapshots; do not approximate by live zone counts.
`src/engine/rules/turn-log.ts:10`; `src/engine/state/types.ts:1`; `src/engine/dsl/types.ts:313`; `src/engine/dsl/types.ts:356`; `src/engine/effects/interpreter.ts:698`

**cost-offset — supported**. costModifier filters each player play and applies increases/reductions; selfCostReduction computes a live physical source reduction; card cost increases following a hand move use modifyCardCost.
`src/engine/effects/primitives/cost-modifier.ts:26`; `src/engine/effects/primitives/self-cost-reduction.ts:23`; `src/engine/effects/primitives/modify-card-cost.ts:33`; `src/engine/continuous/costs.ts:30`; `src/engine/effects/primitives/contracts/self-cost-reduction.contracts.ts:88`; `src/engine/effects/primitives/contracts/cost-composition.contracts.ts:362`

**cost-first — already_planned** (hv-umm2.104). first filtered play modifier and set-zero base semantics need canonical104; offset-only next/permanent costModifier does not encode first-this-turn nor a per-matching-card base setter.
`src/engine/effects/primitives/cost-modifier.ts:15`; `src/engine/continuous/costs.ts:43`; `src/engine/rules/turn-log.ts:23`

**cost-zero — unresolved** (hv-umm2.104). Nexus global filtered set-zero is absent. Reuse104 set-zero component by fresh scope/acceptance confirmation, or file a precise separate extension only if104 explicitly declines it. Fixed -2 is incorrect with later increases and alternative route semantics.
`src/engine/effects/primitives/cost-modifier.ts:15`; `src/engine/continuous/costs.ts:43`; `src/engine/rules/timing.ts:55`

**alternative — already_planned** (hv-umm2.103). full replacement payment route for hand/void plus conditional survivor permission and route-specific awakened entry need103; current PlayRoute costs enumerate hand/permission/offering/reclaim.
`src/engine/rules/timing.ts:66`; `src/engine/rules/timing.ts:102`; `src/engine/steps/kinds/play.ts:1`; `src/engine/dsl/types.ts:762`

**play-condition — already_planned** (hv-umm2.105). announcement-time void-event-count requirement needs105; resolving ifThen and static matching restriction cannot substitute for checked play eligibility.
`src/engine/dsl/conditions.ts:46`; `src/engine/rules/timing.ts:175`; `src/engine/effects/primitives/play-restriction.ts:26`

**optional-target — already_planned** (hv-umm2.471). single unpaid bounded or paid unrestricted target requires prepared optional-cost decision before target and payment after commit; resolution ifThen walks both targets and is not equivalent.
`src/engine/steps/kinds/play.ts:1`; `src/engine/effects/interpreter.ts:96`; `src/engine/dsl/types.ts:162`

**hand-choice — already_planned** (hv-umm2.484). private optional one-character materialization from own hand; every/random/self/top/void target are not a private exact hand choice.
`src/engine/effects/primitives/materialize.ts:16`; `src/engine/dsl/types.ts:297`; `src/engine/effects/primitives/optional.ts:13`

**deck-condition — already_planned** (hv-umm2.514). top-only matching condition and empty-deck-safe fallback draw; whole deck count/filter and normal draw Fatigue differ.
`src/engine/dsl/conditions.ts:29`; `src/engine/effects/primitives/draw.ts:17`; `src/engine/rules/resources.ts:93`

**abandon-spark — already_planned** (hv-umm2.543). capture paid character effective spark as plan X before departure; captureCost is copiable cost and sourceSpark is source, so neither substitutes.
`src/engine/dsl/types.ts:476`; `src/engine/rules/costs.ts:256`; `src/engine/steps/kinds/activate.ts:68`; `src/engine/dsl/values.ts:64`

**discard-filter-count — already_planned** (hv-adeo). resolution-local count of actual event cards discarded by this instruction; moved capture stores costs and live zone counts/history do not bind instruction-local discard type.
`src/engine/effects/interpreter.ts:820`; `src/engine/effects/interpreter.ts:590`; `src/engine/effects/primitives/discard.ts:22`; `src/engine/dsl/values.ts:50`

**discard-batch — already_planned** (hv-umm2.453). active453 owns the one-or-more discard occasion and captured count for Key Sifter, including its module. Staging lacks it; private active branch outcome unknown; no ownership/edge change.
`src/engine/dsl/types.ts:628`; `src/engine/triggers/matcher.ts:340`; `src/engine/triggers/matcher.ts:495`

**stack-bounds — already_planned** (hv-umm2.97). stack selector filters only controller/type/preventability; cost/spark upper bounds absent. Reuse97 for prevent cards and Veilpiercer.
`src/engine/dsl/types.ts:146`; `src/engine/dsl/selectors.ts:216`; `src/engine/effects/primitives/prevent.ts:1`

**stack-return — missing**. Veilpiercer needs typed stack-card-to-hand primitive extension. Existing returnToHand CharacterRef and returnFromVoid zone guard cannot name its chosen stack card; low-level relocation already cleans matching stack card.
`src/engine/effects/primitives/return-to-hand.ts:9`; `src/engine/effects/primitives/return-from-void.ts:21`; `src/engine/effects/interpreter.ts:672`; `src/engine/rules/zones.ts:140`; `src/engine/rules/zones.ts:497`

**hand-activation — missing**. Vaultbreaker needs a hand source activation and forced reveal of that physical source as payment. Existing generic reveal cost picks arbitrary matching hand cards; source reduction reuses changeCardCost via SelfSpec extension, not a new cost primitive.
`src/engine/dsl/types.ts:549`; `src/engine/dsl/builders.ts:77`; `src/engine/rules/activation.ts:164`; `src/engine/rules/costs.ts:217`; `src/engine/dsl/types.ts:515`; `src/engine/effects/primitives/modify-card-cost.ts:89`; `src/engine/effects/interpreter.ts:760`

**copy — supported** (hv-umm2.99). repeat(2,copyCard(triggeringCard())) calls ordinary copyOnStack twice against original, retaining original X/optionalPaid and per-copy retargeting. delayed/floating event filters are staged.99 remains its original validation owner; source composition is not executed behavior proof.
`src/engine/effects/primitives/repeat.ts:15`; `src/engine/effects/primitives/copy-card.ts:19`; `src/engine/rules/copies.ts:30`; `src/engine/effects/primitives/floating-trigger.ts:22`; `src/engine/effects/primitives/floating-trigger.ts:54`; `src/engine/effects/primitives/contracts/repeat.contracts.ts:8`; `src/content/cards/echoes-of-eternity-d24ea640.ts:26`

**reclaim — supported** (hv-umm2.372). printed explicit reclaim, grantReclaim filtered void targets/every/subject and expiry are staged. Known372 retains effective-keyword loss repair as a final acceptance dependency where relevant.
`src/engine/effects/primitives/grant-reclaim.ts:54`; `src/engine/rules/timing.ts:46`; `src/engine/rules/timing.ts:102`; `src/engine/effects/primitives/contracts/grant-reclaim.contracts.ts:1`; `src/engine/effects/primitives/contracts/grant-reclaim-subject.contracts.ts:1`

**permission — supported**. playFromZone void/deck permission; oncePerTurn static allowance; identified current deck top required. revealDeckTop condition and separately stated permission apply independently.
`src/engine/effects/primitives/play-from-zone.ts:59`; `src/engine/continuous/permissions.ts:33`; `src/engine/continuous/permissions.ts:64`; `src/engine/effects/primitives/reveal-deck-top.ts:14`; `src/engine/effects/primitives/contracts/once-per-turn-play-from-zone.contracts.ts:1`; `src/engine/effects/primitives/contracts/play-from-deck.contracts.ts:1`

**alltypes — supported**. giveAllTypes static layer2 self works with every subtype selector/filter; current earlier layer reading applies.
`src/engine/effects/primitives/give-all-types.ts:24`; `src/engine/continuous/characteristics.ts:1`

**returns — supported**. returnAllButOne chooses keep without targeting, counts successful hand arrivals only; floating dissolve -> returnFromVoid(triggeringCard()) can return the actual subject; ordinary replacements retained.
`src/engine/effects/primitives/return-all-but-one.ts:26`; `src/engine/effects/primitives/return-from-void.ts:20`; `src/engine/effects/primitives/contracts/return-all-but-one.contracts.ts:100`; `src/engine/effects/primitives/contracts/return-from-void.contracts.ts:257`

**shuffle — supported**. shuffleInto(every hand,every void) moves actual cards and uses deterministic side shuffle; created/reclaimed replacements and knowledge forgetting included.
`src/engine/effects/primitives/shuffle-into.ts:40`; `src/engine/effects/primitives/contracts/shuffle-into.contracts.ts:1`

**banish — supported**. banish selected current character; subtype and anyOf alternative apply; fixed void banish payment can name either public void.
`src/engine/effects/primitives/banish.ts:15`; `src/engine/rules/costs.ts:219`; `src/engine/effects/primitives/contracts/banish-from-any-void-cost.contracts.ts:1`

**control — supported**. gainControl uses X-bounded enemy target and ordinary controller transfer/capacity.
`src/engine/effects/primitives/gain-control.ts:19`; `src/engine/dsl/selectors.ts:132`; `src/engine/effects/primitives/contracts/stored-source-x-values.contracts.ts:96`

**whisper-payment — unresolved**. A deck-count>=3 guard plus optional(sequence(erode(3),putInDeck(sourceVoid,top))) may compose the resolving erode payment; exact affordability/Fatigue/payment semantics require D10/scenario proof. Do not add a speculative erode-payment framework.
`docs/rules.md:877`; `src/engine/dsl/conditions.ts:46`; `src/engine/effects/primitives/optional.ts:13`; `src/engine/effects/primitives/erode.ts:16`; `src/engine/effects/primitives/put-in-deck.ts:66`; `src/engine/effects/primitives/pay-to.ts:7`

## New prerequisite proposals and exact extension seams

**A. Hand source activation with exact source reveal (one UUID, original191).** Vaultbreaker `c97b0a5b-64d0-480f-8db7-3fde93738d86`, module `src/content/cards/vaultbreaker-c97b0a5b.ts:8`, prints two colon costs: abandon a controlled character and reveal this card from hand; then reduce that physical card cost1. ActivationZone at `dsl/types.ts:549` excludes hand, activated builder at `dsl/builders.ts:77` only preserves void, and `rules/activation.ts:164` never enumerates hand. Generic reveal cost at `rules/costs.ts:217` allows any matching hand card, so it cannot enforce this exact source. Source reduction reuses existing changeCardCost layer6 operation: minimally admit SelfSpec alongside SubjectSpec at `modify-card-cost.ts:89`, using existing `resolveCards` self case at `interpreter.ts:760`; do not create a duplicate cost primitive or use static selfCostReduction. Activated env subject is not automatically its source.

Proposed implementation scope after fresh606 admission: `dsl/types.ts` ActivationZone + one source-reveal payment form, `dsl/builders.ts` hand option/reveal-self builder, `rules/activation.ts` source enumeration, `rules/costs.ts` exact source candidates/payment/feasibility, `modify-card-cost.ts` source-reference widening, a new coherent synthetic contract module under contracts. Retain omitted zone as play, existing void options and arbitrary reveal-cost semantics. Use existing activate intent/source/origin/stack transport and physical-ID logs if sufficient. Read-only consumers proved at `steps/kinds/activate.ts:68`, `rules/legality.ts:81`, `rules/decision.ts:79`, `engine-battle-view-model.ts:255,655,825,966`, and saved fold; only widen these after actual importer/body evidence. A hand action must be available privately to its holder before commit, reveal source once with committed payment, persist suspended source choices without opponent printing leaks, expose normal visible activation affordance after adoption, and retain source cost change across normal play. Cancel/invalid/stale/reload/replay/target-cost exclusions/partial payment rollback and both holders require synthetic tests; ordinary arbitrary reveal behavior unchanged. New prompt/role/status/change unions only if necessary must get exhaustive presentation/policy/lab/saved validation registrations; existing cardCost union should be reused.

**B. Return a bounded played stack card to hand (one UUID, original190).** Veilpiercer `95d37f76-eb3d-4bcd-a8af-0ae37feabd4d`, module `src/content/cards/veilpiercer-95d37f76.ts:8`, needs opponent played card<=3/4 to hand and successful recipient card costs2 more.97 owns the missing bounds. `return-to-hand.ts:9,16` uses CharacterRef/resolveCharacters; `return-from-void.ts:21` explicitly rejects stack. Add a typed stack-target CardRef extension of return or a narrow dedicated primitive, target hook `cardTarget`, resolution via `resolveStackTargets`/`resolveCards`, and existing `zones.returnToHand`. `zones.ts:140` already removes that matching stack card; `zones.ts:497` invokes ordinary replacement relocation and announced arrival. Thus zones/stack need no invented cleanup rewrite. `modifyCardCost(return...,{increase:2})` captures actual successful hand arrivals (`modify-card-cost.ts:46`), so created/reclaimed/stale targets must acquire no spurious cost change.

Proposed bounded scope: `return-to-hand.ts` ref/target/resolver widening or new typed stack-return module, its own synthetic contracts, additive primitive registration/exports if needed; use canonical97 bounds first and keep `rules/zones.ts`, `rules/stack.ts`, interpreter and modify-card-cost bodies read-only unless actual tests show a further problem. Source already public on stack; hand move follows ordinary knowledge/owner-or-explicit-opponent-hand rules. Preserve unpreventable card eligibility (return is not Prevent), activated stack ability exclusion, foreign ownership versus controller, created/reclaimed replacements, original stack order, target departure/reentry and noLegalTarget, successful arrival cost increase, cancellation/suspended trigger/save/replay/rollback and both actors. Printed explicit “opponent hand” for a foreign-owned opponent stack card needs D10; current low-level return means owner hand, so the test must settle whether moveToHand named recipient is required, not silently assume ownership. Existing named-hand return precedent is `return-from-void.ts:36` and `zones.ts:256`.


**Required existing hand interaction seam for A (source-proven).** `src/battle/components/EngineBattleScreen.tsx:485` calls `handPlayAction`, and `:558` routes hand taps there; `engine-battle-view-model.ts:791` checks only play actions and returns null for an activation-only hand source. The generic activation map/ring at `:255,655` can already represent a physical hand source, and the existing ability chooser at `:966` represents its activations, but currently offers only a void play alongside them. Admit a narrow hand-tap/chooser adaptation plus owning public adapter contracts: reuse the current chooser, show hand play when available with the same physical source, and keep hand drop at screen`:559` using ordinary play routing. No new component/redesign is implied. Fresh Areas/body audit protects active hv-33id.13 pointer workflow. Both desktop/mobile tests must reach hand activation when printed play is unaffordable and when play plus activation are both available, preserving private source candidates, cancellation/reload and empty Caps. Any UI implementation follows Cumulus.

**Additional reuse consumer:** Mirrorlight Architect UUID`ccbefadc-aab8-4f8c-a705-07bd70c91731` (original182) needs484 chosen hand materialization as well as95 dynamic count. Propose182 ->484 runtime after fresh scope confirmation; extend484's bound input to accept95's public stored-count value if required. Keep a single canonical private hand-choice owner, no duplicate chooser. Fixed2/3 acceptance examples alone do not prove the dynamic bound.

**Proposed filing metadata:** new hand seam `improvement=hand-source-activation-reveal-cost/phase-5`; new stack seam `improvement=return-stack-card-to-hand/phase-5`; each `found_by=hv-umm2.602`, respective consumer191/190, intended project dreamtides_web, and actual606 native filing identity recorded when filed. These are suggested keys only; fresh full metadata/Areas checks and cold review precede admission.

**Duplicate/Areas proof.** `sage-findings.json` contains every primary-path match and semantic match against all134 admitted+intended unfinished records supplied by the parent, plus exact original32 scope records. Search terms matched original consumer/audit records but no equivalent engine capability. Shared path matches are not duplicate causes. Active453 holds parts of cost/activation-adjacent plumbing; do not change its assignment/edges/source.606 must re-query primary Areas and `improvement`/`found_by`/phase key metadata natively, compare exact bodies, file missing prerequisites before project admission, and verify exact runtime/serialization edges/cycles. Existing unfinished serialized work precedes the new writer; no blocker is introduced merely to read code.

## Graph and final acceptance

Runtime edges retained/reused:190 ->100 and97 plus new stack-return;191 ->100 plus new hand-source activation;182 ->95 and (newly identified consumer)484;172 ->543;162 ->adeo;148 ->484;150 ->514;139 ->471;196 ->103;202 ->104; histories ->100; dynamic counters ->95. Proposed192 ->104 only if104’s set-zero scope is adopted. Existing broad edges cannot be removed by this audit. Enumerated source support does not close a canonical primitive or its original card scope.

The original32 beads are open/unassigned in the saved native observation; parent independently confirmed their exact UUIDs. Current broad routing Areas and ordering are authoritative until606 adopts a new graph. Serialization is for non-additive body edits; new leaf modules/scenario files/evidence and additive registration entries may be independent. Each new engine form retains core review and its exact synthetic contract module; every original acceptance join and card checkpoint210, Phase5 gate46 and AI-last remain. Do not close original beads using downstream gate counts or claim early authored/pending/D36 completeness.

Every delivered leaf scope retains all its printed base/amplified abilities and verifiedText, D20 scenarios when composition is exceeded, weighted300fuzz under the machine heavy lease/two workers, preflight/sweep each UUID/variant/actor, SHA256 D21 sample plus every new prompt/status/visual effect judged on desktop/mobile, empty Caps and UUID logs, review/Knip, proportionate full architecture verification, independent cold review under the temporary Sol route, exact Conventional Commit/Tollgate certification/promotion. Original acceptance joins retain full coverage/final validation of their complete UUID scope; no staged API presence substitutes for this.

## Independently writable future leaf cohorts

These exact supported subsets can become separate native leaves only after606 freshly confirms claims/Areas and settles original acceptance joins. They touch listed card modules, a fresh own scenario slug when split, and own evidence; existing original scenario and all shared engine/UI/rules bodies are read-only. No new source, graph or scope is modified here.

|Original native|Exact UUID subset|Exact module scope|
|---|---|---|
|hv-umm2.124|69d9e550-eacc-49f2-8cc5-30b8940c9eed, a031eada-2c47-49c6-8c19-d2fe85f8ce97, 4fac8060-2644-409f-806b-c6a845ef6f31, 97bc4b48-9ea1-40e9-94bb-a88ae4f55d83, caaee8a9-0c22-41b4-950f-4c1131b98221, 5c5e316f-c499-4991-9733-bb6e3d826d7e|`src/content/cards/mystic-boatman-69d9e550.ts`, `src/content/cards/revelation-explorer-a031eada.ts`, `src/content/cards/dreamscatter-4fac8060.ts`, `src/content/cards/epiphany-unfolded-97bc4b48.ts`, `src/content/cards/celestial-reverie-caaee8a9.ts`, `src/content/cards/harvest-the-forgotten-5c5e316f.ts`|
|hv-umm2.125|3cc9253a-4db6-4b02-92d6-a37805d192fb, 45e3d703-7efc-4dc2-b854-33211f8d4f11, 84fd9c6e-79c6-4b65-878b-1534f3e4b220, 8367b757-c3d2-4c22-9043-8baadee1c5ba|`src/content/cards/ancient-descent-3cc9253a.ts`, `src/content/cards/gleam-below-45e3d703.ts`, `src/content/cards/ecliptic-vantage-84fd9c6e.ts`, `src/content/cards/sky-legion-invoker-8367b757.ts`|
|hv-umm2.126|b1bea643-1a7b-4e5e-b072-7174d3405421, f07dfe42-566c-4e91-a250-9e2781e9d06f, 64ce3ebc-c0ac-4dd3-95ca-eeb67530187c, 1b4d2adc-64ab-4020-bae6-b35321898bf0, 382dafa1-f8ff-47b4-9151-15b84067a5b2|`src/content/cards/silent-observer-b1bea643.ts`, `src/content/cards/melodist-of-the-finale-f07dfe42.ts`, `src/content/cards/bloom-guard-64ce3ebc.ts`, `src/content/cards/harbor-warden-1b4d2adc.ts`, `src/content/cards/firebrand-saboteur-382dafa1.ts`|
|hv-umm2.127|965ce3b2-a722-475c-99c5-5b35685d2404, bbf83d18-81b6-48c8-886f-4b9f0feb599f, 1d92e103-8415-433d-97d6-ac8a83660b34, e455225f-c444-44a2-8796-805cae2b755f, c750af2e-8185-4af0-bb38-4a41430c71b3|`src/content/cards/dreamvale-monarch-965ce3b2.ts`, `src/content/cards/frost-visionary-bbf83d18.ts`, `src/content/cards/searcher-in-the-mists-1d92e103.ts`, `src/content/cards/oracle-of-shifting-skies-e455225f.ts`, `src/content/cards/fangbound-c750af2e.ts`|
|hv-umm2.128|f860e815-3ed9-463d-ac4d-ed8d2778f8ad, bbf316f6-1fd4-40f5-aacd-d9ed8a5c58ea, 6b739127-1a23-4c5d-877a-8829dd7a8b8c, a952f833-825a-435f-82b1-8d85f872d274|`src/content/cards/night-stalker-f860e815.ts`, `src/content/cards/cloudstrider-bbf316f6.ts`, `src/content/cards/entropy-spike-6b739127.ts`, `src/content/cards/essence-devourer-a952f833.ts`|
|hv-umm2.129|aba40bc6-3e9e-4874-be8a-6984cbf13146, 0458658d-7e02-4286-9249-93674d16620b, 448abb34-d77d-40ac-8292-58db03176247, 6a3bb4ae-a537-4b79-8bdd-5093f05ec07a, fbf725ca-8837-46d4-970c-922153e27b6e|`src/content/cards/the-forsaker-aba40bc6.ts`, `src/content/cards/iron-pharaoh-0458658d.ts`, `src/content/cards/shadowbinder-448abb34.ts`, `src/content/cards/blood-reaver-6a3bb4ae.ts`, `src/content/cards/infernal-ascendant-fbf725ca.ts`|
|hv-umm2.132|f7b135ea-4894-46ab-b41d-ba2f74b070a1, 1434440c-c86f-4b7d-83e7-3bd1f7dde63e, 08fe3190-f559-4152-941d-33ec4180f509, b4838d67-f055-4fd3-a64d-0a4d2b6678cc|`src/content/cards/a-new-adventure-f7b135ea.ts`, `src/content/cards/pulse-of-sacrifice-1434440c.ts`, `src/content/cards/data-pulse-08fe3190.ts`, `src/content/cards/thought-augury-b4838d67.ts`|
|hv-umm2.133|50267984-eaa3-415e-a23f-581c54b0ad2d, 46783333-78f9-4146-a8ec-0d1b81e1bf2f, f8678d24-f18b-4c94-a6c2-50efb8193b7f, f1452b45-51dc-453a-916e-88bd9d29e36e|`src/content/cards/rebirth-50267984.ts`, `src/content/cards/emerald-guardian-46783333.ts`, `src/content/cards/ossuary-offering-f8678d24.ts`, `src/content/cards/the-calling-night-f1452b45.ts`|
|hv-umm2.139|f4c570d4-c500-4b66-ad97-e8ccbef19392|`src/content/cards/soul-channeling-f4c570d4.ts`|
|hv-umm2.148|1ce0f0f2-4b1a-483d-b93b-74c36e946a08, 409147ec-d959-4f66-b126-564702e2cd4a|`src/content/cards/the-deathsworn-1ce0f0f2.ts`, `src/content/cards/veil-of-the-wastes-409147ec.ts`|
|hv-umm2.150|041fafeb-f159-4aba-90c2-3ce4b3038bdc, 28c3ef90-c0dc-4b85-92c8-40758b99e0ce|`src/content/cards/gloomantler-041fafeb.ts`, `src/content/cards/petal-seer-28c3ef90.ts`|
|hv-umm2.156|f7ffe999-685d-4ea2-85de-2e567eb2a042, 8a6fc6ea-9a88-441e-bdc2-d40dfec37481, 0d848dc8-a1a2-410b-b19a-b5f65375e141|`src/content/cards/key-to-the-moment-f7ffe999.ts`, `src/content/cards/fading-farewell-8a6fc6ea.ts`, `src/content/cards/path-to-redemption-0d848dc8.ts`|
|hv-umm2.162|8c117d3f-09af-4312-9897-694a76bd23c6, 151b80b1-0a3f-48d4-9c85-99a9c274fd7f, cbabe603-1333-42bd-85c0-555c664b60b3|`src/content/cards/worldbreacher-8c117d3f.ts`, `src/content/cards/ethereal-army-151b80b1.ts`, `src/content/cards/silent-mourner-cbabe603.ts`|
|hv-umm2.172|d6ec65a2-d61e-4617-bdd0-75d5573c063d, 5639053e-1fe3-4a42-b9c3-3fdf894bfab6, 747859fb-6fca-49fc-a653-08011a9bb44c|`src/content/cards/ruthless-conqueror-d6ec65a2.ts`, `src/content/cards/ashen-remnant-5639053e.ts`, `src/content/cards/forsworn-champion-747859fb.ts`|
|hv-umm2.179|55340736-7fc5-4555-8f47-081d770a6e8d, cb2d9f1e-8888-44c7-9918-57b2ec8c78e1, f3282494-2fcf-4c06-bfbe-3474b28aa87a, 4124a05c-b6dd-4334-b202-59fa17d77668|`src/content/cards/barrage-specialist-55340736.ts`, `src/content/cards/wired-duelist-cb2d9f1e.ts`, `src/content/cards/oathbound-pair-f3282494.ts`, `src/content/cards/unbroken-4124a05c.ts`|
|hv-umm2.182|cf173b05-7bf2-465b-91e2-41f213c536d1|`src/content/cards/grim-recruiter-cf173b05.ts`|
|hv-umm2.183|60feb0d0-89b8-48fc-b01a-ce54e2c9941f|`src/content/cards/twilight-suppressor-60feb0d0.ts`|
|hv-umm2.190|4ef8b2e7-3525-4c25-aa30-f751467f182f|`src/content/cards/cosmic-puppeteer-4ef8b2e7.ts`|
|hv-umm2.191|21965e95-0c8c-470c-a1e1-06d7b87a8d00, 6da831c8-6fda-4078-9f2b-873db2416aad|`src/content/cards/echo-architect-21965e95.ts`, `src/content/cards/nullifier-6da831c8.ts`|
|hv-umm2.192|8bf53fe6-8a25-401e-9a99-84343a026bb0, 5b2b2188-b9f0-4b3b-9185-26a820d343c7|`src/content/cards/exile-8bf53fe6.ts`, `src/content/cards/resonance-surveyor-5b2b2188.ts`|
|hv-umm2.194|c32ef131-d283-4bf1-bf65-2d5e5d232168, 7e2f2ac0-4e3c-4520-80c6-c830581b40de|`src/content/cards/titan-of-forgotten-echoes-c32ef131.ts`, `src/content/cards/dark-lord-s-champion-7e2f2ac0.ts`|
|hv-umm2.196|3d1fadf6-42e5-4d03-9a72-9bc25968c2b9, 401fdd0a-356b-49c1-806d-d50617b084d2, 40b44ed7-d737-455b-bd42-e617a263b110|`src/content/cards/sky-voyager-3d1fadf6.ts`, `src/content/cards/spirit-of-the-lightgrove-401fdd0a.ts`, `src/content/cards/soulcleft-spinner-40b44ed7.ts`|
|hv-umm2.202|c8579b20-95ff-4b1d-b4c6-6bd049fc4760, eed92573-8052-494c-adae-9838de5375a1, 6497d8b1-85b8-486d-99e2-5c141486d508|`src/content/cards/ghostlight-wolves-c8579b20.ts`, `src/content/cards/blood-moon-triad-eed92573.ts`, `src/content/cards/dragonward-6497d8b1.ts`|
|hv-umm2.99|fb967cc1-4199-4a08-8070-724e07cebea5, c7c95f67-a838-4e39-879c-cfbf0591540c|`src/content/cards/entropy-cascade-fb967cc1.ts`, `src/content/cards/cosmonaut-of-tides-c7c95f67.ts`|

Primitive owners95/97/100/103/104/105 keep their own leaves unless606 splits explicitly.99 can be a composition-first original full two-card leaf after fresh native narrowing/rules confirmation; it still retains core review and all original QA. Active453/Key Sifter is omitted from every proposed future cohort. Any remaining missing/unresolved clause waits for its canonical capability/scenario/rule settlement, not an unsupported approximation.

## Exhaustive115-row printed clause/capability matrix

Full immutable base/amplified strings, exact module text lines/hashes, per-row native scopes, and capability contracts are in `sage-findings.json`. “B/A” analysis below accounts for every amplified text as well as base; numerical alternatives follow base/amplified printed order. Each row’s capability keys map to exact source bodies above.

|#|UUID / native|Classification / capability keys|B/A clause analysis|
|---:|---|---|---|
|0|c8579b20-95ff-4b1d-b4c6-6bd049fc4760 / hv-umm2.202|supported / spark,values,activation,select|Support spirit +2; exhaust -> energy per controlled spirit.|
|1|eed92573-8052-494c-adae-9838de5375a1 / hv-umm2.202|supported / activation,values,resources|Exhaust -> energy per controlled spirit.|
|2|d95533f4-7809-44a8-a882-7675c61cee1c / hv-umm2.202|already_planned / cost-first|First warrior in each turn reduction3; not a permanent next-card modifier.|
|3|6497d8b1-85b8-486d-99e2-5c141486d508 / hv-umm2.202|supported / cost-offset,values,spark,select|Self live warrior-count reduction; supported warriors +3.|
|4|3d1fadf6-42e5-4d03-9a72-9bc25968c2b9 / hv-umm2.196|supported / alltypes,triggers,resources|All types; Dawn gain1/2.|
|5|401fdd0a-356b-49c1-806d-d50617b084d2 / hv-umm2.196|supported / alltypes,reclaim|All types; explicit Reclaim0.|
|6|a30a5fdc-a6ec-4289-89cf-40f5cbe6fbaa / hv-umm2.196|already_planned / alternative|Survivor condition; hand OR void route1; amplified chosen-route awakened entry must retain payment provenance.|
|7|40b44ed7-d737-455b-bd42-e617a263b110 / hv-umm2.196|supported / triggers,banish,select|Materialized enemy warrior; amplified warrior OR monster.|
|8|4ef8b2e7-3525-4c25-aa30-f751467f182f / hv-umm2.190|supported / triggers,control,values,select|Materialized enemy copiable cost<=source paid X; X comes from card announcement.|
|9|95d37f76-eb3d-4bcd-a8af-0ae37feabd4d / hv-umm2.190|missing / triggers,stack-bounds,stack-return,cost-offset|Materialized opponent played card cost<=3/4; named opponent-hand versus owner must settle; successful arrival cost increase2.|
|10|874d5e8f-4e12-4426-a2e7-1ab761d2ca12 / hv-umm2.190|already_planned / history,resources,cost-offset|Played-card count includes this event; draw ephemeral each; set drawn-card base0 until Ending.|
|11|29d25251-8b42-4d3d-97e6-6c3abaabd9a2 / hv-umm2.190|already_planned / history,resources,flow|Choose player once; each played card including self makes chosen player erode2.|
|12|21965e95-0c8c-470c-a1e1-06d7b87a8d00 / hv-umm2.191|supported / cost-offset,triggers,copy|Own events increase1; every own actual event play copied once.|
|13|cd4d689d-1442-4a19-8e6a-182b425d066d / hv-umm2.191|already_planned / history,triggers,figments,activation,foresee|Night intervening controlled character left-play history; figment1/2; energy1+abandon another -> foresee1.|
|14|c97b0a5b-64d0-480f-8db7-3fde93738d86 / hv-umm2.191|missing / hand-activation|Abandon a character plus reveal this exact hand source; repeated permanent source reduction1.|
|15|6da831c8-6fda-4078-9f2b-873db2416aad / hv-umm2.191|supported / cost-offset|Events cost1 more for each player: compose both player-relative modifiers.|
|16|fd5b3e85-ad7b-4d87-b4db-cd6ba0e6d277 / hv-umm2.192|unresolved / cost-zero|All qualifying own character plays base0; global setter semantics remain canonical104 scope confirmation.|
|17|8bf53fe6-8a25-401e-9a99-84343a026bb0 / hv-umm2.192|supported / cost-offset,values,select|Own event live character-count reduction; dissolve one enemy.|
|18|3fdf265c-8aa2-4367-9fee-43e242bdb462 / hv-umm2.192|already_planned / history,resources,flow|Draw2 then discard1 unless another EVENT already played this turn; current event is excluded from the other count.|
|19|5b2b2188-b9f0-4b3b-9185-26a820d343c7 / hv-umm2.192|supported / triggers,resources,flow|Actual second card play in turn -> draw1 then discard1; nth trigger already staged.|
|20|2690912e-0295-4d12-a603-5946d37902d3 / hv-umm2.192|already_planned / history,figments,reclaim|Played count including self -> shadow2 figments; Reclaim2.|
|21|2d0a7c62-29b5-433b-9b0e-c3dd7630ccc7 / hv-umm2.193|already_planned / history,figments|Played count including self -> ethereal1/2.|
|22|d217303e-b115-484a-b22c-0e44d5701389 / hv-umm2.193|already_planned / history,resources|Cannot be prevented keyword; 2points per played card including self.|
|23|2305722e-59c1-47d7-9e05-dc1c32c946a2 / hv-umm2.193|already_planned / history,triggers,resources|Each actual play -> points per OTHER played cards; snapshot occasion or resolution rule must settle.|
|24|70306382-ac0d-4b08-843a-23efb3835c94 / hv-umm2.193|already_planned / history,materialize,triggers,reclaim|Only current-void characters discarded this turn; own discard grants reclaim0 subject.|
|25|54471b31-4449-453d-9a6e-814d6225520a / hv-umm2.194|already_planned / history,materialize|Only current-void cost<=2 characters dissolved this turn.|
|26|fed69d6e-acb5-40fb-b416-e6ef6c0e63fb / hv-umm2.194|already_planned / history,materialize|Up to3 chosen current-void characters dissolved this turn, physical identities; targeted history filter needed.|
|27|c32ef131-d283-4bf1-bf65-2d5e5d232168 / hv-umm2.194|supported / triggers,materialize|Void functional source; own second card trigger materializes self, awakened amplified.|
|28|7e2f2ac0-4e3c-4520-80c6-c830581b40de / hv-umm2.194|supported / triggers,materialize|Void functional source; own third draw materializes self.|
|29|691883df-63d8-4664-a1fe-d5f3b5becd11 / hv-umm2.184|already_planned / activation,counter-fixed,counter-dynamic,triggers,resources|Energy2+exhaust store1/2; Dawn gain energy per current stored count.|
|30|764b62f6-6af9-40ad-8d1f-653cc1a11030 / hv-umm2.184|already_planned / activation,counter-fixed,counter-dynamic,select|Energy3 store1/2; X counters prepared before <=X spark target.|
|31|374ec185-b0f7-40e6-9988-09e96abccebe / hv-umm2.184|already_planned / triggers,counter-fixed,counter-dynamic,materialize|Own character play store1/2; X counter payment -> exact-cost random opponent-deck character; deterministic private deck selection, public arrival.|
|32|55340736-7fc5-4555-8f47-081d770a6e8d / hv-umm2.179|supported / triggers,select,spark|Own Challenge -> each other currently challenging character gains1/2.|
|33|cb2d9f1e-8888-44c7-9918-57b2ec8c78e1 / hv-umm2.179|supported / triggers,spark,values,select|Dawn own gain1/2; Dissolved target ally receives departed source effective spark.|
|34|f3282494-2fcf-4c06-bfbe-3474b28aa87a / hv-umm2.179|supported / triggers,spark,select|Either Materialized or Dawn -> ally gain1/2.|
|35|4124a05c-b6dd-4334-b202-59fa17d77668 / hv-umm2.179|supported / triggers,spark|Each individual discard -> self gains1/2, not batch count.|
|36|ccbefadc-aab8-4f8c-a705-07bd70c91731 / hv-umm2.182|already_planned / triggers,counter-fixed,counter-dynamic,activation,materialize,hand-choice|Dawn store1/2; Fast exhaust -> one hand character<=stored count requires exact hand-choice seam484 as well as95.|
|37|d89f4c33-ffd3-4313-8106-0a9f7013cad8 / hv-umm2.182|already_planned / activation,counter-fixed,counter-dynamic,resources|Energy1+abandon another stores1; self abandon -> points equal pre-departure stored counters.|
|38|cf173b05-7bf2-465b-91e2-41f213c536d1 / hv-umm2.182|supported / activation,counter-fixed,figments|Abandon controlled character store1; energy2+fixed2counters -> two warrior1 figments. Dynamic95 API not needed.|
|39|60feb0d0-89b8-48fc-b01a-ce54e2c9941f / hv-umm2.183|supported / triggers,counter-fixed,activation,resources|Own character play store1; fixed1counter+abandon controlled character -> point1. Dynamic95 API not needed.|
|40|8855e20c-e23f-4499-a5e8-a7a46ff81d2b / hv-umm2.183|already_planned / activation,counter-fixed,counter-dynamic,select|Exhaust store1; self abandon -> all characters cost<=pre-departure stored count, non-targeted.|
|41|78673e2b-a6d1-43de-8850-3d3327de5cc6 / hv-umm2.183|already_planned / spark,counter-dynamic,activation,banish,counter-fixed|Supported characters live +stored count; energy1+banish character from either public void -> store1.|
|42|d6ec65a2-d61e-4617-bdd0-75d5573c063d / hv-umm2.172|supported / triggers,spark,activation,resources|Controlled warrior dissolved lookback -> self gain1; exhaust+abandon warrior -> point1.|
|43|5639053e-1fe3-4a42-b9c3-3fdf894bfab6 / hv-umm2.172|supported / spark,values,activation,resources|Self live +own void character count; abandon another -> erode1.|
|44|747859fb-6fca-49fc-a653-08011a9bb44c / hv-umm2.172|supported / activation,spark|Interrupt abandon warrior -> self gain1.|
|45|82749215-ed35-44e3-a745-72ca76036c7c / hv-umm2.172|already_planned / activation,abandon-spark,spark,select|Interrupt abandon character -> controlled target gains paid character effective spark captured before departure.|
|46|8c117d3f-09af-4312-9897-694a76bd23c6 / hv-umm2.162|supported / activation,figments|Exhaust -> warrior1/2 figment.|
|47|58f96494-87ec-4145-9e1c-95951d0ab711 / hv-umm2.162|already_planned / resources,values,discard-filter-count,figments,flow|Announced energy X; drawX then discardX; ethereal1/2 count is actual EVENT discards from that instruction only.|
|48|151b80b1-0a3f-48d4-9c85-99a9c274fd7f / hv-umm2.162|supported / values,figments|Announced energy X -> X ethereal1/2 figments.|
|49|cbabe603-1333-42bd-85c0-555c664b60b3 / hv-umm2.162|supported / triggers,figments,resources|Materialized ethereal1/2; each controlled character dissolved -> point1 including source if applicable.|
|50|f7ffe999-685d-4ea2-85de-2e567eb2a042 / hv-umm2.156|supported / returns|Choose one keep; return others in board order; draw per actual hand arrival.|
|51|8a6fc6ea-9a88-441e-bdc2-d40dfec37481 / hv-umm2.156|supported / triggers,returns|Floating until Ending: each own controlled character dissolve -> return its actual void subject to its proper hand.|
|52|0d848dc8-a1a2-410b-b19a-b5f65375e141 / hv-umm2.156|supported / reclaim|Snapshot current own-void cards gain plain Reclaim until Ending; does not blanket future arrivals without printed continuous grant.|
|53|5931e388-1856-4e5a-85f8-a5aa34f867b1 / hv-umm2.156|unresolved / reclaim,triggers,whisper-payment|Chosen own-void event gains plain Reclaim; own turn-start void functional source may pay erode3 to put physical source on deck top.|
|54|1ce0f0f2-4b1a-483d-b93b-74c36e946a08 / hv-umm2.148|supported / triggers,materialize,select|Void source hears own materialized character spark=1/base, <=1/amplified; materialize self.|
|55|409147ec-d959-4f66-b126-564702e2cd4a / hv-umm2.148|supported / triggers,materialize|Void source hears own materialized cost<=2 character; return source void->play by materialize, no play action.|
|56|87f075b1-b058-4570-a75f-c4f8f544e192 / hv-umm2.148|already_planned / triggers,hand-choice|Materialized optional exact private hand character<=2/3.|
|57|041fafeb-f159-4aba-90c2-3ce4b3038bdc / hv-umm2.150|supported / permission,values|Once-per-turn static own-void character normal-cost play while own hand<=1/2.|
|58|1521c06c-f5ac-4d29-a6bd-7030b63a3c3e / hv-umm2.150|already_planned / triggers,deck-condition,materialize,resources|Materialized top card type+cost<=2 -> materialize; otherwise draw exact top; empty deck causes no Fatigue.|
|59|28c3ef90-c0dc-4b85-92c8-40758b99e0ce / hv-umm2.150|supported / permission,values|Conditional reveal at own character count>=3/2; independent permission to play identified current top character.|
|60|11b4ae1d-ae2a-41a6-9cdc-70c6d69803d6 / hv-umm2.139|already_planned / optional-target,select|Optional additional energy3 expands one enemy spark<=2/3 to any enemy; no payment before target choice.|
|61|8a971ba7-9dfb-45be-bfbb-bf5e4f11974a / hv-umm2.139|already_planned / optional-target,select|Optional discard1 expands one enemy copiablecost<=2/3 to any enemy; exclude play source and chosen target from payment.|
|62|f4c570d4-c500-4b66-ad97-e8ccbef19392 / hv-umm2.139|supported / activation,select|Mandatory additional points2 plus printed energy; dissolve enemy; payment atomic.|
|63|f7b135ea-4894-46ab-b41d-ba2f74b070a1 / hv-umm2.132|supported / resources,flow|Draw2 discard2/1 then gain3energy, in printed order.|
|64|1434440c-c86f-4b7d-83e7-3bd1f7dde63e / hv-umm2.132|supported / resources,values,flow|Discard whole current hand then gain3/4energy.|
|65|08fe3190-f559-4152-941d-33ec4180f509 / hv-umm2.132|supported / resources,flow|Gain2/3energy then draw1.|
|66|b4838d67-f055-4fd3-a64d-0a4d2b6678cc / hv-umm2.132|supported / triggers,resources,flow|First matched individual discard per turn -> draw1 and gain1/2energy; separate from discard-batch.|
|67|50267984-eaa3-415e-a23f-581c54b0ad2d / hv-umm2.133|supported / shuffle,resources,flow|Shuffle hand+void into own deck, draw5/6 then gain5energy; shuffle knowledge and created replacements apply.|
|68|46783333-78f9-4146-a8ec-0d1b81e1bf2f / hv-umm2.133|supported / triggers,resources|Materialized draw1; Dawn gain1/2energy.|
|69|f8678d24-f18b-4c94-a6c2-50efb8193b7f / hv-umm2.133|supported / resources,flow|Draw2 then opponent gains2/1points.|
|70|f1452b45-51dc-453a-916e-88bd9d29e36e / hv-umm2.133|supported / triggers,resources,flow|Dawn draw1 then opponent gains2/1points.|
|71|965ce3b2-a722-475c-99c5-5b35685d2404 / hv-umm2.127|supported / triggers,resources|Materialized draw1.|
|72|bbf83d18-81b6-48c8-886f-4b9f0feb599f / hv-umm2.127|supported / triggers,resources|Materialized draw1.|
|73|1d92e103-8415-433d-97d6-ac8a83660b34 / hv-umm2.127|supported / triggers,resources|Either Materialized or Dissolved erode4/5.|
|74|e455225f-c444-44a2-8796-805cae2b755f / hv-umm2.127|supported / triggers,foresee|Each own event play -> foresee1/2.|
|75|c750af2e-8185-4af0-bb38-4a41430c71b3 / hv-umm2.127|supported / activation,triggers,resources|Additional banish another hand card1; either Materialized or Dawn gain1energy.|
|76|f860e815-3ed9-463d-ac4d-ed8d2778f8ad / hv-umm2.128|supported / activation,triggers,resources|Additional discard another eligible hand character1; either Materialized or Dawn gain1/2energy.|
|77|bbf316f6-1fd4-40f5-aacd-d9ed8a5c58ea / hv-umm2.128|supported / triggers,resources|Veil; filtered own cost<=2 character play -> energy1.|
|78|6b739127-1a23-4c5d-877a-8829dd7a8b8c / hv-umm2.128|supported / triggers,flow,resources|Dissolved modal gain1/2current energy OR1max energy.|
|79|a952f833-825a-435f-82b1-8d85f872d274 / hv-umm2.128|supported / activation,resources|Abandon controlled copiablecost<=2 character -> energy1/2.|
|80|aba40bc6-3e9e-4874-be8a-6984cbf13146 / hv-umm2.129|supported / activation,resources|Abandon controlled copiablecost<=2 character -> points1/2.|
|81|0458658d-7e02-4286-9249-93674d16620b / hv-umm2.129|supported / triggers,activation,resources|Dawn energy1/2; exhaust+abandon controlled character -> energy1/2.|
|82|448abb34-d77d-40ac-8292-58db03176247 / hv-umm2.129|supported / activation,resources|Abandon another controlled character -> energy2/3.|
|83|6a3bb4ae-a537-4b79-8bdd-5093f05ec07a / hv-umm2.129|supported / activation,resources|Abandon controlled warrior -> energy2/3.|
|84|fbf725ca-8837-46d4-970c-922153e27b6e / hv-umm2.129|supported / activation,resources|Abandon another controlled character -> energy1/2.|
|85|69d9e550-eacc-49f2-8cc5-30b8940c9eed / hv-umm2.124|supported / triggers,discover|Materialized Discover copiablecost<=2 character.|
|86|a031eada-2c47-49c6-8c19-d2fe85f8ce97 / hv-umm2.124|supported / triggers,discover|Materialized Discover copiablecost<=2 event.|
|87|4fac8060-2644-409f-806b-c6a845ef6f31 / hv-umm2.124|supported / resources,values|Announced paid energy X -> drawX.|
|88|97bc4b48-9ea1-40e9-94bb-a88ae4f55d83 / hv-umm2.124|supported / resources|Draw3.|
|89|caaee8a9-0c22-41b4-950f-4c1131b98221 / hv-umm2.124|supported / triggers,resources|Floating own character-play trigger until Ending -> draw1.|
|90|5c5e316f-c499-4991-9733-bb6e3d826d7e / hv-umm2.124|supported / resources,flow|Erode3 then draw1.|
|91|3cc9253a-4db6-4b02-92d6-a37805d192fb / hv-umm2.125|supported / foresee,resources,flow|Foresee1/2 then draw1.|
|92|45e3d703-7efc-4dc2-b854-33211f8d4f11 / hv-umm2.125|supported / resources,foresee,flow|Draw1 then Foresee2/3.|
|93|84fd9c6e-79c6-4b65-878b-1534f3e4b220 / hv-umm2.125|supported / foresee,resources,flow|Foresee2/3 then draw1.|
|94|c86c1364-6ac4-4c90-8053-4e49441a2c83 / hv-umm2.125|already_planned / discard-batch|Active453 owns Key Sifter; first discard OCCASION per turn draws captured occasion count, not first per-card draw1.|
|95|8367b757-c3d2-4c22-9043-8baadee1c5ba / hv-umm2.125|supported / triggers,resources|Once-per-turn own warrior materialization -> draw1; captured effective subtype on event.|
|96|b1bea643-1a7b-4e5e-b072-7174d3405421 / hv-umm2.126|supported / triggers,resources|Once-per-turn opponent event play -> draw1.|
|97|f07dfe42-566c-4e91-a250-9e2781e9d06f / hv-umm2.126|supported / triggers,resources,select|Challenge designation cohort of>=2 own warriors -> draw1/2 once, not per warrior.|
|98|64ce3ebc-c0ac-4dd3-95ca-eeb67530187c / hv-umm2.126|supported / triggers,resources|Either Materialized or Dissolved draw1.|
|99|1b4d2adc-64ab-4020-bae6-b35321898bf0 / hv-umm2.126|supported / triggers,resources|Materialized draw2.|
|100|382dafa1-f8ff-47b4-9151-15b84067a5b2 / hv-umm2.126|supported / triggers,resources,flow|Materialized opponent discard1 if hand nonempty else own draw1/2. Check hand before discard so last-card success does not draw.|
|101|a56e0f68-30b6-404e-9b83-a7584177f21e / hv-umm2.103|already_planned / alternative,select|Optional full replacement0energy+opponent5points route; dissolve enemy; affordability and terminal-point behavior need canonical103.|
|102|f9c66b3e-4771-4a3c-8577-9d2f1c987bc7 / hv-umm2.104|already_planned / cost-first|Veil; first qualifying own copiablecost<=2 character each turn base0; canonical104.|
|103|4d4618bd-4779-4953-b446-dab05e1da5db / hv-umm2.105|already_planned / play-condition,resources|Announcement legal only with own void>=3/2 EVENT cards; gain5energy on resolution.|
|104|72debe2e-1f47-4a66-83c3-71bb72876663 / hv-umm2.100|already_planned / history,materialize|All CURRENT-void characters dissolved this turn; physical history membership not current-void count.|
|105|f7c68226-def4-4eb0-bdfe-b028482e1351 / hv-umm2.100|already_planned / history,cost-offset|Hand/void relevant self cost reduction3 if actually discarded a card this turn, source-specific live history condition.|
|106|2a230602-a39b-4ec2-a467-97b92b389aff / hv-umm2.100|already_planned / history,resources|Draw per character controlled before dissolution this turn, even moved/ceased after dissolution; history occurrence count.|
|107|0fde04ac-8552-45ce-83a3-5ab2384b36da / hv-umm2.97|already_planned / stack-bounds|Prevent played copiablecost<=2/3 card, preventable filter.|
|108|6196d53d-a226-490d-a3bb-159a78d1b2b7 / hv-umm2.97|already_planned / stack-bounds|Prevent played effective spark<=2/3 character, preventable filter.|
|109|99101fce-f2b4-4032-b999-317ce3e4a6dd / hv-umm2.97|already_planned / triggers,stack-bounds,activation|Materialized Prevent played cost<=2/3 card; Fast energy1 reposition physical source.|
|110|fb967cc1-4199-4a08-8070-724e07cebea5 / hv-umm2.99|supported / copy,reclaim|Delayed first event this turn -> repeat2 copy subject; explicit Reclaim5; C6 redundant amplified retarget clause is a card issue/no-op.|
|111|c7c95f67-a838-4e39-879c-cfbf0591540c / hv-umm2.99|supported / triggers,copy|Materialized delayed first own event copiablecost<=2/3 this turn -> repeat2 ordinary copies.|
|112|f3f97e2c-3bb6-4a20-9880-f59c50e5af93 / hv-umm2.95|already_planned / activation,counter-fixed,counter-dynamic,select|Abandon controlled character -> store1; X counters -> enemy spark exactlyX (paired upper+lower), paid X before targeting.|
|113|8e7b0eb9-4933-420b-abee-413bf5b3d2fc / hv-umm2.95|already_planned / triggers,counter-fixed,counter-dynamic,activation,resources|Dawn store1; whole-hand discard payment, then draw per stored counters; no counter spend clause.|
|114|a6866438-3632-408d-b464-c10f8a43a5c2 / hv-umm2.95|already_planned / triggers,counter-fixed,counter-dynamic,activation,select|Own abandon occasion store1; X counter payment -> enemy spark exactlyX.|

## Uncertainty and resources

- Nexus filtered zero-base setters should reuse104 only after scope/route compatibility settled; do not count as proven distinct new filing.
- Whisper erode3 resolving payment affordability/Fatigue can perhaps compose public deck-count guard and optional ordered effect; prove via rules ladder/scenario before authorship.
- Canonical103 must cover Kindred conditional hand+void payment replacement and route-specific awakened entry provenance; generic reclaim/permission is not that route.
- Counter95 needs resolving and static readers, self-abandon predeparture retention and X counter payment before targets; do not assume one generic live reader solves all.
- History100 needs count versus physical membership and controller at event, with hidden discard identities/prior turn reset/replay preserved.
- Active453 source outcome UNKNOWN; keep Key Sifter original125 as an audit target, while excluding its active453 implementation from competing ownership recommendations.
- All source contracts unexecuted; staging and saved native observations have different times, parent606 must fresh-check graph, Areas, claims and current source before implementation.

First exposed actual UTC clock observation:2026-10-13T04:07:04Z; final external report generation UTC:2026-10-13T04:16:44.033212+00:00. Exact helper PID/CPU/model dispatch/start UNKNOWN. Parent root claim04:04:53Z includes setup/helper/waits; this interval is not CPU.

- Only short terminal source reads and external report generation. Every shell process terminal (exit0/1/2), no retained session/PID. No npm/tests/generation/QA/heavy lock/browser/servers/reviewer CLI/native Beads/Tollgate actions.
- Some early batched outputs exceeded max_output_tokens and were truncated. Focused reads recovered needed bodies. Nonexistent guessed filenames (phase5.md, play-permission.ts, with-drawn.ts, return.ts, may.ts, play-from.ts and several guessed contract filenames) returned terminal missing-file errors; actual paths re-discovered by rg. None is evidence of a missing capability by itself.
- No model-host usage/runtime error exposed. PID/model-start/CPU UNKNOWN; wall clock spans inspection and report writing, not exact compute.

Source-level timing correction: ❖ denotes Fast and ❖❖ Interrupt (`docs/rules.md:50`). Mirrorlight and Dune activation clauses impose no once-per-turn limit; Forsworn/Dreadmount activation clauses are Interrupt. Announced X comes from actual printed orb data (`content-catalog.ts:35`), including Cosmic3+X, Dreamscatter2+X, Sanctum1+X and EtherealArmyX; no printed cost is invented.

Scope qualification: all32 original native card beads are open/unassigned at the supplied freeze. All115 UUIDs remain audit targets, including Key Sifter in original125. The active453 qualifier concerns its existing capability/exact source implementation and unknown private branch outcome; it does not assign an active status to original125.

Key Sifter is explicitly named in active453 native description/module Areas as well as original125. Its auditTarget is true and ownershipTarget false; this is a cross-scope current writer exclusion, not a claim that original125 is active. Original125 full final acceptance remains.

Parent verification records all115 source hashes and exact native UUID scope associations, current source/body seams and admitted+intended proposal matching. Proposals remain inputs to hv-umm2.606; their implementation and graph admission require its cold review and fresh ownership/source checks. This source audit executes no behavioral witnesses.

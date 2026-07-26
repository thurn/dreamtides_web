# Dream Merchant v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the gated `?journey=v2` Dream Merchant experience for Dream Journey sites, with two essence-priced offers, high-quality deck-aware rewards, chooser-backed rewards, deterministic dialogue, and center-stage UI.

**Architecture:** Add a sibling `src/journey_v2/` module with its own context projection, deck-read engine, reward catalog, offer director, dialogue grammar, and UI. The classic Dream Journey route stays on `src/journeys/`; `ScreenRouter` selects the v2 merchant only when `RuntimeConfig.journeyVariant === "v2"`. Offer acceptance is a single validated quest mutation that recomputes the encounter from current state before paying essence, applying the reward, and completing the site.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Firebase Realtime Database transactions, existing quest context and card/Dreamsign UI components.

**Spec:** `docs/superpowers/specs/2026-06-08-dream-merchant-v2-design.md` is the source of truth. If this plan and the spec disagree, follow the spec and update the plan before implementation.

**Worktree:** Work in `/Users/dthurn/quest_prototype/.worktrees/dream-merchant-v2` on branch `wt/dream-merchant-v2`.

---

## File Structure

**Create:**
- `src/journey_v2/index.ts` — public exports for the v2 module.
- `src/journey_v2/types.ts` — core merchant types shared by context/read/catalog/dialogue/UI.
- `src/journey_v2/context/buildMerchantContext.ts` — projects `QuestState`, `QuestContent`, and `SiteState` into merchant-safe inputs.
- `src/journey_v2/context/buildMerchantContext.test.ts` — candidate filtering and UUID index tests.
- `src/journey_v2/read/deckRead.ts` — deck profiling and need ranking.
- `src/journey_v2/read/deckRead.test.ts` — need invariants and crafted deck fixtures.
- `src/journey_v2/catalog/rewardCatalog.ts` — reward builders and chooser-backed reward construction.
- `src/journey_v2/catalog/rewardCatalog.test.ts` — reward validity, candidate filtering, and value invariants.
- `src/journey_v2/catalog/pricing.ts` — deterministic essence pricing.
- `src/journey_v2/catalog/pricing.test.ts` — determinism, affordability, and bounds tests.
- `src/journey_v2/encounter/generateMerchantEncounter.ts` — two-offer director and validation.
- `src/journey_v2/encounter/generateMerchantEncounter.test.ts` — deterministic encounter and honest-broker invariant tests.
- `src/journey_v2/encounter/resolveMerchantOffer.ts` — recompute-and-validate accept/decline state transforms.
- `src/journey_v2/encounter/resolveMerchantOffer.test.ts` — stale request, affordability, target availability, and state transform tests.
- `src/journey_v2/dialogue/dialogue.ts` — deterministic warm-broker dialogue grammar.
- `src/journey_v2/dialogue/dialogue.test.ts` — structured-slot and repeat-avoidance tests.
- `src/journey_v2/ui/DreamMerchantScreen.tsx` — screen state, review/chooser/confirmation flow.
- `src/journey_v2/ui/DreamMerchantScreen.test.tsx` — rendering and interaction tests.
- `src/journey_v2/ui/OfferCard.tsx` — offer card presentation.
- `src/journey_v2/ui/MerchantChooserPanel.tsx` — card, deck-target, and Dreamsign chooser panel.
- `src/journey_v2/ui/MerchantGameObjectView.tsx` — renders cards, Dreamsigns, resources, and composite rewards.
- `src/journey_v2/testing/fixtures.ts` — small card/Dreamsign/deck fixtures for v2 tests.
- `src/journey_v2/testing/recordingMutations.ts` — recording helper for resolve/UI tests when needed.

**Modify:**
- `src/runtime/runtime-config.ts` — add `journeyVariant`.
- `src/runtime/runtime-config.test.ts` — parse/default tests for `?journey=v2`.
- `src/data/quest-content.ts` — load adapted draft records and build `FitModel` when v2 is active.
- `src/data/quest-content.test.ts` — v2 fit-model content-load test.
- `src/components/ScreenRouter.tsx` — route Dream Journey sites to v2 screen when requested.
- `src/components/ScreenRouter.test.tsx` or `src/App.test.tsx` — route selection coverage, choosing the local existing test surface that already mounts routing cleanly.
- `src/state/quest-context.tsx` — add `acceptDreamMerchantOffer` and `declineDreamMerchant` to `QuestMutations` and single-player provider.
- `src/state/quest-context.test.tsx` — single-player mutation behavior.
- `src/state/multiplayer-quest-context.tsx` — implement accept/decline as room transactions.
- `src/state/multiplayer-quest-context.test.tsx` — transaction behavior and action log coverage.
- `docs/quest_prototype/url_parameters.md` — document `journey=v2` directly as a runtime parameter.

---

## Conventions

- Run every command from the worktree root.
- Commit and push after every task that changes files.
- Use card UUIDs and deck `entryId`s for algorithmic identity. Card names are display/dialogue only.
- Keep all v2 feature code under `src/journey_v2/` unless the task explicitly modifies a shared entry point.
- Do not add merchant-specific persistent memory to `QuestState`.
- Do not add future-run modifier rewards.
- Use `npm install` before checks if `node_modules` is missing in the worktree.
- For focused tests, use `npx vitest run <file>`.
- For final verification, run `npm run lint`, `npm run typecheck`, `npm test`, and browser QA with a Vite server on a non-5173 port.

---

## Task 0: Verify Worktree And Baseline

**Files:** none.

- [ ] **Step 1: Confirm branch and dependencies**

Run:

```bash
git branch --show-current
test -d node_modules || npm install
```

Expected: branch is `wt/dream-merchant-v2`; dependencies exist after the step.

- [ ] **Step 2: Run a baseline smoke check**

Run:

```bash
npm run typecheck
npx vitest run src/runtime/runtime-config.test.ts src/data/quest-content.test.ts
```

Expected: pass. If baseline fails, record the failure before making feature changes.

- [ ] **Step 3: Commit only if dependency lockfiles changed**

If `npm install` changed tracked files, commit and push with a detailed message. If no tracked files changed, skip this step.

---

## Task 1: Add The `?journey=v2` Runtime Flag

**Files:**
- Modify: `src/runtime/runtime-config.ts`
- Test: `src/runtime/runtime-config.test.ts`
- Modify: `docs/quest_prototype/url_parameters.md`

**Bug class caught:** accidental v2 activation on malformed query strings, or missing runtime field causing downstream router code to branch on `undefined`.

- [ ] **Step 1: Write the failing runtime config tests**

Add tests that verify:
- absent `journey` yields `journeyVariant === "classic"`
- `?journey=v2` yields `"v2"`
- any other value yields `"classic"`

Run:

```bash
npx vitest run src/runtime/runtime-config.test.ts
```

Expected: fail because `journeyVariant` does not exist.

- [ ] **Step 2: Add the runtime config contract**

Add this contract to `RuntimeConfig`:

```ts
journeyVariant: "classic" | "v2";
```

Implement parsing with exact-match behavior: only `params.get("journey") === "v2"` maps to `"v2"`.

- [ ] **Step 3: Document the URL parameter**

In `docs/quest_prototype/url_parameters.md`, add a concise `journey` section that says `journey=v2` renders Dream Journey sites with the Dream Merchant v2 encounter.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/runtime/runtime-config.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/runtime/runtime-config.ts src/runtime/runtime-config.test.ts docs/quest_prototype/url_parameters.md
git commit -m "Add Dream Merchant v2 runtime flag" -m "Parse ?journey=v2 into RuntimeConfig.journeyVariant while keeping the default route on the classic journey surface. Document the parameter for local QA and future implementation tasks."
git push
```

---

## Task 2: Load Fit Model For v2 Pool-Mode Runs

**Files:**
- Modify: `src/data/quest-content.ts`
- Test: `src/data/quest-content.test.ts`

**Bug class caught:** v2 merchant recommendations silently falling back to weak local heuristics during normal pool-mode runs.

- [ ] **Step 1: Write the failing content-load test**

Extend the quest-content tests with a pool-mode runtime config whose `journeyVariant` is `"v2"`. Mock adapted draft records with one valid record and assert the returned `QuestContent` includes both `draftRecords` and `fitModel`.

The test should catch:
- `draftRecords` not fetched in v2 pool mode
- `fitModel` not built even when records are present
- replay/fresh20 behavior drift from the existing tests

Run:

```bash
npx vitest run src/data/quest-content.test.ts
```

Expected: fail because v2 pool mode does not yet request records.

- [ ] **Step 2: Extend the content-load condition**

In `loadQuestContent()`, add v2 to the condition that fetches draft records and builds `FitModel`. Keep `fitModel` optional in the type because tests and fallback paths can omit it.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npx vitest run src/data/quest-content.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add src/data/quest-content.ts src/data/quest-content.test.ts
git commit -m "Load draft fit model for Dream Merchant v2" -m "Make ?journey=v2 opt into adapted draft-record loading and FitModel construction in pool-mode runs so merchant recommendations can rank broad catalog rewards from real draft data."
git push
```

---

## Task 3: Create v2 Types And Context Builder

**Files:**
- Create: `src/journey_v2/types.ts`
- Create: `src/journey_v2/context/buildMerchantContext.ts`
- Create: `src/journey_v2/context/buildMerchantContext.test.ts`
- Create: `src/journey_v2/testing/fixtures.ts`
- Create: `src/journey_v2/index.ts`

**Bug class caught:** v2 algorithms using card names as identity, offering disallowed starter/special cards, offering held duplicate Dreamsigns, or crashing on missing card records.

- [ ] **Step 1: Define the core type contracts**

In `src/journey_v2/types.ts`, define the shared contracts for:
- `MerchantContext`
- `MerchantDeckCard`
- `MerchantNeed`
- `MerchantReward`
- `MerchantChoiceRequest`
- `MerchantChoice`
- `MerchantOffer`
- `MerchantEncounter`
- `MerchantAcceptRequest`
- `MerchantDeclineRequest`
- `MerchantGameObject`

Embed these identity fields in the contracts:

```ts
cardUuid: string;
cardNumber: number;
entryId?: string;
dreamsignId?: string;
```

Make `MerchantAcceptRequest` include `encounterSignature`, `offerId`, `expectedPrice`, `rewardBuilderId`, `needId`, and optional `choice`.

- [ ] **Step 2: Write failing context tests**

Tests should verify:
- `cardByUuid` indexes all cards with UUIDs
- deck entries project to both `entryId` and UUID
- `candidateGrantCards` excludes starter and special cards
- `candidateDreamsigns` excludes held Dreamsign ids
- `fitModel` is passed through when present

Run:

```bash
npx vitest run src/journey_v2/context/buildMerchantContext.test.ts
```

Expected: fail because the files do not exist.

- [ ] **Step 3: Implement `buildMerchantContext`**

Use `QuestState`, `QuestContent`, and `SiteState` as inputs. Read `data/buildaround_support.json` through a static JSON import. Build maps once and return immutable arrays/maps where practical.

Do not use card names for algorithmic identity. Names may be stored as display fields.

- [ ] **Step 4: Export the public surface**

In `src/journey_v2/index.ts`, export the context builder and type contracts needed by later tasks. Leave missing implementation exports out until their files exist.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/context/buildMerchantContext.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/journey_v2
git commit -m "Add Dream Merchant v2 context builder" -m "Introduce the v2 module contracts and context projection. The context indexes cards by UUID, carries deck entry ids, filters grantable catalog cards and Dreamsigns, and passes through FitModel data for later deck-read and reward ranking tasks."
git push
```

---

## Task 4: Implement Deck Read v1

**Files:**
- Create: `src/journey_v2/read/deckRead.ts`
- Create: `src/journey_v2/read/deckRead.test.ts`
- Modify: `src/journey_v2/index.ts`

**Bug class caught:** the merchant offering generic shop rewards instead of answering real deck needs, or suggesting a purge that damages a detected payoff.

- [ ] **Step 1: Write failing deck-read tests**

Use fixtures with current cards or focused synthetic `CardData` objects. Tests should catch:
- an under-supported payoff emits `under_supported_payoff`
- a draw-light or recursion-light deck emits `missing_role`
- a top-heavy deck emits `curve_problem`
- an eligible high-cost card emits `upgrade_target` for Empowered projection
- a weak starter candidate is emitted only when it is not sole support for a detected payoff
- every emitted need has a stable id, severity, confidence, and observation text data

Run:

```bash
npx vitest run src/journey_v2/read/deckRead.test.ts
```

Expected: fail because the read engine does not exist.

- [ ] **Step 2: Implement read helpers**

Implement focused helpers in `deckRead.ts`:
- profile deck size, type counts, average cost, and curve
- classify role support from card text and `buildaround_support.json`
- detect payoff support adequacy from UUID metadata
- rank transfiguration opportunities using `eligibleTransfigurations()` and `applyTransfigurationToCard()`
- identify weak candidates conservatively

Do not import from `src/journeys/`.

- [ ] **Step 3: Implement `readMerchantDeck(context)`**

Return sorted needs by severity and confidence. Ensure the read produces at least two actionable needs for normal non-empty decks by adding broad fallback needs such as transfiguration, Dreamsign gap, or support grant.

- [ ] **Step 4: Export the read function**

Update `src/journey_v2/index.ts`.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/read/deckRead.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/journey_v2/read src/journey_v2/index.ts
git commit -m "Add Dream Merchant v2 deck read" -m "Detect deck needs for the merchant from UUID-keyed buildaround metadata, card text roles, curve metrics, transfiguration projections, and conservative weak-card analysis."
git push
```

---

## Task 5: Add Deterministic Pricing

**Files:**
- Create: `src/journey_v2/catalog/pricing.ts`
- Create: `src/journey_v2/catalog/pricing.test.ts`

**Bug class caught:** offer prices changing across render/reload, exceeding resource caps, or allowing zero-cost meaningful rewards.

- [ ] **Step 1: Write failing pricing tests**

Tests should catch:
- identical inputs produce identical price
- changing offer id or seed can change jitter while staying inside bounds
- price is at least 25
- price is at most `essenceCap`
- locked state is true when price exceeds current essence

Run:

```bash
npx vitest run src/journey_v2/catalog/pricing.test.ts
```

Expected: fail because pricing does not exist.

- [ ] **Step 2: Implement pricing**

Implement `priceMerchantReward(input)` with the spec formula:

```ts
price = rounded(valueEssence * needSeverityMultiplier * scarcityMultiplier * marketJitter)
```

Use deterministic hashing from string input. Do not use `Math.random()`.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/catalog/pricing.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add src/journey_v2/catalog/pricing.ts src/journey_v2/catalog/pricing.test.ts
git commit -m "Add deterministic Dream Merchant pricing" -m "Price v2 merchant rewards from immediate value, need severity, scarcity, and seeded market jitter while clamping to useful essence bounds and surfacing locked offers."
git push
```

---

## Task 6: Implement Reward Catalog v1

**Files:**
- Create: `src/journey_v2/catalog/rewardCatalog.ts`
- Create: `src/journey_v2/catalog/rewardCatalog.test.ts`
- Modify: `src/journey_v2/types.ts`
- Modify: `src/journey_v2/index.ts`

**Bug class caught:** rewards that do not answer the selected need, chooser rewards with empty candidates, catalog grants of disallowed cards, or rewards that cannot produce an apply payload.

- [ ] **Step 1: Write failing catalog tests**

Tests should catch:
- `grant_support_card` returns 3-5 chooser candidates when matching catalog cards exist
- `grant_support_card` excludes starter/special cards and already-owned UUIDs when configured to avoid duplicates
- `grant_dreamsign` returns 2-4 non-held non-bane candidates
- `transfigure_card` renders a direct game object with preview metadata
- `purge_weak_card` returns a deck-entry game object with a remove badge
- every reward has `answersNeedIds`, `valueEssence > 0`, and either a direct apply payload or a non-empty choice request

Run:

```bash
npx vitest run src/journey_v2/catalog/rewardCatalog.test.ts
```

Expected: fail.

- [ ] **Step 2: Define apply payload types**

In `types.ts`, represent reward application as data, not closures. Required variants:
- add catalog card by UUID
- add Dreamsign by id/template
- transfigure deck entry
- duplicate deck entry
- remove deck entry
- change deck entry keywords
- change deck entry type
- change essence
- change max essence
- composite payload with ordered child payloads

This avoids storing functions in generated encounters and makes transaction-time recomputation validation straightforward.

- [ ] **Step 3: Implement reward builders**

Implement the immediate catalog builders from the spec. It is acceptable for mutation-sensitive builders such as type-change and keyword improvements to return no reward until their preview/apply data is unambiguous. Do not include future-run modifiers.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/catalog/rewardCatalog.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/journey_v2/catalog/rewardCatalog.ts src/journey_v2/catalog/rewardCatalog.test.ts src/journey_v2/types.ts src/journey_v2/index.ts
git commit -m "Add Dream Merchant reward catalog" -m "Build immediate v2 merchant rewards for deck support, Dreamsigns, transfigurations, weak-card purges, duplication, and resources. Rewards use UUID and entryId identity and expose chooser/apply payload data for later transaction validation."
git push
```

---

## Task 7: Generate And Validate Two-Offer Encounters

**Files:**
- Create: `src/journey_v2/encounter/generateMerchantEncounter.ts`
- Create: `src/journey_v2/encounter/generateMerchantEncounter.test.ts`
- Modify: `src/journey_v2/index.ts`

**Bug class caught:** duplicate offers, offers that answer no detected need, non-deterministic generation, and invalid fallback behavior when top builders cannot apply.

- [ ] **Step 1: Write failing encounter tests**

Tests should catch:
- generated encounter has exactly two offers
- both offers answer existing need ids
- offer ids are `"A"` and `"B"`
- the two offers are meaningfully distinct by builder, need, or target
- generated signatures are stable for unchanged context
- 25 different seeds satisfy the honest-broker invariants
- locked offers remain present when essence is low

Run:

```bash
npx vitest run src/journey_v2/encounter/generateMerchantEncounter.test.ts
```

Expected: fail.

- [ ] **Step 2: Implement the director**

`generateMerchantEncounter(context)` should call `readMerchantDeck(context)`, select two distinct needs, build rewards, price them, validate them, and return a `MerchantEncounter`.

Encounter signature must be derived from stable inputs and offer payload summaries. It should change when deck/resource/site inputs change.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/encounter/generateMerchantEncounter.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add src/journey_v2/encounter/generateMerchantEncounter.ts src/journey_v2/encounter/generateMerchantEncounter.test.ts src/journey_v2/index.ts
git commit -m "Generate Dream Merchant two-offer encounters" -m "Combine deck reads, reward builders, deterministic pricing, and validation into stable two-offer v2 merchant encounters with signatures for transaction-time verification."
git push
```

---

## Task 8: Add Dialogue Grammar

**Files:**
- Create: `src/journey_v2/dialogue/dialogue.ts`
- Create: `src/journey_v2/dialogue/dialogue.test.ts`
- Modify: `src/journey_v2/encounter/generateMerchantEncounter.ts`
- Modify: `src/journey_v2/types.ts`

**Bug class caught:** generic dialogue that ignores actual offer/read data, repeated template selection inside one encounter, or dialogue inventing unstructured facts.

- [ ] **Step 1: Write failing dialogue tests**

Tests should catch:
- dialogue includes a greeting, at least two observations, offer framing, price framing, and walk-away line
- generated text references structured fields from the selected needs/offers
- no template id repeats within one encounter
- identical inputs produce identical dialogue
- different seeds can select different templates

Run:

```bash
npx vitest run src/journey_v2/dialogue/dialogue.test.ts
```

Expected: fail.

- [ ] **Step 2: Implement warm-broker grammar**

Implement enough template volume to meet the spec:
- 20-30 greetings
- 12-20 observation templates per need kind
- 8-12 offer-framing templates per reward family
- 12-16 price-framing templates
- 12-16 accept reactions
- 12-16 decline reactions

Represent beats as structured records with `id`, `kind`, and `text`. Do not use free-form generated facts outside slots supplied by the read and offer data.

- [ ] **Step 3: Attach beats to encounters**

Update `generateMerchantEncounter()` to call the dialogue renderer and include beats on `MerchantEncounter`.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/dialogue/dialogue.test.ts src/journey_v2/encounter/generateMerchantEncounter.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/journey_v2/dialogue src/journey_v2/encounter/generateMerchantEncounter.ts src/journey_v2/types.ts
git commit -m "Add Dream Merchant dialogue grammar" -m "Render deterministic warm-broker dialogue from structured deck-read and offer data, with per-encounter template anti-repetition and dialogue beats attached to generated encounters."
git push
```

---

## Task 9: Implement Offer Resolution State Transforms

**Files:**
- Create: `src/journey_v2/encounter/resolveMerchantOffer.ts`
- Create: `src/journey_v2/encounter/resolveMerchantOffer.test.ts`
- Modify: `src/journey_v2/index.ts`

**Bug class caught:** stale clients accepting offers against changed room state, accepting unaffordable offers, or applying a reward target that disappeared.

- [ ] **Step 1: Write failing resolution tests**

Tests should catch:
- direct offer accept deducts essence, applies reward, marks site visited, and returns to dreamscape
- chooser-backed offer requires a valid choice id
- stale `encounterSignature` fails without changing state
- stale `expectedPrice` fails without changing state
- unaffordable offer fails without changing state
- missing deck target fails without changing state
- decline marks site visited and returns to dreamscape

Run:

```bash
npx vitest run src/journey_v2/encounter/resolveMerchantOffer.test.ts
```

Expected: fail.

- [ ] **Step 2: Implement reward payload application**

Implement pure state transforms for the payload variants from Task 6. Use the same semantics as `QuestMutations`:
- add card by UUID by resolving through the content card database
- add Dreamsign from template
- duplicate/remove/transfigure by `entryId`
- change essence with clamping
- change max essence and clamp current essence
- apply composite payloads in order

Keep this transform pure so both single-player and multiplayer providers can use it.

- [ ] **Step 3: Implement accept/decline resolution**

`resolveMerchantOffer({ state, questContent, site, request })` recomputes context and encounter, validates the request, applies payment/reward, and completes the site. Return a discriminated result so callers can log validation failures.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/encounter/resolveMerchantOffer.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/journey_v2/encounter/resolveMerchantOffer.ts src/journey_v2/encounter/resolveMerchantOffer.test.ts src/journey_v2/index.ts
git commit -m "Resolve Dream Merchant offers with validation" -m "Add pure accept and decline transforms that recompute v2 merchant encounters, validate signatures, prices, choices, affordability, and targets, then apply payment, reward, and site completion atomically."
git push
```

---

## Task 10: Add Quest Mutations For Accept And Decline

**Files:**
- Modify: `src/state/quest-context.tsx`
- Modify: `src/state/quest-context.test.tsx`
- Modify: `src/state/multiplayer-quest-context.tsx`
- Modify: `src/state/multiplayer-quest-context.test.tsx`
- Modify: `src/journey_v2/types.ts` if request/result types need export refinements

**Bug class caught:** UI composing multiple mutation calls that can interleave in multiplayer, missing action logs, or single-player and multiplayer behavior diverging.

- [ ] **Step 1: Write failing single-player mutation tests**

In `quest-context.test.tsx`, cover:
- `acceptDreamMerchantOffer` applies one valid generated offer and completes the site
- invalid request leaves state unchanged and logs validation failure
- `declineDreamMerchant` completes the site without deck/resource changes

Run:

```bash
npx vitest run src/state/quest-context.test.tsx
```

Expected: fail because mutations are missing.

- [ ] **Step 2: Add mutation signatures**

Extend `QuestMutations`:

```ts
acceptDreamMerchantOffer: (siteId: string, request: MerchantAcceptRequest) => void;
declineDreamMerchant: (siteId: string, request: MerchantDeclineRequest) => void;
```

Use type-only imports from `src/journey_v2`.

- [ ] **Step 3: Implement single-player mutations**

Find the current site from atlas state, call `resolveMerchantOffer`, update state on success, and log success/failure events with UUIDs and entry ids.

- [ ] **Step 4: Write failing multiplayer transaction tests**

In `multiplayer-quest-context.test.tsx`, cover:
- accept uses one `runRoomTransaction`
- transaction updater applies essence/reward/site completion together
- stale request returns unchanged room and action log failure entry
- decline transaction completes the site

Run:

```bash
npx vitest run src/state/multiplayer-quest-context.test.tsx
```

Expected: fail until multiplayer provider is implemented.

- [ ] **Step 5: Implement multiplayer mutations**

Use `runRoomTransaction`. Inside the updater, derive the site from the transaction room state, call the pure resolver, write the next quest state, update metadata, and append action log entries.

- [ ] **Step 6: Run focused verification**

Run:

```bash
npx vitest run src/state/quest-context.test.tsx src/state/multiplayer-quest-context.test.tsx
npm run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/state/quest-context.tsx src/state/quest-context.test.tsx src/state/multiplayer-quest-context.tsx src/state/multiplayer-quest-context.test.tsx src/journey_v2/types.ts
git commit -m "Wire Dream Merchant offer mutations" -m "Expose accept and decline mutations in single-player and multiplayer quest providers. Multiplayer uses a single room transaction so price payment, reward application, action logging, and site completion commit together."
git push
```

---

## Task 11: Route Dream Journey Sites To v2

**Files:**
- Modify: `src/components/ScreenRouter.tsx`
- Test: `src/components/ScreenRouter.test.tsx` or `src/App.test.tsx`
- Modify: `src/journey_v2/index.ts`

**Bug class caught:** v2 rendering on classic URLs, classic Journey rendering under `?journey=v2`, or router crashes when the first Dream Journey site is opened.

- [ ] **Step 1: Create a route sentinel screen export if needed**

If the full `DreamMerchantScreen` does not exist at this point, export a small route sentinel component from `src/journey_v2/ui/DreamMerchantScreen.tsx` that renders `data-testid="dream-merchant-v2-screen"` and receives the same prop contract the final screen will use. This keeps routing testable before the UI pass.

- [ ] **Step 2: Write failing router tests**

Use the existing route test surface that can provide `RuntimeConfig` and a Dream Journey site. Tests should catch:
- classic config renders the classic journey screen path
- v2 config renders `data-testid="dream-merchant-v2-screen"`
- non-DreamJourney site routing is unchanged under v2 config

Run the chosen test file.

Expected: fail until router switch exists.

- [ ] **Step 3: Implement router switch**

In `DreamJourneySiteScreen` or its call site, branch on `runtimeConfig.journeyVariant`. The v2 wrapper should build the merchant context from `state`, `questContent`, and `site`, then pass the generated encounter and mutations to the v2 screen.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/components/ScreenRouter.test.tsx src/App.test.tsx
npm run typecheck
```

If `ScreenRouter.test.tsx` does not exist, run the exact route test file used in Step 2 instead.

Expected: pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/components/ScreenRouter.tsx src/journey_v2 src/components/ScreenRouter.test.tsx src/App.test.tsx
git commit -m "Route Dream Journey sites to Merchant v2" -m "Select the new src/journey_v2 merchant screen for Dream Journey sites only when RuntimeConfig.journeyVariant is v2, preserving classic routing and other site screens."
git push
```

Use `git add` only for files that exist and changed.

---

## Task 12: Build Game Object Rendering Components

**Files:**
- Create: `src/journey_v2/ui/MerchantGameObjectView.tsx`
- Test: `src/journey_v2/ui/DreamMerchantScreen.test.tsx` or a dedicated `MerchantGameObjectView.test.tsx`

**Bug class caught:** offer rewards rendering as abstract text instead of concrete cards/Dreamsigns/resources, or badges losing the exact target identity.

- [ ] **Step 1: Write failing rendering tests**

Tests should catch:
- deck/new card game objects render the card name and a badge when provided
- Dreamsign game objects render the Dreamsign name/effect surface
- essence and cap game objects render amounts
- composite rewards render both sacrificed and gained objects

Run:

```bash
npx vitest run src/journey_v2/ui/DreamMerchantScreen.test.tsx
```

Expected: fail until components exist.

- [ ] **Step 2: Implement `MerchantGameObjectView`**

Use existing `CardDisplay`, `DreamsignArtTile`, and `RulesText` components. Keep badge overlays local to v2 so shared card components do not gain merchant-specific styling.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/ui/DreamMerchantScreen.test.tsx
npm run typecheck
```

Expected: pass for the rendering tests in this task.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add src/journey_v2/ui
git commit -m "Render Dream Merchant reward objects" -m "Add v2 merchant game-object rendering for deck cards, catalog card grants, Dreamsigns, resource tokens, badges, and composite rewards using existing quest UI components."
git push
```

---

## Task 13: Build Offer Cards And Chooser Panel

**Files:**
- Create: `src/journey_v2/ui/OfferCard.tsx`
- Create: `src/journey_v2/ui/MerchantChooserPanel.tsx`
- Modify: `src/journey_v2/ui/DreamMerchantScreen.test.tsx`

**Bug class caught:** chooser-backed rewards accepting without a choice, hidden prices during selection, or inaccessible locked offers.

- [ ] **Step 1: Write failing interaction tests**

Tests should catch:
- a direct offer exposes a `Take` action
- a chooser-backed offer exposes a `Choose` action
- clicking `Choose` opens candidate options and preserves visible price context
- selecting a candidate shows final confirmation
- locked offers show lock reason and cannot be accepted

Run:

```bash
npx vitest run src/journey_v2/ui/DreamMerchantScreen.test.tsx
```

Expected: fail until offer/chooser UI exists.

- [ ] **Step 2: Implement offer and chooser components**

`OfferCard` should be layout-stable across direct, chooser, locked, and confirmation states. `MerchantChooserPanel` should support card-grant, deck-target, and Dreamsign choice requests from the shared type contract.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/ui/DreamMerchantScreen.test.tsx
npm run typecheck
```

Expected: pass for offer/chooser behavior.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add src/journey_v2/ui
git commit -m "Add Dream Merchant offer chooser UI" -m "Implement stable v2 offer cards and in-screen chooser panels so direct and chooser-backed rewards preserve price context, lock states, and final confirmation before mutation."
git push
```

---

## Task 14: Build The Center-Stage Merchant Screen

**Files:**
- Create or modify: `src/journey_v2/ui/DreamMerchantScreen.tsx`
- Modify: `src/journey_v2/ui/DreamMerchantScreen.test.tsx`
- Modify: `src/journey_v2/index.ts`

**Bug class caught:** first-screen layout missing the merchant image space, walk-away not completing the site, or accept callbacks receiving incomplete request data.

- [ ] **Step 1: Write failing screen tests**

Tests should catch:
- screen renders a large merchant image slot with a stable test id
- both offer cards render in one review state
- dialogue beats render
- walk away calls `declineDreamMerchant` with site id and encounter signature
- direct accept calls `acceptDreamMerchantOffer` with offer id, signature, expected price, builder id, and need id
- chooser accept includes selected choice

Run:

```bash
npx vitest run src/journey_v2/ui/DreamMerchantScreen.test.tsx
```

Expected: fail until screen state is complete.

- [ ] **Step 2: Implement center-stage layout**

Desktop layout: offer A, merchant image/dialogue, offer B. Mobile layout: merchant image, dialogue, offer A, offer B, walk-away. Use CSS classes and responsive constraints that keep card previews and buttons stable.

- [ ] **Step 3: Wire callbacks**

The screen should call `mutations.acceptDreamMerchantOffer(siteId, request)` and `mutations.declineDreamMerchant(siteId, request)`. It should not apply reward payloads directly.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/ui/DreamMerchantScreen.test.tsx
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/journey_v2/ui src/journey_v2/index.ts
git commit -m "Build Dream Merchant center-stage screen" -m "Render the v2 merchant encounter with a large central image slot, deterministic dialogue, two comparable offers, chooser confirmation, accept requests, and walk-away handling."
git push
```

---

## Task 15: Add Logging And Card Source Debug Support

**Files:**
- Modify: `src/journey_v2/ui/DreamMerchantScreen.tsx`
- Modify: `src/state/quest-context.tsx`
- Modify: `src/state/multiplayer-quest-context.tsx`
- Modify: relevant tests from Tasks 10 and 14

**Bug class caught:** merchant offers appearing without analytics/action-log attribution or without source overlays showing offered card provenance.

- [ ] **Step 1: Add failing log assertions**

Extend tests to catch:
- `merchant_offer_shown` fires when the screen renders an encounter
- accept logs include site id, offer id, builder id, need id, price, UUIDs, entry ids, and Dreamsign ids when present
- decline logs include site id and encounter signature
- validation failure logs include reason

Run the touched focused tests.

Expected: fail until logs are wired.

- [ ] **Step 2: Implement render logging**

In `DreamMerchantScreen`, log `merchant_offer_shown` once per encounter signature. Avoid render loops under React strict mode by tracking the last logged signature in a ref.

- [ ] **Step 3: Implement mutation logging metadata**

Use resolver result metadata to populate log payloads and action log summaries. Keep UUIDs/entry ids explicit.

- [ ] **Step 4: Add card source debug for visible grant cards**

If an offer or chooser displays grantable cards, set card source debug state with surface `"Reward"` or a new surface only if the type model requires it. Clear it on unmount. Do not use card names for debug identity.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/ui/DreamMerchantScreen.test.tsx src/state/quest-context.test.tsx src/state/multiplayer-quest-context.test.tsx
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/journey_v2/ui/DreamMerchantScreen.tsx src/state/quest-context.tsx src/state/multiplayer-quest-context.tsx src/state/quest-context.test.tsx src/state/multiplayer-quest-context.test.tsx
git commit -m "Log Dream Merchant v2 encounters" -m "Emit shown, accepted, declined, and validation-failed merchant events with site, offer, need, price, UUID, entry-id, and Dreamsign metadata. Surface visible grant cards through card source debug while the merchant screen is mounted."
git push
```

---

## Task 16: Polish Error Handling And Fallbacks

**Files:**
- Modify: `src/journey_v2/encounter/generateMerchantEncounter.ts`
- Modify: `src/journey_v2/ui/DreamMerchantScreen.tsx`
- Modify: `src/journey_v2/encounter/generateMerchantEncounter.test.ts`
- Modify: `src/journey_v2/ui/DreamMerchantScreen.test.tsx`

**Bug class caught:** blank screen when generation fails, empty chooser candidates, or stale accept leaving the player with no recovery path.

- [ ] **Step 1: Write failing fallback tests**

Tests should catch:
- empty candidate builders fall through to alternate rewards
- generation failure renders a contained fallback with walk-away action
- accept validation failure shows a stale-offer message and leaves the screen interactive
- missing fit model logs `merchant_fit_model_missing` and still generates an encounter

Run focused v2 tests.

Expected: fail for missing fallback paths.

- [ ] **Step 2: Implement fallbacks**

Add explicit fallback order in the director:
1. alternate builder for same need
2. lower-ranked need
3. deck improvement offer
4. Dreamsign or resource offer

In UI, catch generation errors inside a local boundary/fallback path and call decline/complete on walk-away.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npx vitest run src/journey_v2/encounter/generateMerchantEncounter.test.ts src/journey_v2/ui/DreamMerchantScreen.test.tsx
npm run typecheck
```

Expected: pass.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add src/journey_v2
git commit -m "Harden Dream Merchant v2 fallbacks" -m "Add explicit encounter fallback generation, missing-fit diagnostics, stale-accept feedback, and contained UI recovery so merchant sites remain completable under content or validation gaps."
git push
```

---

## Task 17: Run Full Automated Verification

**Files:** modify only if failures require fixes.

- [ ] **Step 1: Run core checks**

Run:

```bash
npm run lint
npm run typecheck
npm test
```

Expected: all pass.

- [ ] **Step 2: Fix failures with focused tests first**

For any failure, run the smallest failing test command, fix the issue, rerun the focused command, then rerun the full failed command.

- [ ] **Step 3: Commit and push if fixes were needed**

If tracked files changed:

```bash
git add <changed-files>
git commit -m "Stabilize Dream Merchant v2 checks" -m "Fix issues found by the full lint, typecheck, and Vitest verification pass for the gated v2 merchant implementation."
git push
```

---

## Task 18: Browser QA The Normal v2 Player Flow

**Files:** modify only if QA finds issues.

**Bug class caught:** render-time errors, broken Firebase room flow, clipped UI, unusable chooser controls, bad mobile stacking, or accepted rewards not visibly changing quest state.

- [ ] **Step 1: Start QA server on a non-5173 port**

Run:

```bash
npm run dev -- --port 5174
```

Capture the server PID. If the script ignores the port argument, use the actual printed Vite URL and do not kill any broad Vite process later.

- [ ] **Step 2: Open agent-browser**

Use `/opt/homebrew/bin/agent-browser` if available; otherwise `npx agent-browser`.

Open:

```bash
http://localhost:5174/?journey=v2
```

Install the JS error/rejection/console-error buffer before interacting.

- [ ] **Step 3: Exercise normal player flow**

Create a game, choose a Dream Avatar, enter the first Dream Journey site, and verify the merchant screen renders. Confirm:
- large center merchant image slot is visible
- both offers render concrete game objects and prices
- dialogue is visible and specific
- locked offers, if any, are disabled but readable
- direct offer accept changes state as expected
- chooser offer flow reaches final confirmation and changes state as expected
- walk-away completes the site on a separate run or after reload with a fresh room

- [ ] **Step 4: Check desktop and mobile viewports**

At a desktop viewport and a mobile viewport, verify:
- no text/control overlap
- no clipped buttons or prices
- card previews remain usable
- offer dimensions stay stable across review/chooser/confirmation states
- center-stage composition remains visually coherent

- [ ] **Step 5: Inspect captured errors**

Read the error, rejection, and console-error buffers. Expected: no render errors, unhandled rejections, or console errors caused by v2 merchant flow.

- [ ] **Step 6: Tear down only the QA server you started**

Kill only the captured PID or exact port process. Do not run broad `pkill -f vite`.

- [ ] **Step 7: Commit and push if QA fixes were needed**

If tracked files changed:

```bash
git add <changed-files>
git commit -m "Polish Dream Merchant v2 browser QA" -m "Fix layout, interaction, or runtime issues found while exercising the gated ?journey=v2 merchant through the normal player workflow with agent-browser."
git push
```

---

## Task 19: Final Verification And Handoff

**Files:** none unless final issues are found.

- [ ] **Step 1: Confirm branch status**

Run:

```bash
git status --short
git log --oneline -n 10
```

Expected: clean worktree after all intended commits.

- [ ] **Step 2: Confirm remote state**

Run:

```bash
git status --branch --short
```

Expected: branch is tracking `origin/wt/dream-merchant-v2` and is not ahead.

- [ ] **Step 3: Prepare promotion decision**

Because this task started under the `wt` skill, stop after implementation and ask whether to replay the worktree commits onto `master`. Do not promote without explicit approval.

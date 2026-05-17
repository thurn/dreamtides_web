# Dream Journey Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire each Dream Journey option's chosen template into actual `QuestState` mutations on Enter Dream, including an inline chooser overlay for chosen-target templates.

**Architecture:** A new `src/journeys/apply/` directory exposes `applyOption` / `applyBranch` that walk the manifest's `costs[]` and `effects[]` envelopes, dispatch on `templateId`, and call a `JourneyMutations` interface implemented by an adapter at `src/journeys/adapter/journeyMutations.ts`. The cost/reward template catalog gains an `apply(params, ctx, mut, resolution?)` method per template; the journey module stays isolated from `src/state` and `src/types`. Wave 1 lands every non-choice template plus the `QuestState` extensions; Wave 2 adds the chooser overlay and chosen-target templates.

**Tech Stack:** TypeScript, React, Vitest, existing `src/state/quest-context.tsx` reducer pattern.

**Spec:** `docs/superpowers/specs/2026-05-16-dream-journey-effects-design.md` is the source of truth for the `JourneyMutations` method list, `QuestState` field shapes, per-template apply behavior, chooser contract, and rollout boundaries. This plan references spec sections by name; **do not re-decide anything the spec already settled** — if the spec and this plan disagree, the spec wins.

**Worktree rule:** All work executes on the dedicated worktree at `/Users/dthurn/quest_prototype/.claude/worktrees/dream-journey-effects` on branch `worktree-dream-journey-effects` (created by the super-using-git-worktrees skill via the harness's native `EnterWorktree` tool — note the `worktree-` prefix the harness adds). **Nothing is pushed to master at any point.**

---

## File Structure

**New files (Wave 1):**
- `src/journeys/apply/JourneyMutations.ts` — interface (≈30 methods; see spec "JourneyMutations interface")
- `src/journeys/apply/payloads.ts` — narrowing helpers for `option.costs[]` / `option.effects[]`
- `src/journeys/apply/applyOption.ts` — walks an option's costs+effects
- `src/journeys/apply/applyBranch.ts` — walks a branch's or terminal's costs+effects
- `src/journeys/adapter/journeyMutations.ts` — implements `JourneyMutations` via `QuestMutations`
- `src/journeys/journey/shared/costs.apply.test.ts` — per-template apply unit tests (covers all Cost templates)
- `src/journeys/journey/shared/rewards.apply.test.ts` — per-template apply unit tests (covers all Reward templates)
- `src/journeys/apply/applyOption.test.ts`
- `src/journeys/apply/applyBranch.test.ts`
- `src/journeys/apply/payloads.test.ts`
- `src/journeys/adapter/journeyMutations.test.ts`

**New files (Wave 2):**
- `src/journeys/apply/chooserPlan.ts` — `ChooserRequest` / `ChooserResolution` types and helpers
- `src/journeys/ui/chooser/ChooserOverlay.tsx`
- `src/journeys/ui/chooser/CardChooser.tsx`
- `src/journeys/ui/chooser/DreamsignChooser.tsx`
- `src/journeys/ui/chooser/TransfigurationChooser.tsx`
- `src/journeys/ui/chooser/ChooserOverlay.test.tsx`
- `src/journeys/apply/chooserPlan.test.ts`

**Modified files:**
- `src/journeys/journey/shared/types.ts` — extend `Cost<P>` and `Reward<P>` with `apply` (Wave 1) and `choosePlan?` (Wave 2)
- `src/journeys/journey/shared/costs.ts` — add `apply` per template
- `src/journeys/journey/shared/rewards.ts` — add `apply` per template
- `src/journeys/ui/JourneyScreen.tsx` — accept `mutations` prop, call `applyOption` / `applyBranch`, host chooser overlay (Wave 2)
- `src/journeys/ui/JourneyScreen.test.tsx` — new cases for apply integration
- `src/components/ScreenRouter.tsx` — pass `mutations` into `JourneyScreen`
- `src/state/quest-context.tsx` — add `battleModifiers`, `shopModifiers`, `dreamscapeModifiers`, new mutations, decay reducers
- `src/types/quest.ts` — extend `QuestState` field types (or wherever `QuestState` lives — verify in Task 5)
- `src/state/quest-context.test.tsx` — reducer extensions tests
- `src/journeys/index.ts` — re-export `JourneyMutations`, `applyOption`, `applyBranch`

---

## Conventions used throughout this plan

- **TDD per task:** Write failing test → run and confirm failure → minimal implementation → run and confirm pass → commit. The conventions are spelled out the first time and abbreviated thereafter.
- **Commit messages:** `wave1: <task summary>` / `wave2: <task summary>` so the eventual squash to two commits is mechanical. Body explains *why*.
- **Type-check command:** `npm run typecheck` (or whatever the repo uses — confirm in Task 0). Run after every implementation step that touches a contract.
- **Test command:** `npx vitest run <path>` for one file; `npx vitest run` for the suite.
- **Source string convention:** Effect sources passed to `JourneyMutations.*` use `"dream_journey:<templateId>"` so existing log surfaces can attribute changes to the journey template that caused them.
- **No re-decoration of spec decisions:** When the spec's template-by-template table says a template is a no-op (visual / dreamwell / battle-window-only), the `apply` body is literally `mut /* skip */; logSkip(templateId, reason)` — do not invent partial behavior.

---

## Task 0: Set up the worktree

**Files:** none (workspace setup)

- [ ] **Step 1: Create the worktree via the super-using-git-worktrees skill**

The skill uses the harness's native `EnterWorktree` tool, which creates the worktree at `.claude/worktrees/dream-journey-effects` on a branch named `worktree-dream-journey-effects` (the harness prefixes the supplied name with `worktree-`). From here, every subsequent task runs in the worktree, not in the primary checkout.

- [ ] **Step 2: Verify environment**

Run from inside the worktree:

```bash
git branch --show-current   # → worktree-dream-journey-effects
git rev-parse HEAD          # → matches master HEAD
npm install                 # populate node_modules inside the worktree
npm run typecheck           # baseline must pass
npm test                    # baseline must pass (== `vitest run`)
```

If `npm run typecheck` is not the right command, grep `package.json` for the script and update the command throughout the plan.

- [ ] **Step 3: Read the spec end-to-end**

Read `docs/superpowers/specs/2026-05-16-dream-journey-effects-design.md` from the worktree. Sections that are load-bearing across many tasks:
- "JourneyMutations interface" — Tasks 2 and 6
- "QuestState extensions" — Task 5
- "Template-by-template plan" — Tasks 9–18 and 22–25
- "Chooser shapes" — Tasks 19–25
- "JourneyScreen wiring" — Tasks 4 and 21

---

## Wave 1: foundation, state, no-choice templates

### Task 1: Add the `apply` method to the `Cost` and `Reward` contracts

**Files:**
- Modify: `src/journeys/journey/shared/types.ts`
- Modify: `src/journeys/journey/shared/costs.ts` (every template gets a stub `apply`)
- Modify: `src/journeys/journey/shared/rewards.ts` (every template gets a stub `apply`)
- Test: none for this task — typechecking is the contract test.

**Why:** This is a pure contract change. Adding `apply` to the types breaks the build until every template defines one; the stubs let later tasks light up apply behavior template by template without compile errors blocking Wave 1 progress.

- [ ] **Step 1: Forward-declare `JourneyMutations` as a type-only import**

In `src/journeys/journey/shared/types.ts`, add:

```ts
import type { JourneyMutations } from "../../apply/JourneyMutations";
```

This is a forward reference; the file lands in Task 2.

- [ ] **Step 2: Extend `Reward<P>` and `Cost<P>` with `apply`**

Add to the `Reward<P>` shape (after `render`):

```ts
apply(params: P, ctx: JourneyContext, mut: JourneyMutations): void;
```

`Cost<P>` extends `Reward<P>`, so it inherits the method.

- [ ] **Step 3: Stub `apply: () => {}` on every Cost and Reward template**

For each template in `shared/costs.ts` and `shared/rewards.ts`, add `apply: () => {}` after `render`. Do not re-order other fields. This is the only mechanical edit; it produces a clean diff that subsequent template-implementation tasks turn into real behavior.

- [ ] **Step 4: Create a minimal `JourneyMutations` placeholder so the import resolves**

Create `src/journeys/apply/JourneyMutations.ts` with `export interface JourneyMutations { /* filled in Task 2 */ }` so typechecking does not error on the empty interface; widening happens in Task 2.

- [ ] **Step 5: `npm run typecheck`**

Expected: passes. Every template now has the method; no behavior changes.

- [ ] **Step 6: `npx vitest run`**

Expected: passes. Existing render/viable/locked tests are unaffected.

- [ ] **Step 7: Commit**

```
wave1: extend Cost/Reward with apply; stub on every template.

Adds the structural apply(params, ctx, mut) method to the Cost and
Reward template contracts. Every existing template gains an empty
apply stub so subsequent tasks can light up effect behavior one
template family at a time without breaking the build.
```

---

### Task 2: Define the `JourneyMutations` interface

**Files:**
- Modify: `src/journeys/apply/JourneyMutations.ts` (widen the placeholder)
- Test: typechecking is the contract test for this task.

**Why:** This is the spec's interface verbatim. Locking it in early lets every later task reference the method names without re-deciding signatures.

- [ ] **Step 1: Replace the placeholder with the full interface from the spec**

Copy the full `JourneyMutations` declaration from the spec section "JourneyMutations interface" into `src/journeys/apply/JourneyMutations.ts`. Add the imports the methods need:

```ts
import type { Dreamsign, SiteType, TransfigurationType } from "../../types/quest";
```

(Yes, this file imports `src/types/quest.ts`. The isolation contract in the spec calls out `src/journeys/apply/` as a file that MUST NOT import from `src/state/`; importing pure types from `src/types/` is permitted because they are type-only and add no runtime coupling. If the existing isolation lint rule disallows even types, gate it with the appropriate ignore comment and note the exception in the file's docstring.)

- [ ] **Step 2: Verify the isolation rule still holds**

```bash
grep -rn "from \"../../state\|from \"../../../state" src/journeys/apply/
```

Expected: empty output.

- [ ] **Step 3: `npm run typecheck`**

Expected: passes. Stub apply methods now reference a real (uncallable) interface.

- [ ] **Step 4: Commit**

```
wave1: define JourneyMutations interface.

Captures the spec's effect-application API. Cost/Reward template
apply methods take a JourneyMutations as their third arg; the
adapter in src/journeys/adapter/journeyMutations.ts (later task)
implements it via QuestMutations.
```

---

### Task 3: Build the payload-narrowing helpers

**Files:**
- Create: `src/journeys/apply/payloads.ts`
- Test: `src/journeys/apply/payloads.test.ts`

**What this catches:** The manifest types declare `option.costs[]` and `option.effects[]` as `unknown[]`. Without a runtime guard, a malformed envelope (e.g. missing `templateId`) would crash apply with a confusing stack trace. The guard turns it into a logged skip.

- [ ] **Step 1: Write failing tests**

Pin three invariants:
1. A well-formed `SharedCostPayload` (kind `"shared_cost_template"`, string `templateId`, object `params`) narrows successfully.
2. An entry with the wrong `kind` field returns `null` (caller logs and skips).
3. An entry missing `templateId` or `params` returns `null`.

Use `vitest`'s `it()` with a tiny fixture per case. Do not snapshot.

- [ ] **Step 2: Run tests, confirm failure**

```bash
npx vitest run src/journeys/apply/payloads.test.ts
```

Expected: FAIL (file does not exist).

- [ ] **Step 3: Implement `payloads.ts`**

Export two named guards: `narrowSharedCostPayload(value: unknown): SharedCostPayload | null` and `narrowSharedRewardPayload(value: unknown): SharedRewardPayload | null`. The payload shapes are in the spec section "`option.costs` and `option.effects` payload contract". A single shared internal helper extracts the common `{ kind, templateId, params, text, convertedEssence }` shape; the public functions only differ in the `kind` literal they check.

- [ ] **Step 4: Run tests, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: payload narrowing helpers for option.costs[] and option.effects[].

The manifest types declare these as unknown[]; narrowing at the apply
boundary keeps the dispatch loop's types honest and turns a malformed
envelope into a logged skip rather than a stack trace.
```

---

### Task 4: Build a no-op `JourneyMutations` test double

**Files:**
- Create: `src/journeys/apply/testing/recordingMutations.ts`
- Test: built-in to recording mutations (no separate test file)

**Why:** Every template apply test in later tasks needs to assert that the right `JourneyMutations` method was called with the right args. A small recording double keeps every per-template test trivial.

- [ ] **Step 1: Implement the recording double**

`recordingMutations.ts` exports `createRecordingMutations(): { mut: JourneyMutations; calls: MutCall[] }`. `MutCall` is a discriminated union of `{ method: keyof JourneyMutations; args: readonly unknown[] }` entries. Every interface method pushes an entry and returns. No assertions; the assertion is the caller's responsibility.

This file lives under `apply/testing/` rather than alongside production code so a future tree-shaking pass can drop it from the prod bundle.

- [ ] **Step 2: `npm run typecheck`**

Expected: passes. The double conforms to the (still-empty-bodied) `JourneyMutations` interface.

- [ ] **Step 3: Commit**

```
wave1: recording JourneyMutations test double for template apply tests.

Centralizes the "what calls did this template make?" assertion shape
so every per-template apply test in subsequent tasks stays a one-liner.
```

---

### Task 5: Add `QuestState` extensions and reducer hookups

**Files:**
- Modify: `src/types/quest.ts` (or wherever `QuestState` lives — confirm via `grep -rn "interface QuestState" src/types`)
- Modify: `src/state/quest-context.tsx`
- Test: `src/state/quest-context.test.tsx`

**Why:** The Wave 1 effects depend on three new state fields (`battleModifiers`, `shopModifiers`, `dreamscapeModifiers`) plus the mutations that push/decay them. Land these before the adapter so Task 6 can wire `JourneyMutations` to real mutation methods.

- [ ] **Step 1: Write the state-shape and reducer-behavior tests**

Pin these invariants (one test per bullet; no snapshots):
- `battleModifiers` is an empty readonly array on a freshly created `QuestState`.
- `shopModifiers` initializes to `{ freeRerolls: 0, upcomingOmenDiscounts: 0, essenceDiscountPercent: 0 }`.
- `dreamscapeModifiers` is an empty readonly array on a freshly created `QuestState`.
- `pushBattleRewardModifier("flat", 10, 2, src)` appends a `{ kind: "reward_reduction_flat", amount: 10, battlesRemaining: 2, source }` entry.
- `pushTemporaryBaneGrant(name, count, battles, src)` (a) appends a `{ kind: "temporary_bane_grant", ... addedEntryIds: [...] }` entry and (b) adds `count` bane cards to the deck whose `entryId`s match `addedEntryIds`.
- `incrementCompletionLevel(..., isMiniboss=*)` for a battle decrements every `battleModifiers[*].battlesRemaining`; entries at 0 drop; `temporary_bane_grant` entries at 0 additionally `removeDeckEntry` for each `addedEntryId`.
- `setCurrentDreamscape(newId)` (with `newId !== prev.currentDreamscape`) decrements every `dreamscapeModifiers[*].dreamscapesRemaining`; entries at 0 drop.
- `rerollShop(site)` with `shopModifiers.freeRerolls > 0` does not charge the omen cost and decrements `freeRerolls`.
- `grantFreeShopRerolls(3, src)` increments `shopModifiers.freeRerolls` by 3.
- `addSiteToDreamscape("current", "Shop", src)` adds a new site of type `Shop` to the current dreamscape and marks it `isVisited: false`.
- `addSiteToDreamscape("next", "Shop", src)` adds a new site of type `Shop` to the dreamscape adjacent to the current one (next-edge target).
- `replaceSiteType("Battle", "Essence", src)` swaps exactly one unvisited `Battle` site in the current dreamscape for an `Essence` site; if none exist, the mutation no-ops.
- `removeSiteTypeFromNextDreamscapes("Shop", 2, src)` adds a `dreamscapeModifiers` entry with `dreamscapesRemaining: 2` and `kind: "remove_shop_sites"`.
- `applyShopEssenceDiscount(20, src)` adds 20 to `shopModifiers.essenceDiscountPercent`.
- `grantShopOmenDiscounts(3, src)` increments `shopModifiers.upcomingOmenDiscounts` by 3.
- `boostSiteAppearance("Shop", 20, 3, src)` appends a `dreamscapeModifiers` entry with `kind: "boost_site_appearance"`, `siteType: "Shop"`, `dreamscapesRemaining: 3`.

Pick representative state fixtures, not the full content bundle.

- [ ] **Step 2: Run tests, confirm failure**

- [ ] **Step 3: Extend `QuestState` types**

In `src/types/quest.ts` (or wherever `QuestState` is defined), add the three fields per the spec's "QuestState extensions" section. Update the type discriminants for `BattleModifier` and `DreamscapeModifier` exactly as the spec defines them.

- [ ] **Step 4: Extend `QuestMutations`**

Add the new method signatures to `QuestMutations` in `src/state/quest-context.tsx`. Method names must be exactly:

```
pushBattleRewardModifier, pushTemporaryBaneGrant,
addSiteToDreamscape, replaceSiteType, removeSiteTypeFromNextDreamscapes,
grantFreeShopRerolls, applyShopEssenceDiscount, grantShopOmenDiscounts,
boostSiteAppearance, removeDeckEntry, duplicateDeckEntry, addCardById,
addBaneCardById, setEssence, changeOmens, changeMaxEssence
```

Several of these (`removeCard`, `addCard`, `addBaneCard`, `changeEssence`) already exist on `QuestMutations` but operate on `cardNumber: number` while the spec's `JourneyMutations` operates on `cardId: string`. Implement `addCardById` / `addBaneCardById` as new wrappers that look up the card by id (using `questContent.cardDatabase` keyed on `cardNumber` — adapter will pass the right number after lookup). `removeDeckEntry` should match the existing `removeCard(entryId, source)` exactly; if so, the new method can be an alias inside the adapter rather than a new reducer.

The naming pivot here is intentional: `JourneyMutations` uses `cardId` (the journey module's identifier) while `QuestMutations` uses `cardNumber` (the prototype's identifier). The adapter in Task 6 is the conversion site.

- [ ] **Step 5: Implement reducers**

For each new mutation method on `QuestMutations`, implement the `useCallback` reducer following the existing pattern in `quest-context.tsx`. The decay hookups:
- Add a "decrement and drop" pass to `incrementCompletionLevel` for `battleModifiers` when the completing site is a Battle (`completionLevel` increment is keyed on battle sites; verify the discriminator).
- Add a "decrement and drop" pass to `setCurrentDreamscape` when `nodeId !== prev.currentDreamscape`.
- Modify `rerollShop` to consume `freeRerolls` before charging omens.

- [ ] **Step 6: Update `createDefaultState`**

Initialize the three new fields to their empty defaults.

- [ ] **Step 7: Run tests, confirm pass**

- [ ] **Step 8: `npm run typecheck`**

Expected: passes. The bigger `QuestMutations` doesn't break callers (existing methods are unchanged).

- [ ] **Step 9: Commit**

```
wave1: QuestState extensions + reducer hookups for journey effects.

Adds battleModifiers, shopModifiers, dreamscapeModifiers fields and
the QuestMutations methods Wave-1 journey templates dispatch to.
Decay hookups: per-battle for battleModifiers (via
incrementCompletionLevel), per-dreamscape for dreamscapeModifiers
(via setCurrentDreamscape). rerollShop now consumes free-reroll
grants before omens.

Battle-side reading of battleModifiers to actually reduce essence
rewards is left for the battle code that lands separately; this
commit lands the push and the decay only.
```

---

### Task 6: Build the adapter — `JourneyMutations` → `QuestMutations`

**Files:**
- Create: `src/journeys/adapter/journeyMutations.ts`
- Test: `src/journeys/adapter/journeyMutations.test.ts`

**What this catches:** Wiring drift between `JourneyMutations` method names / argument orders and the underlying `QuestMutations`. Catching this once in adapter unit tests beats catching it in 50 template apply integration tests.

- [ ] **Step 1: Write the adapter test**

The test takes a recording `QuestMutations` (record `{ name, args }` per call), passes it through the adapter factory, and asserts:
- Each `JourneyMutations.<method>(...)` call results in exactly one corresponding `QuestMutations.<method>(...)` call with the args translated correctly (especially `cardId: string` → `cardNumber: number` lookups, and `transfigureDeckEntry(entryId, null, source)` → `transfigureCard(entryId, null, ...)` for the "remove transfiguration" variant).

Do not test every method individually as a separate "registers method X" assertion — that's a table-mirror test. Group them: one test per *class of translation* (passthrough, id→number lookup, null-transfiguration, source-string convention).

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement the adapter**

Export `createJourneyMutations(args: { mutations: QuestMutations; cardDatabase: Map<number, CardData> }): JourneyMutations`. Each method delegates. The `cardDatabase` is used by `addCardById` / `addBaneCardById` to convert `cardId: string` → `cardNumber: number`; if the id is missing from the database, log a `console.warn` and skip.

For `transfigureDeckEntry(entryId, null, source)`, the adapter calls `mutations.transfigureCard(entryId, null, "remove_transfiguration", {})` — depending on Task 5's null support in the underlying reducer, this may need a small reducer addition there. If so, defer that addition into Task 5's commit by going back and amending; do not introduce it in this commit.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: adapter wiring JourneyMutations to QuestMutations.

Single conversion site between the journey module's effect-application
API and the quest prototype's mutation reducers. Handles the
cardId→cardNumber translation and the null-transfiguration variant of
transfigureCard.
```

---

### Task 7: Build `applyOption` and `applyBranch`

**Files:**
- Create: `src/journeys/apply/applyOption.ts`
- Create: `src/journeys/apply/applyBranch.ts`
- Test: `src/journeys/apply/applyOption.test.ts`
- Test: `src/journeys/apply/applyBranch.test.ts`

**What these catch:** The dispatch loop — locked re-check, ordering (costs before effects), malformed envelope handling, missing-template handling. The per-template apply tests in later tasks cover *what* each template does; these two tests cover the *frame* around them.

- [ ] **Step 1: Write the failing tests**

For `applyOption.test.ts`, pin these contracts:
1. **Ordering:** an option with one cost (`pay_essence`) and one reward (`gain_essence`) calls the mutation methods in `[changeEssence(-cost), changeEssence(+reward)]` order.
2. **Locked re-check:** an option whose cost reports `locked(params, ctx) === true` at apply time results in zero mutation calls and a `dream_journey_locked_at_apply` log event.
3. **Missing-template warn:** a manifest with a `costs[]` entry whose `templateId` is not in the catalog logs a `console.warn` and continues processing remaining entries.
4. **Malformed envelope:** a `costs[]` entry that fails narrowing (e.g. missing `templateId`) logs `console.warn` and continues.
5. **No-op return:** the function returns `{ done: true }` on Wave 1 inputs (no chooser).
6. **Source string convention:** a sampled mutation call passes `source` containing `"dream_journey:pay_essence"` (one assertion is enough to pin the format — every template's source string follows the same template).
7. **Success log:** a successful apply emits exactly one `dream_journey_applied` log event whose `templateIds` field lists the option's cost+reward templateIds in encountered order. A locked-skip apply does NOT emit `dream_journey_applied` (only `dream_journey_locked_at_apply`).

For `applyBranch.test.ts`, replicate the ordering and locked-recheck cases against a tree branch fixture. Use a hand-built minimal `JourneyTreeBranch` — do not build a real manifest.

Do not write one test per template. The exhaustive per-template coverage lives in `shared/costs.apply.test.ts` and `shared/rewards.apply.test.ts`.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement `applyOption`**

Signature:

```ts
export type ApplyResult =
  | { done: true }
  | { done: false; needsChoice: ChooserRequest };  // Wave 2; on Wave 1 always `{ done: true }`

export function applyOption(
  option: JourneyOption,
  ctx: JourneyContext,
  mut: JourneyMutations,
  resolutions?: ReadonlyMap<string, ChooserResolution>,
): ApplyResult;
```

Algorithm:
1. Narrow `option.costs[]` and `option.effects[]` via the helpers from Task 3; collect well-formed envelopes; warn on the rest.
2. For each cost envelope: `const cost = getCost(envelope.templateId);` if missing, warn and continue.
3. **Locked re-check pass:** for every well-formed cost, call `cost.locked(envelope.params, ctx)`. If any is locked, emit the `dream_journey_locked_at_apply` log and return `{ done: true }` without applying.
4. **Apply pass:** for every cost, then every reward, call `template.apply(envelope.params, ctx, mut)`. Pass `resolutions?.get(requestIdFor(option, templateId))` as the 4th arg (Wave 2 templates read it; Wave 1 templates ignore it).
5. After the apply pass completes successfully, emit a `dream_journey_applied` log event with `{ siteId, journeyId, shapeId, optionNumber, templateIds }` (use the spec's "Logging" section as the source of truth for the payload).
6. Return `{ done: true }`.

`requestIdFor(option, templateId)` = `${option.number}:${templateId}:0`. (The `:0` slot is for the Wave-2 case where a single template emits more than one chooser; Wave 1 ignores it.)

- [ ] **Step 4: Implement `applyBranch`**

Same as `applyOption` but indexed off `branch.id` and operating on `branch.costs[]` / `branch.effects[]`. There is no `applyTerminal` separately; the terminal's `costs[]` and `effects[]` can be applied with the same function by passing `terminal` in place of `branch` (the shape matches structurally for the costs/effects fields). Type-narrow as needed.

- [ ] **Step 5: Run, confirm pass**

- [ ] **Step 6: Commit**

```
wave1: applyOption / applyBranch dispatch loop.

Walks an option's (or branch's) costs/effects envelopes, dispatches
on templateId, and calls the matching apply method. Locked re-check
runs before any mutation so generation-drift never produces a
partial apply. Malformed envelopes and unknown templateIds log and
continue rather than throwing.
```

---

### Task 8: Wire `JourneyScreen` to call `applyOption` / `applyBranch`

**Files:**
- Modify: `src/journeys/ui/JourneyScreen.tsx`
- Modify: `src/journeys/index.ts` (re-export apply functions and JourneyMutations)
- Modify: `src/components/ScreenRouter.tsx`
- Test: `src/journeys/ui/JourneyScreen.test.tsx` (new cases)

**Why:** This is the cutover from the rendered-only screen to the effect-applying screen. Before this commit, applying happens nowhere; after this commit, Wave 1 templates run end-to-end through the recording mutations.

- [ ] **Step 1: Add the new prop and re-route Enter Dream**

In `JourneyScreen.tsx`:
- Add `mutations: JourneyMutations` to `JourneyScreenProps`.
- Plumb it to `JourneyScreenInner` via prop.
- In `handleEnterFlat`, replace `onClose()` with:
  ```
  const result = applyOption(option, context, mutations);
  if (result.done) onClose();
  ```
- In `handleEnterBranch`, same pattern: call `applyBranch(branch, context, mutations)` before `advanceTree`. If `applyBranch` returns `{ done: false }` (Wave 2 only), abort the advance for now (Wave 2 wires this fully).
- When the next node is a terminal, call `applyBranch(terminal, context, mutations)` against the terminal's costs/effects before closing.

The Wave-1 apply call is always synchronous (no choosers), so the existing flow remains a single click → effects + close.

- [ ] **Step 2: Update the ScreenRouter wiring**

In `src/components/ScreenRouter.tsx`'s `DreamJourneySiteScreen`, build the adapter and pass it through:

```ts
const journeyMutations = useMemo(
  () => createJourneyMutations({ mutations, cardDatabase: questContent.cardDatabase }),
  [mutations, questContent.cardDatabase],
);

return (
  <JourneyScreen
    context={journeyContext}
    onClose={handleClose}
    mutations={journeyMutations}
  />
);
```

- [ ] **Step 3: Update `src/journeys/index.ts`**

Re-export the new public surface:

```ts
export { JourneyScreen } from "./ui/JourneyScreen";
export type { JourneyMutations } from "./apply/JourneyMutations";
export { createJourneyMutations } from "./adapter/journeyMutations";
```

(The internal `applyOption` / `applyBranch` are not re-exported; they're called only inside `JourneyScreen`.)

- [ ] **Step 4: Extend the existing screen tests**

Add cases to `JourneyScreen.test.tsx`:
- Enter Dream on a flat option with one `pay_essence` cost + one `gain_essence` reward: a recording `JourneyMutations` records the two calls and `onClose` fires.
- Enter Dream on a tree branch: branch apply happens, `currentNodeId` advances.
- Enter Dream into a terminal: terminal apply happens, `onClose` fires.
- Existing test for locked-button disabled remains green.

These tests construct hand-built `JourneyManifest` fixtures; do not run real generation.

- [ ] **Step 5: Run, confirm pass**

- [ ] **Step 6: `npm run typecheck`**

- [ ] **Step 7: Commit**

```
wave1: route JourneyScreen Enter Dream through applyOption/applyBranch.

JourneyScreen now accepts a JourneyMutations prop and dispatches the
chosen option's costs and effects through it before closing. The
dreamscape site router wires the adapter built from QuestMutations +
the card database. Template apply methods are still stubs at this
point; subsequent tasks implement them template family by template
family.
```

---

### Task 9: Resource cost and reward apply

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts` (resource templates)
- Modify: `src/journeys/journey/shared/rewards.ts` (resource templates)
- Test: `src/journeys/journey/shared/costs.apply.test.ts`
- Test: `src/journeys/journey/shared/rewards.apply.test.ts`

**Templates in scope (from spec):** `pay_essence`, `pay_omens`, `pay_max_essence`, `pay_essence_random_range`, `pay_percent_essence`, `pay_all_remaining_essence`, `lose_max_essence` (costs); `gain_essence`, `gain_omens`, `set_essence_to_percent_of_max`, `gain_essence_random_range`, `gain_essence_to_max`, `increase_max_essence` (rewards).

- [ ] **Step 1: Write the failing tests**

In `costs.apply.test.ts` and `rewards.apply.test.ts`, set up one fixture context with `essence: 100, maxEssence: 200, omens: 3`. Use the recording double from Task 4.

Per template, assert the exact sequence of recorded calls for a fixed input. For example:
- `pay_essence` with `{ x: 50 }` → `[{ method: "changeEssence", args: [-50, "dream_journey:pay_essence"] }]`.
- `pay_percent_essence` with `{ percent: 50 }` against `essence: 100` → `[{ method: "changeEssence", args: [-50, "dream_journey:pay_percent_essence"] }]`.
- `gain_essence_random_range` with `{ min: 30, max: 60 }` → a single `changeEssence` call whose arg is in `[30, 60]` and is deterministic for a fixed seed (assert the exact rolled value).
- `gain_essence_to_max` against `essence: 100, maxEssence: 200` → `[{ method: "setEssence", args: [200, "dream_journey:gain_essence_to_max"] }]`.

For `pay_essence_random_range` specifically: the spec says the roll uses the labeled RNG; pin the seed and assert the deterministic value. This is the single "exact value" assertion in this batch — every other template's recorded args follow trivially from the params and don't add risk if they drift.

This is the *one* place per template family where pinning the literal mutation call is justified — it catches "did I wire the right method name with the right sign?" which a smoke test wouldn't catch. Do not add additional table-mirror assertions on top.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement the apply bodies**

For each resource template, replace the Task-1 stub with the apply body per the spec's "Template-by-template plan / Costs" and "/ Rewards" tables. The body for each is a one-to-three-line dispatch.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply resource costs and rewards.

Lights up gain_essence, gain_omens, set_essence_to_percent_of_max,
gain_essence_random_range, gain_essence_to_max, increase_max_essence,
pay_essence, pay_omens, pay_max_essence, pay_essence_random_range,
pay_percent_essence, pay_all_remaining_essence, lose_max_essence.
Random-range templates roll deterministically against the option's
labeled RNG.
```

---

### Task 10: Bane cost and reward apply

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `costs.apply.test.ts`, `rewards.apply.test.ts`

**Templates in scope:** `gain_random_banes`, `gain_named_banes`, `gain_named_banes_for_X_battles` (costs); `purge_X_banes`, `purge_all_banes` (rewards).

- [ ] **Step 1: Write the failing tests**

Per template, assert:
- `gain_random_banes` with `{ count: 2 }` makes exactly 2 `addBaneCardById` calls; the bane names are drawn deterministically from `BANE_NAMES` for the fixed seed.
- `gain_named_banes` with `{ baneName: "Despair", count: 1 }` makes one `addBaneCardById` whose `cardId` corresponds to the Despair bane (assert the cardId via the bane-name→cardId lookup helper).
- `gain_named_banes_for_X_battles` with `{ baneName: "Despair", count: 1, battles: 3 }` makes exactly one `pushTemporaryBaneGrant("Despair", 1, 3, ...)` call (the bane-card addition happens *inside* the mutation, not at the apply layer).
- `purge_X_banes` with `{ count: 3 }` → one `purgeRandomBaneCards(3, ...)` call.
- `purge_all_banes` → one `purgeAllBaneCards(...)` call.

Each bane-name → cardId lookup needs a content fixture; build the smallest possible bundle (one bane card per bane name in `BANE_NAMES`).

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

Look up bane card by name from the journey context's content bundle. If a name is missing from content, log a warn and skip that iteration.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply bane templates.
```

---

### Task 11: Dreamsign cost and reward apply

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `costs.apply.test.ts`, `rewards.apply.test.ts`

**Templates in scope:** `purge_named_dreamsign`, `purge_random_dreamsign` (costs); `gain_random_dreamsign`, `gain_named_dreamsign`, `gain_copy_of_random_dreamsign` (rewards). Chosen variants defer to Wave 2.

- [x] **Step 1: Write the failing tests**

Per template, assert exact recorded calls. For `gain_random_dreamsign` with a 2-element `dreamsignPoolIds` fixture, the rolled dreamsign id matches the deterministic seed; the recorded call is `addDreamsign(<dreamsign>, "dream_journey:gain_random_dreamsign", undefined)`. For `purge_named_dreamsign`, the `index` argument matches the position of the named dreamsign in `activeDreamsigns`.

- [x] **Step 2: Run, confirm failure**

- [x] **Step 3: Implement**

For named-dreamsign lookups, resolve from the content bundle (use the existing `ctx.content.dreamsigns` lookup pattern from `costs.ts`). For random rolls, use the same `pickFromList` / `drawInt` helpers `rollParams` already uses; pin the labeled-RNG key prefix to the template id.

- [x] **Step 4: Run, confirm pass**

- [x] **Step 5: Commit**

```
wave1: apply dreamsign templates (non-choice).
```

---

### Task 12: Card add / gain / transform apply

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `costs.apply.test.ts`, `rewards.apply.test.ts`

**Templates in scope:** `gain_random_cards_from_pool`, `transform_card_to_random_pool` (costs); `gain_random_predicate_cards`, `gain_named_card`, `gain_additional_starters`, `transform_starter_into_named_card`, `transform_card_in_deck_into_named` (rewards).

- [ ] **Step 1: Write the failing tests**

Build a deck fixture and content fixture. Per template, assert:
- `gain_random_predicate_cards` with `{ predicateId, count: 2 }` rolls 2 distinct catalog ids matching the predicate; recorded calls are 2 `addCardById` entries.
- `transform_card_in_deck_into_named` removes the named deck entry and adds the target card. Assert *both* `removeDeckEntry` and `addCardById` are recorded, in that order.
- `gain_additional_starters` with `{ count: 1 }` rolls one starter cardId from the catalog and records an `addCardById`.

Don't write a separate "calls addCardById" assertion for every template — that's table-mirror. Pin the *sequence* and *count* for each, and assert one literal cardId on `gain_named_card` to catch the name→id lookup wiring.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

Catalog-id rolls use the same predicate-matching helpers `rollParams` uses (`cardMatches`, `pickFromList`). The name→id helper is `ctx.content.cards.find(c => c.name === p.name)?.id`; on miss, warn and skip.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply card add/gain/transform templates (non-choice).
```

---

### Task 13: Card purge apply (non-choice)

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `costs.apply.test.ts`, `rewards.apply.test.ts`

**Templates in scope:** `purge_named_card`, `purge_random_predicate_card`, `purge_all_duplicate_cards` (costs); `purge_named_starter`, `purge_random_starter`, `purge_random_starter_with_predicate_replacement`, `purge_all_starters` (rewards).

- [ ] **Step 1: Write the failing tests**

Per template:
- `purge_named_card` with a deck containing that card: records exactly one `removeDeckEntry(<entryId>, ...)`.
- `purge_random_predicate_card` with `{ predicateId }`: records one `removeDeckEntry` whose entryId matches the deterministic roll.
- `purge_all_duplicate_cards` against a deck with stacks `[A x3, B x1]`: records exactly two `removeDeckEntry` calls (drop two of the three As).
- `purge_random_starter_with_predicate_replacement`: records one `removeDeckEntry` (a starter) then one `addCardById` (a predicate match). Order matters; assert it.
- `purge_all_starters` against `[starter1, starter1, non-starter]`: records two `removeDeckEntry` calls.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

Helper `findDeckEntriesByName(deck, name)` and `findDeckEntriesByPredicate(deck, predicateId)` live alongside the apply bodies in `shared/costs.ts` and are reused inside `shared/rewards.ts` via a small internal import. Do not duplicate.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply card purge templates (non-choice).
```

---

### Task 14: Card duplicate apply (non-choice)

**Files:**
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `rewards.apply.test.ts`

**Templates in scope:** `duplicate_named_card_X`, `duplicate_random_predicate`.

- [ ] **Step 1: Write the failing tests**

- `duplicate_named_card_X` with `{ name, copies: 2 }` against a deck containing the named card: records `duplicateDeckEntry(<entryId>, ...)` exactly 2 times.
- `duplicate_random_predicate` with `{ predicateId, count: 2 }`: records 2 `duplicateDeckEntry` calls; the chosen entry ids are deterministic against the seed.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply card duplicate templates (non-choice).
```

---

### Task 15: Transfiguration apply (non-choice)

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `costs.apply.test.ts`, `rewards.apply.test.ts`

**Templates in scope:** `remove_transfiguration_from_card`, `remove_transfigurations_from_random_predicate` (costs); `apply_named_transfiguration_to_card_name`, `apply_named_transfiguration_to_random_predicate_cards`, `apply_named_transfiguration_to_all_predicate_cards`, `transfigure_random_starters`, `transfigure_all_starters`, `apply_random_transfigurations_to_random_cards` (rewards).

- [ ] **Step 1: Write the failing tests**

Per template, assert the exact sequence of `transfigureDeckEntry(entryId, type, source)` calls. Cover:
- A named-card transfig with a deck miss: zero calls + a logged skip.
- `apply_named_transfiguration_to_all_predicate_cards` against a deck with 3 matching entries: 3 `transfigureDeckEntry` calls with the same `type`.
- `remove_transfiguration_from_card` against an entry whose current transfiguration is non-null: one call with `type: null`.
- `apply_random_transfigurations_to_random_cards` with `{ count: 2 }`: 2 calls; the (entry, transfiguration) pairings are deterministic against the seed.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

Reuse the deck-entry-by-name / deck-entries-by-predicate helpers from Task 13. The transfiguration argument is `p.transfiguration` (already validated against the predicate's eligibility in `viable`).

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply transfiguration templates (non-choice).
```

---

### Task 16: Atlas / route apply

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `costs.apply.test.ts`, `rewards.apply.test.ts`

**Templates in scope:** `remove_shop_sites_from_next_dreamscapes`, `remove_dreamsign_sites_from_next_dreamscapes` (costs); `add_site_to_dreamscape`, `add_site_to_next_dreamscape`, `replace_site_type`, `boost_site_appearance_chance` (rewards).

- [ ] **Step 1: Write the failing tests**

Per template, assert the exact recorded call. For `boost_site_appearance_chance` confirm that when `p.dreamscapes` is absent (older manifests may omit it), the call uses the spec's default of 3.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

Each body is a single `mut.<method>(...)` call. Don't reach into `JourneyContext` for atlas state; the mutation reducer owns the read.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply atlas/route templates.
```

---

### Task 17: Battle-window and shop apply

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `costs.apply.test.ts`, `rewards.apply.test.ts`

**Templates in scope:** `battle_reward_reduction_flat`, `battle_reward_reduction_percent` (costs); `next_X_shop_rerolls_free`, `shop_essence_discount`, `shop_omen_discount` (rewards).

- [ ] **Step 1: Write the failing tests**

Per template, assert the exact recorded call against the corresponding `JourneyMutations` method.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply battle-window and shop templates.
```

---

### Task 18: Meta-compound apply + visual / no-op templates

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `costs.apply.test.ts`, `rewards.apply.test.ts`

**Templates in scope:**
- Meta: `meta_pay_2_costs`, `meta_gain_2_rewards`.
- Card-rules-text no-ops (visual): `make_card_reclaim`, `make_random_cards_reclaim`, `change_card_to_become_type`, `modify_random_cards_to_types`, `make_random_cards_fast`, `card_cost_reduction_for_X_battles`.
- Battle-window-only no-ops: `opening_hand_grant_for_X_battles`, `temporary_card_copy_for_X_battles`, `temporary_dreamsign_for_X_battles`.
- Dreamwell no-ops: `set_starting_dreamwell_negative`, `shuffle_negative_dreamwell_cards`, `set_starting_dreamwell_positive`, `shuffle_positive_dreamwell_cards`.

- [ ] **Step 1: Write the failing tests**

For the meta templates:
- `meta_pay_2_costs` with two Wave-1 sub-cost ids: records the union of the two sub-costs' calls, in sub-cost order.
- `meta_gain_2_rewards` with two Wave-1 sub-reward ids: same property.

For no-op templates: assert (a) zero `mut.*` calls and (b) one `dream_journey_skipped_visual` log event with the correct `reason` field (`"visual"` for card-rules-text, `"battle_window"` for the per-battle grants, `"dreamwell"` for dreamwell).

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

For meta templates, the apply body resolves each sub-id via `getCost` / `getReward` and recurses into `subTemplate.apply(subParams, ctx, mut)`. The Wave-2 case (when a sub-template needs a chooser) is handled in Task 22; for now, sub-template apply runs to completion. If a Wave-2-only sub-template is ever picked at Wave 1, its `apply` is still a stub (per Task 1), so the meta call records nothing — acceptable until Wave 2 lands.

For no-op templates, the apply body calls a `logSkippedVisual(templateId, reason)` helper that emits the `dream_journey_skipped_visual` log event. Put the helper in `apply/skipLog.ts` (new file).

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave1: apply meta-compound, visual, battle-window-only, and dreamwell no-op templates.

Meta-compound recurses into both sub-templates in order. Visual,
battle-window-only, and dreamwell templates emit a
dream_journey_skipped_visual log event with the documented reason and
make no mutation calls.
```

---

### Task 19: Wave 1 smoke pass + dev-server manual QA

**Files:** none modified.

**Why:** Wave 1 mutations now run end-to-end. Validate against the spec's "Manual QA / After Wave 1" checklist before declaring Wave 1 done.

- [ ] **Step 1: Run the full test suite**

```bash
npm run typecheck
npx vitest run
```

Expected: passes.

- [ ] **Step 2: Run the dev server and walk the spec's Wave-1 QA checklist**

```bash
npm run dev    # or whatever the repo's dev script is
```

Open a Dream Journey site and verify each bullet in the spec's "Manual QA (run from the worktree) / After Wave 1" list:
- `gain_essence` updates the resource bar.
- `gain_random_predicate_cards` adds a card to the deck.
- `purge_X_banes` removes banes from a state with banes.
- `add_site_to_next_dreamscape` adds the site.
- `battle_reward_reduction_flat` shows up in `state.battleModifiers`.
- A visual no-op closes the journey, logs `dream_journey_skipped_visual`, deck unchanged.
- A `push_your_luck` tree applies per-branch costs as the player advances.

If any QA item fails, file a fix as a follow-up sub-task before moving to Wave 2; do not paper over it.

- [ ] **Step 3: Tag the Wave 1 boundary**

```bash
git tag wave1-complete
```

The tag is local-only (no push); it marks the squash boundary for the eventual two-commit history.

---

## Wave 2: chooser overlay and chosen-target templates

### Task 20: Define `ChooserRequest` / `ChooserResolution` types and the `choosePlan` method

**Files:**
- Create: `src/journeys/apply/chooserPlan.ts`
- Modify: `src/journeys/journey/shared/types.ts`

**Why:** Pure type / contract work — locks in the chooser surface so subsequent tasks can use the names confidently.

- [ ] **Step 1: Copy the type definitions from the spec**

The `ChooserRequest`, `ChooserResolution`, and `ApplyResult` types are defined verbatim in the spec section "Chooser shapes (Wave 2)". Copy them into `chooserPlan.ts`. Export them all.

- [ ] **Step 2: Add `choosePlan?` to the `Cost<P>` and `Reward<P>` shapes**

In `src/journeys/journey/shared/types.ts`:

```ts
choosePlan?(params: P, ctx: JourneyContext): ChooserRequest | undefined;
```

(Imported from `../../apply/chooserPlan`.)

The 4th `resolution?: ChooserResolution` arg on `apply` was already declared in Task 1's signature. Confirm the placeholder name matches; rename if not.

- [ ] **Step 3: Export `requestIdFor` helper**

`requestIdFor(optionNumberOrBranchId: number | string, templateId: string, slot: number = 0)` returns `"${id}:${templateId}:${slot}"`. Used in Task 7's `applyOption` already (with `slot = 0`); Wave 2 templates that emit multiple choosers per option will pass a non-zero slot.

- [ ] **Step 4: `npm run typecheck`**

Expected: passes; all templates already have `apply` stubs, `choosePlan` is optional.

- [ ] **Step 5: Commit**

```
wave2: chooser request/resolution types and Cost/Reward.choosePlan hook.
```

---

### Task 21: Two-phase apply (planOption / commitOption)

**Files:**
- Modify: `src/journeys/apply/applyOption.ts`
- Modify: `src/journeys/apply/applyBranch.ts`
- Modify: `src/journeys/apply/applyOption.test.ts`
- Modify: `src/journeys/apply/applyBranch.test.ts`

**What this catches:** The cancel-leaves-no-mutations contract. If `applyOption` ran mutations as it walked, the player canceling chooser #2 would leave chooser #1's effects already applied. Two-phase apply (plan all, then commit all) makes this structural.

- [ ] **Step 1: Extend the existing tests**

Add cases:
- An option whose first template (`apply_named_transfiguration_to_chosen_predicate_cards`) has a `choosePlan` returns `{ done: false, needsChoice: <request> }` and records zero `mut.*` calls.
- The same option, called a second time with a populated `resolutions` map, records the expected `transfigureDeckEntry` calls.
- An option with two chosen-target templates: first call returns chooser #1, second call (after #1 resolved) returns chooser #2, third call (after both resolved) runs all mutations in order.
- Cancel semantics: per the spec, cancel is the *caller's* contract (the screen drops the resolutions map and re-enters). `applyOption` itself never mutates without resolutions; the cancel test is on the screen side (Task 22).

- [ ] **Step 2: Refactor `applyOption`**

Split into `planOption(option, ctx)` (pure; returns the list of choosers needed in order) and `commitOption(option, ctx, mut, resolutions)` (applies). `applyOption` becomes:

```ts
const plan = planOption(option, ctx);
const nextMissing = plan.find(req => !resolutions?.has(req.requestId));
if (nextMissing) return { done: false, needsChoice: nextMissing };
// re-run locked check at apply time
if (anyCostLocked(option, ctx)) {
  logLockedAtApply(...);
  return { done: true };
}
commitOption(option, ctx, mut, resolutions ?? new Map());
return { done: true };
```

`planOption` walks costs then effects and collects every `template.choosePlan?(envelope.params, ctx)` that returns a request. `commitOption` walks the same order and calls `template.apply(envelope.params, ctx, mut, resolution?)` for each.

- [ ] **Step 3: Mirror the split for `applyBranch`**

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave2: two-phase apply — planOption/commitOption split.

planOption walks every cost/effect and collects ChooserRequests
without mutation. commitOption walks the same order and applies.
This makes the cancel-leaves-no-mutations contract structural: if
the screen drops its resolutions map, no commit ever happened.
```

---

### Task 22: Chooser overlay components

**Files:**
- Create: `src/journeys/ui/chooser/ChooserOverlay.tsx`
- Create: `src/journeys/ui/chooser/CardChooser.tsx`
- Create: `src/journeys/ui/chooser/DreamsignChooser.tsx`
- Create: `src/journeys/ui/chooser/TransfigurationChooser.tsx`
- Test: `src/journeys/ui/chooser/ChooserOverlay.test.tsx`

**What the tests catch:** The selection-count gate (Confirm disabled outside `[minPicks, maxPicks]`), and the cancel-clears-nothing-applied contract at the UI layer.

- [ ] **Step 1: Write the failing tests**

Pin these contracts using `@testing-library/react`:
- **Card chooser, count gate:** A request with `minPicks: 1, maxPicks: 2` and a 4-card pool — Confirm is disabled with zero picks, enabled with 1 or 2 picks, disabled with 3 picks.
- **Card chooser, confirm payload:** Picking entries `[e1, e3]` and confirming fires `onResolve({ kind: "card", entryIds: ["e1", "e3"] })`.
- **Dreamsign chooser, confirm payload:** Picking index 1 fires `onResolve({ kind: "dreamsign", indices: [1], dreamsignIds: ["<id>"] })`.
- **Transfiguration chooser, ineligibility:** Tiles in the `eligibleTransfigurations` list are clickable; others are grayed out and non-clickable.
- **Cancel:** Clicking Cancel fires `onCancel()` and never fires `onResolve`.

Do not snapshot the rendered DOM — overlay markup will iterate visually. Snapshots add maintenance cost without catching the bugs above.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`ChooserOverlay` is the chrome (header, body slot, cancel/confirm footer, semi-transparent dim background) and forwards confirm/cancel to its caller. The three body components are body-slot-only, expose props for `request: ChooserRequest`, `onResolve(resolution: ChooserResolution): void`, and `onCancel(): void`. Implementation detail (grid layout, color tiles, etc.) is at the component author's discretion — the tests pin the contract.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave2: chooser overlay components (card / dreamsign / transfiguration).

ChooserOverlay hosts the modal chrome; three body components implement
the per-kind selection grids. Confirm is gated on the request's
minPicks/maxPicks; cancel fires without resolving.
```

---

### Task 23: Wire choosers into `JourneyScreen`

**Files:**
- Modify: `src/journeys/ui/JourneyScreen.tsx`
- Modify: `src/journeys/ui/JourneyScreen.test.tsx`

**What this catches:** The full integration — Enter Dream → chooser mount → confirm → re-enter applyOption → commit → close. And the cancel path: chooser unmounts, screen stays, no mutations recorded.

- [ ] **Step 1: Write the failing integration tests**

Add these cases to `JourneyScreen.test.tsx`:
- Enter Dream on an option whose first template needs a chooser: the overlay mounts; the recording `JourneyMutations` has zero calls.
- After confirming the chooser: the overlay unmounts, the expected mutations fire, `onClose` fires.
- Cancel from the overlay: the overlay unmounts, the screen remains, the recording `JourneyMutations` has zero calls, a `dream_journey_chooser_cancelled` log event fires with the cancelled request's `requestId`; clicking Enter Dream on the same option re-mounts the overlay with a fresh resolutions map.
- Sequential choosers: an option with two chosen-target templates progresses chooser #1 → chooser #2 → apply.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

State additions:

```ts
const [resolutions, setResolutions] = useState<Map<string, ChooserResolution>>(
  () => new Map(),
);
const [pendingChooser, setPendingChooser] = useState<ChooserRequest | null>(null);
const [committedOption, setCommittedOption] = useState<JourneyOption | null>(null);
const [committedBranch, setCommittedBranch] = useState<JourneyTreeBranch | null>(null);
```

The "which option is the player committing to" state pair lets the screen re-enter `applyOption` after a chooser confirm without the player re-clicking. On confirm:

```ts
const next = new Map(resolutions).set(request.requestId, resolution);
setResolutions(next);
setPendingChooser(null);
const target = committedOption ?? committedBranch;
const result = target === committedOption
  ? applyOption(committedOption!, context, mutations, next)
  : applyBranch(committedBranch!, context, mutations, next);
if (result.done) {
  // existing close / advance logic
} else {
  setPendingChooser(result.needsChoice);
}
```

On cancel:

```ts
logEvent("dream_journey_chooser_cancelled", {
  siteId, journeyId: manifest.journeyId, requestId: pendingChooser!.requestId,
});
setResolutions(new Map());
setPendingChooser(null);
setCommittedOption(null);
setCommittedBranch(null);
```

When Enter Dream is first clicked on a flat option:

```ts
setCommittedOption(option);
const result = applyOption(option, context, mutations, new Map());
if (result.done) { onClose(); /* clear committed state */ }
else { setPendingChooser(result.needsChoice); }
```

The "fresh resolutions map on each top-level click" property is what catches the cancel-then-retry case.

The exact wiring above is a recommendation — different state factorings are acceptable as long as the tests pass.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave2: JourneyScreen choosers + two-phase apply re-entry.

Enter Dream mounts a ChooserOverlay when applyOption/applyBranch
returns needsChoice; confirm re-enters apply with the resolution
added; cancel drops the resolutions map and unmounts the overlay
without applying anything.
```

---

### Task 24: Wave 2 chosen-target cost apply

**Files:**
- Modify: `src/journeys/journey/shared/costs.ts`
- Test: `src/journeys/journey/shared/costs.apply.test.ts`

**Templates in scope:** `purge_chosen_predicate_card`, `purge_chosen_dreamsign`, `transform_dreamsign_to_random`, `draw_X_purge_chosen`.

- [ ] **Step 1: Write the failing tests**

Per template:
- `choosePlan(params, ctx)` returns a `ChooserRequest` whose `poolKind`, filters, and pick counts match the spec.
- `apply(params, ctx, mut, resolution)` with a populated resolution records the expected mutations.
- `apply(params, ctx, mut, undefined)` records zero mutations (defensive — should never happen because `commitOption` guarantees resolutions are present, but the apply body should be defensive enough that the test passes).

For `draw_X_purge_chosen`, the pre-rolled `drawCount`-sized subset is part of the `ChooserRequest.rolledCardIds`; the test pins that the rolled subset is deterministic against the seed.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement `choosePlan` and `apply` for each**

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave2: apply chosen-target cost templates.

purge_chosen_predicate_card, purge_chosen_dreamsign,
transform_dreamsign_to_random, draw_X_purge_chosen.
```

---

### Task 25: Wave 2 chosen-target reward apply — transfiguration family

**Files:**
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `src/journeys/journey/shared/rewards.apply.test.ts`

**Templates in scope:** `apply_chosen_transfiguration_to_chosen_card` (needs *two* sequential choosers), `apply_named_transfiguration_to_chosen_predicate_cards`, `transfigure_chosen_starters`.

- [ ] **Step 1: Write the failing tests**

- `apply_chosen_transfiguration_to_chosen_card`:
  - `choosePlan` returns the transfiguration chooser first (slot 0).
  - With a transfiguration resolution provided, the *second* call to `choosePlan` (via two-phase apply with one resolution present) returns the card chooser (slot 1) filtered by the chosen transfiguration's eligibility.
  - With both resolutions: apply records one `transfigureDeckEntry(<entryId>, <type>, ...)`.

  Note: this template needs two sequential choosers, so `choosePlan` returns the *next* chooser given the current resolutions. Either widen the signature to take `resolutions` or implement as a generator-style helper. Recommendation: pass `resolutions` to `choosePlan` for templates that emit multiple choosers. Add this to the `choosePlan` signature in Task 20 if not already there; if Task 20 didn't include it, amend Task 20 and re-test.

- `apply_named_transfiguration_to_chosen_predicate_cards`: one chooser; on resolve, N `transfigureDeckEntry` calls.

- `transfigure_chosen_starters`: one chooser over starter entries; on resolve, N `transfigureDeckEntry` calls.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave2: apply chosen-target transfiguration rewards.
```

---

### Task 26: Wave 2 chosen-target reward apply — purge / transform / duplicate family

**Files:**
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `src/journeys/journey/shared/rewards.apply.test.ts`

**Templates in scope:** `purge_chosen_predicate_cards`, `purge_chosen_predicate_with_replacement`, `transform_chosen_predicate_into_named`, `duplicate_chosen_cards`, `draw_X_and_duplicate_chosen`, `replace_starter_via_draft`, `purge_chosen_starters`.

- [ ] **Step 1: Write the failing tests**

Per template, assert: `choosePlan` returns the expected request, and `apply` with a populated resolution records the expected mutation sequence. For `purge_chosen_predicate_with_replacement`: `apply` records both `removeDeckEntry` and the rolled `addCardById` (the replacement is rolled, not chosen). For `replace_starter_via_draft`: `choosePlan` returns a card chooser over 4 rolled draft candidates; apply records `removeDeckEntry` (random starter) then `addCardById` (chosen).

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave2: apply chosen-target purge/transform/duplicate reward templates.
```

---

### Task 27: Wave 2 chosen-target reward apply — drafts and dreamsigns

**Files:**
- Modify: `src/journeys/journey/shared/rewards.ts`
- Test: `src/journeys/journey/shared/rewards.apply.test.ts`

**Templates in scope:** `draft_predicate_cards_from_4`, `draft_2_predicate_cards_from_4`, `take_any_from_predicate_choices`, `draft_predicate_card_with_copies`, `draft_predicate_card_with_transfiguration`, `choose_1_of_X_dreamsigns`, `gain_copy_of_chosen_dreamsign`, `transform_dreamsign_to_named`.

- [ ] **Step 1: Write the failing tests**

Per template:
- `draft_predicate_cards_from_4`: `choosePlan` returns a card request with 4 pre-rolled candidates, `minPicks: 1, maxPicks: 1`; apply records one `addCardById`.
- `draft_2_predicate_cards_from_4`: same as above with `minPicks: 2, maxPicks: 2`; apply records 2 `addCardById` calls.
- `take_any_from_predicate_choices`: `minPicks: 0, maxPicks: p.choices`; apply records as many `addCardById` calls as the player picked.
- `draft_predicate_card_with_copies`: one chooser → apply records `addCardById` `p.copies` times for the same id.
- `draft_predicate_card_with_transfiguration`: one chooser → apply records `addCardById` then `transfigureDeckEntry` against the new entry. Verify the entryId-of-the-just-added-card is captured (this is the hard part; the test must show how — see Step 3 below).
- `choose_1_of_X_dreamsigns`: one dreamsign chooser → apply records one `addDreamsign`.
- `gain_copy_of_chosen_dreamsign`: chooser over active dreamsigns → apply records `addDreamsign(<copy of chosen>)`.
- `transform_dreamsign_to_named`: chooser over active dreamsigns → apply records `removeDreamsign(index)` then `addDreamsign(<named>)`.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

For `draft_predicate_card_with_transfiguration`: the apply body cannot use the just-added entry's id because `addCardById` does not return one. The pragmatic options are:
1. Extend `JourneyMutations.addCardById` to return the new entryId (preferred — small interface widening; useful for any future template that needs this).
2. Two-step: `addCardById` then a separate `transfigureMostRecentlyAddedCard(...)` mutation. (Avoid — adds a fragile coupling.)

Take option 1. Update `JourneyMutations.addCardById` return type to `string` (the new `entryId`); update the adapter and Wave-1 callers (most ignore the return value). Verify no Wave-1 tests break.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```
wave2: apply chosen-target draft and dreamsign reward templates.

addCardById now returns the new entryId so
draft_predicate_card_with_transfiguration can chain into
transfigureDeckEntry against the just-drafted card.
```

---

### Task 28: Wave 2 manual QA + close-out

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

```bash
npm run typecheck
npx vitest run
```

Expected: passes.

- [ ] **Step 2: Walk the spec's Wave-2 QA checklist via the dev server**

Open a Dream Journey site repeatedly until the listed templates surface (or use the existing test/debug seam to force the manifest if available):
- `apply_chosen_transfiguration_to_chosen_card`: transfiguration chooser opens, then card chooser, then transfiguration applies.
- `draft_predicate_cards_from_4`: 4 candidates render; picked one is added to the deck.
- Cancel a chooser mid-flow: no state changes; the journey screen remains; re-clicking Enter Dream re-mounts the overlay fresh.
- `purge_chosen_predicate_cards`: chooser enforces the count limit.

If any QA item fails, file a fix as a follow-up task; do not paper over it.

- [ ] **Step 3: Tag the Wave 2 boundary**

```bash
git tag wave2-complete
```

- [ ] **Step 4: Inform the user**

Report:
- Branch: `worktree-dream-journey-effects` on the worktree at `/Users/dthurn/quest_prototype/.claude/worktrees/dream-journey-effects`.
- Local tags: `wave1-complete`, `wave2-complete`.
- Commit count and a sketch of the final two-commit squash plan if/when the user wants to consolidate.
- Reminder: nothing has been pushed to master; the user decides next steps.

---

## Out of scope (do not implement; flagged here so an over-eager agent doesn't expand the plan)

Per the spec's "Open extension points (deferred)" and "Non-goals" sections:
- Reading `battleModifiers` from the battle resolver to actually reduce essence rewards mid-battle.
- Reading `dreamscapeModifiers` from atlas generation to suppress shop/dreamsign sites or weight site appearance.
- Card-rules-text rewrites (reclaim, type changes, fast keyword, cost reduction).
- Real dreamwell card content; the four dreamwell-keyed templates remain documented no-ops.
- Operation-based generic apply (the fallback path for shapes that emit richer `operations[]` beyond the shared-template envelope).
- Pushing the worktree branch to master.

If an implementer believes a piece of this list needs to land for Wave 1 or Wave 2 to function, surface the disagreement to the user *before* implementing — the spec's scope is the contract.

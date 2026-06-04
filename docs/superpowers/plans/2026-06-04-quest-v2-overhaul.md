# Quest Prototype V2 Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch all real quest play to V2 cards, V2 Dreamcallers, and idf3 draft-pool construction (sourced from `docs/drafts_anon/`), with dreamsigns drawn purely at random.

**Architecture:** The pool library currently under `src/draft_test/` is relocated to runtime homes and reused. `loadQuestContent` loads the V2 card and Dreamcaller data plus the `drafts_anon` decklist corpus, and exposes a `RunPoolContext` (poolData + name index + dreamsign ids). The existing `ResolvedDreamcallerPackage` object is **kept** (its tide fields preserved but always empty) and is now *produced from idf3 at quest start* instead of from tide overlap at content-load. Specialty shops draw from the run's chosen idf3 starter decklist; battle enemy decks draw an idf3-steered `drafts_anon` decklist; dreamsign draws drop all tide steering.

**Tech Stack:** TypeScript, React, Vite, Vitest, TOML data (`@iarna/toml` via `scripts/setup-assets.mjs`).

**Tide removal is staged.** The end state removes all tide-related code (Phase 9). Tides are threaded through ~15 files including RTDB persistence (`src/multiplayer/room-service.ts`), the journeys adapter, debug helpers, several screens/demos, the card data type, and battle code. Ripping that out *during* the V2/idf3 cutover would couple two large changes and make regressions hard to localize. So Phases 4–7 keep the tide fields present but **always empty** (every "no tide → random/whole-pool" fallback already does the right thing with empty arrays), the cutover lands and is verified, and then **Phase 9 deletes all tide code** as a final teardown. Each Phase 9 task is a self-contained vertical slice (one tide concept + all its consumers) that typechecks on its own, so the final teardown can be dispatched as a batch of subagents.

**App-buildable ordering:** Phases 1–3 are behavior-preserving (relocation, additive data, additive idf3 field). Phase 4 is the cutover (content-load + all build sites change together) — the app boots on V2 only after Phase 4 completes. Phases 5–7 refine shop / dreamsign / enemy behavior. Phase 8 verifies the full V2 experience *before* the tide teardown, so any regression is attributable to the cutover, not the teardown. Phase 9 removes all tide code. Do not reorder across the Phase 4 or Phase 8 boundaries.

---

## Phase 1 — Relocate the pool library out of `draft_test`

Pure mechanical move so runtime code never imports from a `_test` directory. No logic changes. The moved modules import each other with explicit `.ts` extensions today — **preserve those internal imports unchanged**; only update *external* importers.

### Task 1.1: Move the color-pool library

**Files:**
- Move: `src/draft_test/color-pool/` → `src/draft/pool/` (entire directory: `generate.ts`, `pool-data.ts`, `types.ts`, `rng.ts`, `util.ts`, `constants.ts`, `variant-*.ts`, and any others present)
- Move: `src/draft_test/color-pool.ts` → `src/draft/pool/index.ts` *(only if this file exists; check first with `ls src/draft_test/color-pool.ts`)*

- [ ] **Step 1: Move the directory with git**

Run: `git mv src/draft_test/color-pool src/draft/pool`

- [ ] **Step 2: Find every importer of the old path**

Run: `grep -rln "draft_test/color-pool" src/ scripts/`
Expected: a list including `src/draft_test/DraftTestApp.tsx`, the `src/draft_test/color-pool-*.test.ts` files, and `src/draft_test/cards-v2-database.ts`.

- [ ] **Step 3: Rewrite those imports to the new path**

In every file from Step 2, replace `draft_test/color-pool` with `draft/pool` in import specifiers. The relative depth differs per file — let the type checker (Step 4) confirm each resolves.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no unresolved-module errors).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: relocate color-pool library to src/draft/pool"
git push
```

### Task 1.2: Move the V2 data loaders

**Files:**
- Move: `src/draft_test/cards-v2-database.ts` → `src/data/cards-v2-database.ts`
- Move: `src/draft_test/dreamcallers-v2-database.ts` → `src/data/dreamcallers-v2-database.ts`
- Move: `src/draft_test/cards-v2-metadata.ts` → `src/data/cards-v2-metadata.ts`

- [ ] **Step 1: Move with git**

```bash
git mv src/draft_test/cards-v2-database.ts src/data/cards-v2-database.ts
git mv src/draft_test/dreamcallers-v2-database.ts src/data/dreamcallers-v2-database.ts
git mv src/draft_test/cards-v2-metadata.ts src/data/cards-v2-metadata.ts
```

- [ ] **Step 2: Find importers**

Run: `grep -rln "draft_test/cards-v2-database\|draft_test/dreamcallers-v2-database\|draft_test/cards-v2-metadata" src/ scripts/`
Expected: `src/draft_test/DraftTestApp.tsx`, `scripts/setup-assets.mjs`, and possibly `scripts/generate-color-pool.mjs` and test files.

- [ ] **Step 3: Rewrite imports**

Update each importer to the new `src/data/...` path. Note `scripts/setup-assets.mjs` imports `DREAMCALLER_ARCHETYPES` and `CARDS_V2_POOL_METADATA` — repoint those to `../src/data/...`.

- [ ] **Step 4: Verify the relocated modules' own imports still resolve**

`cards-v2-database.ts` imports from `./color-pool` for `GeneratedPool` — update that to `../draft/pool/...`. The type checker in Step 5 will catch any missed edge.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "refactor: relocate V2 data loaders to src/data"
git push
```

---

## Phase 2 — Starter cards & decklist corpus (additive data)

### Task 2.1: Port the 10 starter cards into `cards_v2.toml`

**Files:**
- Modify: `data/tabula/cards_v2.toml` (append 10 `[[cards]]` entries, card numbers 510–519)
- Modify: `src/data/starter-cards.ts`

**Decision (renames + revised text):** the 10 v1 starter cards are ported with new names that don't collide with existing V2 cards, text rewritten per `docs/cards2/style_guide.md`. Use exactly these entries (each is a `[[cards]]` block; set `mtg-name = ""`, `rarity = "Starter"`, `is-fast = false`, `is-interrupt = false`, `tags = []`, `image-number = ""`, `art-owned = false`, and a fresh lowercase-hex UUID `id`). Spark for events is `""`.

| card-number | name | card-type | subtype | energy-cost | spark | rendered-text |
|---|---|---|---|---|---|---|
| 510 | Twilight Minstrel | Character | Musician | 2 | 1 | `Support – Supported characters have +2✦.` |
| 511 | Circlewatch Seer | Character | Visionary | 3 | 1 | `▸Materialized: Foresee 1.` |
| 512 | Branded Direwolf | Character | Spirit Animal | 4 | 4 | *(empty string)* |
| 513 | Sigilsworn Champion | Character | Warrior | 5 | 3 | `▸Dawn: Gain 1⍟.` |
| 514 | Last Witness | Character | Visitor | 3 | 2 | `▸Dissolved: Draw a card.` |
| 515 | Meadowforged Colossus | Character | Synth | 6 | 6 | `This character has +2✦ for each supporting ally.` |
| 516 | Flashpoint Blast | Event | (empty) | 2 | "" | `Dissolve an enemy with cost 3● or less.` |
| 517 | Glimpse of the Past | Event | (empty) | 1 | "" | `Draw a card, then foresee 1.` |
| 518 | Herald's Sign | Event | (empty) | 2 | "" | `Discover a character.` |
| 519 | Distant Worlds | Event | (empty) | 1 | "" | `Give an ally +3✦.` |

- [ ] **Step 1: Append the 10 entries**

Append to `data/tabula/cards_v2.toml` *before* the trailing `[metadata]` section (entries must live in the `[[cards]]` array, which precedes metadata). Match the field layout of an existing `[[cards]]` block in that file. Generate a unique lowercase-hex UUID per card for `id`.

- [ ] **Step 2: Update the starter constant**

In `src/data/starter-cards.ts`, set `STARTER_CARD_NUMBERS` to `[510, 511, 512, 513, 514, 515, 516, 517, 518, 519]`.

- [ ] **Step 3: Write the data-integrity test**

**File:** `src/data/starter-cards.test.ts` (create)

Catches: a starter number with no matching TOML entry, a starter entry missing `rarity = "Starter"`, and drift between `STARTER_CARD_NUMBERS` and the actual Starter-rarity rows (e.g. a typo'd number or a forgotten entry). Parse `data/tabula/cards_v2.toml` with the same `@iarna/toml` `parse` used by `scripts/setup-assets.mjs` (read the file via `node:fs`), then assert: every number in `STARTER_CARD_NUMBERS` matches exactly one `[[cards]]` row; the set of `card-number`s whose `rarity === "Starter"` equals the set in `STARTER_CARD_NUMBERS`; and each such row has a non-empty `name` and a `card-type` of `Character` or `Event`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/data/starter-cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add data/tabula/cards_v2.toml src/data/starter-cards.ts src/data/starter-cards.test.ts
git commit -m "feat: port the 10 starter cards into cards_v2.toml"
git push
```

### Task 2.2: Bundle `drafts_anon` and confirm V2 transform

**Files:**
- Modify: `scripts/setup-assets.mjs`

- [ ] **Step 1: Switch the decklist source directory**

In `scripts/setup-assets.mjs`, change the decklist directory from `docs/drafts_dt` to `docs/drafts_anon`. There are two readers: the merged-archetype collapse (around line 42, `readdirSync(draftsDtDir)`) and the `draftsDtDir` constant (around line 401). Update both so `decklists-data.json` and `merged-archetype-lists-data.json` are built from `docs/drafts_anon/`. Rename the variable to `draftsAnonDir` for clarity.

- [ ] **Step 2: Confirm the V2 transform sets `isStarter`**

Read the V2 serialization block (around lines 441–466) and the shared `transformCard`. Verify a `rarity = "Starter"` card serializes to `isStarter: true` in `cards_v2-data.json` (the shared transform that produces `card-data.json` already does this; the V2 path reuses it). If the V2 path does **not** route through the same `rarity → isStarter` mapping, add it so the 10 starters carry `isStarter: true`.

- [ ] **Step 3: Run the asset build**

Run: `node scripts/setup-assets.mjs`
Expected: completes; logs `Wrote <N> cards to cards_v2-data.json` (now including the 10 starters) and bundles `decklists-data.json` from `docs/drafts_anon`.

- [ ] **Step 4: Verify outputs**

Run: `node -e "const d=require('./public/decklists-data.json'); console.log('decks',d.length); const c=require('./public/cards_v2-data.json'); console.log('starters',c.filter(x=>x.isStarter).map(x=>x.cardNumber).sort((a,b)=>a-b))"`
Expected: `decks 1174` and `starters [510,511,512,513,514,515,516,517,518,519]`.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-assets.mjs
git commit -m "feat: bundle drafts_anon corpus and serialize V2 starters"
git push
```

Note: `public/*.json` are build artifacts — only add them if the repo tracks them (`git status` will show). Match the repo's existing convention (check whether `public/cards_v2-data.json` is currently tracked).

---

## Phase 3 — Expose the chosen idf3 starter decklist

The specialty shop (Phase 6) and the enemy deck (Phase 7) both need the single `drafts_anon` deck that idf3 selected as its starter. Surface it through the generator's return values. This is additive (new optional field) — no existing caller breaks.

### Task 3.1: Add `starterDeck` to the generator result

**Files:**
- Modify: `src/draft/pool/types.ts` (`VariantResult`, `GeneratedPool`)
- Modify: `src/draft/pool/variant-idf3.ts`
- Modify: `src/draft/pool/generate.ts`
- Test: `src/draft/pool/variant-idf3.starter-deck.test.ts` (create) — or extend an existing idf3 test file if one is present after relocation.

- [ ] **Step 1: Write the failing test**

Catches: `starterDeck` left empty/undefined when a corpus is present, or wired to the wrong deck (not the one idf3 grew its pool from). Build a small `PoolData` via `buildPoolData(cards, decklists)` with a handful of distinct hand-authored decklists and signature cards that clearly point at one deck. Call `generateIdf3(rng, poolData, signatureCards, targetSize)` with a fixed-seed rng (`makeRng(<seed>)`). Assert the returned `starterDeck` is a non-empty array whose contents are exactly the membership of the decklist at the chosen start index — i.e. `new Set(result.starterDeck)` equals the set of the decklist that the result's `selected` entry (`deck#<startIdx>`) names. Also assert that with an empty `decklists` corpus the function still returns (falls back) and `starterDeck` is an empty array.

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/draft/pool/variant-idf3.starter-deck.test.ts`
Expected: FAIL (`starterDeck` undefined).

- [ ] **Step 3: Add the field to the types**

Add `starterDeck?: readonly string[];` to both `VariantResult` and `GeneratedPool` in `types.ts`.

- [ ] **Step 4: Populate it in idf3 and thread it through `generate.ts`**

In `variant-idf3.ts`, return `starterDeck: [...decks[startIdx].cards]` on the result (the anchor deck the pool is grown from). In `generate.ts`, destructure `starterDeck` from the `runVariant` result and include it on the returned `GeneratedPool` (default to `[]` when the variant omits it).

- [ ] **Step 5: Run the test, expect pass**

Run: `npx vitest run src/draft/pool/variant-idf3.starter-deck.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/draft/pool/types.ts src/draft/pool/variant-idf3.ts src/draft/pool/generate.ts src/draft/pool/variant-idf3.starter-deck.test.ts
git commit -m "feat: expose idf3 chosen starter decklist on the pool result"
git push
```

---

## Phase 4 — Content load + idf3 package build (the cutover)

After this phase the runtime quest boots on V2 cards, V2 Dreamcallers, and idf3 pools. Tasks 4.1–4.4 must all land before the app is runnable again; keep them in one working session.

### Task 4.1: Add the new type fields

**Files:**
- Modify: `src/types/content.ts`

- [ ] **Step 1: Extend the contracts**

In `DreamcallerContent`, add `signatureCards: string[];` (keep `mandatoryTides` / `optionalTides` — they stay, always empty). In `ResolvedDreamcallerPackage`, add `starterDecklistCardNumbers: number[];` (keep all existing fields).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: FAIL — every constructor of these objects (loaders, `resolveDreamcallerPackage`, demos, `test-support`, debug-helpers) now lacks the new required fields. This failure list is your task map for 4.2–4.4; do not fix unrelated sites yet.

- [ ] **Step 3: Commit the type change**

```bash
git add src/types/content.ts
git commit -m "feat: add signatureCards and starterDecklistCardNumbers to content types"
git push
```

### Task 4.2: `RunPoolContext` + `buildDreamcallerPackage`

**Files:**
- Modify: `src/data/quest-content.ts`
- Test: `src/data/build-dreamcaller-package.test.ts` (create)

This is the heart of the overhaul. `buildDreamcallerPackage` runs idf3 for one Dreamcaller and returns a `ResolvedDreamcallerPackage` (same shape, tide fields empty).

- [ ] **Step 1: Write the failing tests**

Build a `RunPoolContext` from a hand-authored set of V2-shaped cards (including two cards numbered 510/511 flagged `isStarter`) and a small `drafts_anon`-style decklist corpus, plus a `nameIndex` mapping those card names to numbers. Cover these bug classes:
  - **Starters never enter the draft pool** — `draftPoolCopiesByCard` contains no starter card number, even if a starter's *name* appears in a decklist.
  - **Copies capped at 2** — no value in `draftPoolCopiesByCard` exceeds 2.
  - **Determinism** — two calls with the same `(dreamcaller, ctx, seed)` produce identical `draftPoolCopiesByCard` and `starterDecklistCardNumbers`.
  - **Signatureless Dreamcaller still yields a pool** — a Dreamcaller with `signatureCards: []` returns a non-empty `draftPoolCopiesByCard` (idf3's diversity fallback).
  - **Starter decklist is resolvable and non-empty** — `starterDecklistCardNumbers` is non-empty, contains only numbers present in `cardDatabase`, and excludes starter numbers.
  - **Tide fields empty** — `mandatoryTides`, `optionalTides` (via `optionalSubset`), and `selectedTides` are all `[]`.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/data/build-dreamcaller-package.test.ts`
Expected: FAIL (`buildDreamcallerPackage` not exported).

- [ ] **Step 3: Implement `RunPoolContext`, the seed hash, and `buildDreamcallerPackage`**

In `quest-content.ts`, add the interface and a deterministic string→seed hash (a contract — the same string must always map to the same numeric seed so runs reproduce):

```ts
export interface RunPoolContext {
  poolData: PoolData;
  nameIndex: Map<string, number>;
  allDreamsignPoolIds: string[];
}

const POOL_TARGET_SIZE = 200;

function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
```

Then implement `buildDreamcallerPackage(dreamcaller, ctx, questSeed: string): ResolvedDreamcallerPackage`:
  1. `const pool = generatePoolFromData(ctx.poolData, hashStringToSeed(questSeed + dreamcaller.id), undefined, "idf3", undefined, POOL_TARGET_SIZE, dreamcaller.signatureCards);`
  2. Resolve `pool.counts` to card numbers with `resolvePool` (relocated to `src/data/cards-v2-database.ts`), then delete any starter card number from the result (use `STARTER_CARD_NUMBERS`). This is `draftPoolCopiesByCard`.
  3. Resolve `pool.starterDeck ?? []` names to numbers via `ctx.nameIndex`, dropping unresolved names and starter numbers → `starterDecklistCardNumbers`.
  4. `dreamsignPoolIds = [...ctx.allDreamsignPoolIds]`.
  5. Tide fields `[]`. Numeric fields: `draftPoolSize` = sum of copies; `doubledCardCount` = count of entries equal to 2; `mandatoryOnlyPoolSize` = `draftPoolSize`; `legalSubsetCount` = `preferredSubsetCount` = 1 (these feed only debug/logging now).

Determinism note: `generatePoolFromData` derives its own RNG from the numeric seed, so passing the hashed `questSeed + id` is what makes the pool reproducible per run.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/data/build-dreamcaller-package.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/quest-content.ts src/data/build-dreamcaller-package.test.ts
git commit -m "feat: build Dreamcaller draft packages from idf3"
git push
```

### Task 4.3: Rewrite `loadQuestContent` for V2

**Files:**
- Modify: `src/data/quest-content.ts`
- Modify: `src/data/quest-content.test.ts` (adapt existing tests)

- [ ] **Step 1: Replace the loaders and the returned shape**

In `loadQuestContent`:
  - Load cards via `loadCardsV2Database()` (`/cards_v2-data.json`).
  - Load Dreamcallers from `/dreamcallers-v2-data.json` via `loadDreamcallersV2()` (relocated), mapped to `DreamcallerContent`: copy `id/name/title/renderedText/imageNumber`, `startingEssence: dc.startingEssence || DEFAULT_STARTING_ESSENCE`, `signatureCards: dc.signatureCards ?? []`, `mandatoryTides: []`, `optionalTides: []`. Offer **all** of them (no validation/skip loop).
  - Load decklists via `loadDecklists()` (relocated).
  - Build `poolContext: RunPoolContext` = `{ poolData: buildPoolData(Array.from(cardDatabase.values()), decklists), nameIndex: buildNameIndex(cardDatabase), allDreamsignPoolIds: dreamsignTemplates.map((t) => t.id) }`.
  - Keep `cardsByPackageTide` (still built from draftable V2 cards' tides; harmless).

Change `QuestContent`: remove `resolvedPackagesByDreamcallerId`; add `poolContext: RunPoolContext`. Delete the now-dead functions `resolveDreamcallerPackage`, `buildDraftPoolCopies`, `countDraftPoolSize`, `countDoubledCards`, `enumeratePackageCandidates`, `buildCombinations`, `chooseBestCandidate`, `compareSubsetKeys`, and the pool-size constants — unless a remaining caller needs them (the type checker decides). Keep the package-adjacency helpers (`countPackageOverlap` etc.) only if still imported elsewhere; otherwise remove.

- [ ] **Step 2: Adapt the existing quest-content test**

`src/data/quest-content.test.ts` currently asserts tide-package resolution. Replace those cases with: `loadQuestContent` (mock `fetch` for the three JSON endpoints + decklists) returns a `poolContext` whose `nameIndex` covers the loaded cards and whose `poolData.decklists` is non-empty, and `dreamcallers` carries `signatureCards`. Bug caught: a loader wired to the wrong endpoint or a Dreamcaller mapping that drops `signatureCards`.

- [ ] **Step 3: Run + typecheck**

Run: `npx vitest run src/data/quest-content.test.ts && npm run typecheck`
Expected: the test passes; typecheck now fails only at the *consumer* sites fixed in 4.4.

- [ ] **Step 4: Commit**

```bash
git add src/data/quest-content.ts src/data/quest-content.test.ts
git commit -m "feat: load V2 cards, Dreamcallers, and decklists in quest content"
git push
```

### Task 4.4: Repoint the package build sites

Every site that did `questContent.resolvedPackagesByDreamcallerId.get(id)` now calls `buildDreamcallerPackage(dreamcaller, questContent.poolContext, seed)`. The seed must be computed **before** the package so idf3 uses it.

**Files:**
- Modify: `src/state/quest-state-actions.ts` (~315–378)
- Modify: `src/runtime/start-in-battle-state.ts`
- Modify: `src/state/quest-context.tsx` (~721–790 logging)
- Modify: `src/state/multiplayer-quest-context.tsx` (the `setDreamcallerSelection` origin)
- Modify: `src/components/HudDreamsignLayoutDemo.tsx` (mock content object)

- [ ] **Step 1: Single-player quest start**

In `startQuestFromDreamcaller` (`quest-state-actions.ts`): compute `const seed = seedOverride ?? generateQuestSeed();` first, then `const resolvedPackage = buildDreamcallerPackage(dreamcaller, questContent.poolContext, seed);`. Use that `seed` in the returned state (replace the inline `seedOverride ?? generateQuestSeed()` at the `seed:` field). The rest (starter deck append, `createInitialDraftState`, `remainingDreamsignPool`) is unchanged — it already reads from `resolvedPackage`.

- [ ] **Step 2: Debug start-in-battle**

In `createStartInBattleState`: pick the first Dreamcaller (`questContent.dreamcallers[0]`; drop the `resolvedPackagesByDreamcallerId.has` filter), compute `const seed = generateQuestSeed();`, build the package with it, and use `seed` for the state's `seed` field.

- [ ] **Step 3: Quest-context logging**

In `quest-context.tsx` `startQuest` (~721): the `resolvedPackagesByDreamcallerId.get` lookup at line 724 fed only logging. Remove it; log from `next.resolvedPackage` (the state returned by `startQuestFromDreamcaller`) instead, and drop the removed tide fields from the `quest_started` log payload (`mandatoryTides`, `optionalSubset`, `selectedTides`, `selectedPackageTides`). Keep `draftPoolSize` and `dreamsignPoolSize`. The `initializeDraftState(cardDatabase, resolvedPackage)` call at line 760 should read `next.resolvedPackage`.

- [ ] **Step 4: Multiplayer quest start**

In `multiplayer-quest-context.tsx`, find where the `resolvedPackage` passed to `setDreamcallerSelection` / `applyDreamcallerSelection` originates (it currently comes from the content map). Replace with `buildDreamcallerPackage(dreamcaller, current.questContent.poolContext, seed)`, where `seed` is the per-room quest seed already generated for the transaction (the same value passed as `seedOverride` to `startQuestFromDreamcaller`). Reuse one seed for both so the pool and the quest seed agree.

- [ ] **Step 5: Demo mock**

In `HudDreamsignLayoutDemo.tsx`, remove the `resolvedPackagesByDreamcallerId: new Map()` field from the mock `QuestContent` and add `poolContext` with empty stubs (`{ poolData: buildPoolData([], []), nameIndex: new Map(), allDreamsignPoolIds: [] }`) — or whatever minimal shape satisfies the type; this demo never builds a real pool.

- [ ] **Step 6: Typecheck + full test run**

Run: `npm run typecheck && npm test`
Expected: typecheck PASS. Some battle/shop/dreamsign tests may still fail — those are addressed in Phases 5–7. Note which fail; they should be only in `shop`, `reward`, `battle`, and dreamsign suites.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: build draft packages from idf3 at quest start"
git push
```

---

## Phase 5 — Specialty shops draw from the idf3 starter decklist

### Task 5.1: Rewrite specialty-shop card sourcing

**Files:**
- Modify: `src/shop/shop-generator.ts`
- Modify: `src/shop/shop-generator.test.ts` (adapt)

- [ ] **Step 1: Write/adapt the failing tests**

Catches: specialty card slots drawn from the wrong source (the depleting draft multiset instead of the fixed starter decklist), the draft pool being mutated by a specialty shop, and the specialty price not applied. With `starterDecklistCardNumbers` non-empty: every card slot's `card.cardNumber` is a member of `starterDecklistCardNumbers`; the passed `draftState.remainingCopiesByCard` is unchanged after generation (deep-equal to input); each card slot's `basePrice === SPECIALTY_CARD_PRICE`. With `starterDecklistCardNumbers` absent/empty (regular shop): card slots are drawn from and spent against `draftState` (existing behavior — keep a regression case asserting the multiset shrinks).

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/shop/shop-generator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `ShopGenerationOptions`, replace `specialtyTides?: readonly PackageTideId[]` with `starterDecklistCardNumbers?: readonly number[]`. A shop is specialty when that array is non-empty. For a specialty shop, draw `cardCount` unique card numbers at random from `starterDecklistCardNumbers` (Fisher-Yates / sample with `Math.random`, matching this module's existing RNG style), resolve each via `cardDatabase`, price at `SPECIALTY_CARD_PRICE`, and leave `draftState` untouched. For a regular shop, keep the existing `drawAndSpendUniqueCards(draftState, cardCount)` path. Dreamsign slots draw randomly in both cases (Phase 6 removes the tide filter; if doing Phase 6 first, that path is already random). Remove `pickSpecialtyTide`, `eligibleCardNumbersForTide`, and the `restrictedTide` filtering of dreamsigns. Keep `ShopInventoryResult.restrictedTide` in the type but set it to `null` always (avoids touching screen consumers).

- [ ] **Step 4: Update callers**

In `quest-context.tsx` (the two `generateShopInventory` calls at ~1205 and ~1433) and `multiplayer-quest-context.tsx` (~1898 and ~2188): replace the `specialtyTides: specialtyOnly ? (…mandatoryTides) : …` argument with `starterDecklistCardNumbers: specialtyOnly ? (state.resolvedPackage?.starterDecklistCardNumbers ?? []) : undefined`. Preserve each call's existing `specialtyOnly` predicate.

- [ ] **Step 5: Run + typecheck**

Run: `npx vitest run src/shop/shop-generator.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: specialty shops draw from the run's idf3 starter decklist"
git push
```

---

## Phase 6 — Dreamsigns drawn purely at random

### Task 6.1: Remove tide steering from every dreamsign draw

**Files:**
- Modify: `src/rewards/reward-generator.ts`
- Modify: `src/state/quest-context.tsx` (reward call ~830, dreamsign offer ~966–972)
- Modify: `src/state/multiplayer-quest-context.tsx` (reward call ~1336–1345, dreamsign offer ~1529–1537)
- Modify: `src/rewards/reward-generator.test.ts` (adapt)

- [ ] **Step 1: Adapt the reward test**

Catches: the reward site falling through to the `essence` fallback because tide-biased selection returned nothing, and any crash when no tides are supplied. Assert `generateRewardSiteData` (called without any tide argument) returns a `rewardType: "dreamsign"` reward drawn from the supplied pool for an arbitrary template set, and that an exhausted remaining pool regenerates from `regenerationPoolIds`.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/rewards/reward-generator.test.ts`
Expected: FAIL (signature still requires `selectedPackageTides`).

- [ ] **Step 3: Implement**

In `reward-generator.ts`: drop `selectedPackageTides` from `RewardGenerationOptions` and replace `pickPackageAdjacentItem(...)` with a plain random pick from `resolveDreamsignTemplates(availableIds, dreamsignTemplates)` (e.g. uniform `Math.random` index). Remove the now-unused `pickPackageAdjacentItem` / `PackageTideId` imports. In `quest-context.tsx` and `multiplayer-quest-context.tsx`: drop `selectedPackageTides` from the `generateRewardSiteData` calls, and drop the `requiredTides` argument from the `drawDreamsignOptions` calls in the dreamsign-offer mutations (the function already shuffles when `requiredTides` is absent).

- [ ] **Step 4: Run + typecheck**

Run: `npx vitest run src/rewards/reward-generator.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: draw dreamsigns purely at random (offer, reward, shop)"
git push
```

---

## Phase 7 — Enemy decks from an idf3-steered `drafts_anon` decklist

### Task 7.1: Rewrite `createEnemyDeckDefinition`

**Files:**
- Modify: `src/battle/integration/create-battle-init.ts`
- Modify: `src/state/use-ensure-battle-session.ts` (caller, ~65)
- Modify: `src/battle/test-support.ts` and `src/battle/integration/create-battle-init.test.ts` (adapt)

- [ ] **Step 1: Adapt/extend the battle-init test**

Catches: an empty enemy deck (the removed removal-event guarantee used to throw, now nothing enforces non-emptiness), enemy decks containing card numbers absent from the database, and the enemy deck *not* being steered (ignoring the enemy Dreamcaller's signature). Provide a `poolContext` (decklist corpus + name index over the test card DB) and an enemy Dreamcaller with `signatureCards`. Assert the produced enemy deck is non-empty, every entry's card number resolves in `cardDatabase`, and its size is at least `MIN_BATTLE_DECK_SIZE`. For steering: with a signature pointing at a specific decklist, the resolved enemy deck's card set matches that decklist (modulo unresolved names and padding) across a couple of fixed seeds.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/battle/integration/create-battle-init.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the new enemy deck builder**

Add `poolContext: RunPoolContext` to `CreateBattleInitInput`. In `createBattleInit`, select the enemy Dreamcaller once (reuse the random pick currently inside `createEnemyDescriptor`, or pick in `createBattleInit` and pass it in) so its `signatureCards` are available. Rewrite `createEnemyDeckDefinition` to:
  1. `const pool = generatePoolFromData(poolContext.poolData, <numeric battle seed>, undefined, "idf3", undefined, undefined, enemySignatureCards);`
  2. Resolve `pool.starterDeck ?? []` names to card numbers via `poolContext.nameIndex`, dropping unresolved names.
  3. If shorter than `MIN_BATTLE_DECK_SIZE`, pad by repeating the resolved list (same approach as `padBattleDeck`).
  4. Map to `BattleDeckCardDefinition` via the existing `createBaseBattleDeckCardDefinition` / freeze path, shuffled by `streams.enemyDeckOrder`.

Derive the numeric idf3 seed from the battle `seed` (e.g. `seed ^ 0x9e3779b9` or `hashStringToSeed(String(seed) + "enemy")` — keep it deterministic). Delete `ENEMY_DECK_SIZE`, `ENEMY_REMOVAL_EVENT_COUNT`, `REMOVAL_TIDES`, `isRemovalEvent`, `filterByPackage`, and the removal-event/`requiredPool` logic. Set the enemy descriptor's `packageTides` to an empty frozen array.

- [ ] **Step 4: Thread `poolContext` from the caller**

In `use-ensure-battle-session.ts`, pass `poolContext: questContent.poolContext` into the `createBattleInit(...)` input. Update `test-support.ts` to supply a minimal `poolContext` (and drop any `resolvedPackage`-tide assumptions the helper baked in).

- [ ] **Step 5: Run + typecheck**

Run: `npx vitest run src/battle/integration/create-battle-init.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: build enemy decks from an idf3-steered drafts_anon decklist"
git push
```

---

## Phase 8 — Full verification

### Task 8.1: Core checks

- [ ] **Step 1: Lint, typecheck, test**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all PASS. If any residual test still asserts tide-based pool/shop/dreamsign behavior, update it to the new behavior (the bug each originally guarded is now obsolete) and re-run.

- [ ] **Step 2: Rebuild assets**

Run: `node scripts/setup-assets.mjs`
Expected: completes; V2 card/Dreamcaller JSON and the `drafts_anon` decklist bundle are current.

- [ ] **Step 3: Commit any test fixups**

```bash
git add -A
git commit -m "test: update suites for V2 + idf3 quest behavior"
git push
```

### Task 8.2: Browser QA

Per `AGENTS.md`. Use `/opt/homebrew/bin/agent-browser` (fallback `npx agent-browser`) against a scoped QA Vite server on a non-5173 port.

- [ ] **Step 1: Start a scoped QA server**

Run: `npm run dev -- --port 5174` (capture the PID). Do **not** use 5173.

- [ ] **Step 2: Walk the player workflow**

Verify: the Dreamcaller select offers V2 Dreamcallers; starting a quest shows a draft pool of V2 cards (check the draft site renders 4-card offers); a regular shop shows V2 cards; a **specialty** shop shows V2 cards (priced higher); a Dreamsign reward/offer yields dreamsigns; entering a Battle renders an enemy whose deck is V2 cards (no crash, no empty enemy deck). Inspect the captured error buffer for render errors, unhandled rejections, and console errors. Confirm controls are usable, text/controls fully visible, layout free of clipping/overlap.

- [ ] **Step 3: Tear down only the QA server**

Run: `kill <captured PID>` (or `pkill -f "vite --port 5174"`). Never a bare `pkill -f vite`.

- [ ] **Step 4: Final commit (if QA prompted fixes)**

```bash
git add -A
git commit -m "fix: address V2 quest browser-QA findings"
git push
```

---

## Phase 9 — Tide teardown (final cleanup)

Remove all tide-related code now that nothing drives it. Run only after Phase 8 confirms the V2 experience works. Each task is a vertical slice — one tide concept plus every consumer — and must end green (`npm run typecheck && npm test`). Because the slices share the `PackageTideId` type and ripple through types, **commit each task before starting the next** even if dispatched as a batch; an agent owning a slice removes the field *and* fixes every reader in the same commit so the tree never stays red.

Scope: the quest runtime, shared types, battle, dreamsigns, journeys, debug, and screens. The card-authoring tide tooling (the card editor's "Manage tides" panel, `data/tabula/cards_v2.tides.toml`, `scripts/apply-archetype-tides.mjs`, `scripts/card-editor-tides.*`) is authoring metadata for a separate tool — Task 9.7 covers it last and may be left out if it balloons; note that choice in the commit if so.

Before starting, build the consumer map: `grep -rn "tide\|Tide\|PackageTideId" src/ | grep -v draft_test` and keep it open; each task clears one cluster.

### Task 9.1: Remove tide fields from the package/content types and helpers

**Files:** `src/types/content.ts`, `src/data/quest-content.ts`, plus every reader the type checker flags.

- [ ] Remove `mandatoryTides`/`optionalTides` from `DreamcallerContent`; remove `mandatoryTides`/`optionalSubset`/`selectedTides` from `ResolvedDreamcallerPackage`. Remove `cardsByPackageTide` from `QuestContent` and `buildCardsByPackageTideIndex`. Remove the package-adjacency helpers (`countPackageOverlap`, `isPackageAdjacent`, `packageOverlapWeight`, `selectPackageAdjacentOrFallback`, `packageAdjacentCandidatesOrFallback`, `selectPackageAdjacentWithOverlap`) if no longer imported. Update `buildDreamcallerPackage` to stop emitting the removed fields, and `start-in-battle-state` / `quest-state-actions` / the demos / `debug-helpers` / `room-service` accordingly.
- [ ] `npm run typecheck && npm test`; then `git add -A && git commit -m "refactor: remove tide fields from quest content and package types" && git push`.

### Task 9.2: Remove `tides` from the card model

**Files:** `src/types/cards.ts`, `scripts/setup-assets.mjs` (the V2 `meta.tides` merge), `src/data/cards-v2-metadata.ts`, and every `card.tides` reader — `src/draft/draft-engine.ts` (`countByTide` + the `cardTides` log field), `src/battle/integration/create-battle-init.ts` (`cloneBattleDeckCardDefinition` tides), `src/battle/types.ts` (`BattleDeckCardDefinition.tides`), `src/debug/card-source-debug.ts`, `src/journeys/adapter/buildContext.ts` (the `selectedTides` projection).

- [ ] Delete `CardData.tides` and the metadata/`setup-assets` code that populates it; remove every reader (delete `countByTide` and its log field; drop `tides` from battle deck-card definitions; remove the journeys tide projection). Rebuild assets (`node scripts/setup-assets.mjs`) to confirm the V2 JSON no longer carries `tides`.
- [ ] `npm run typecheck && npm test`; commit + push.

### Task 9.3: Remove `packageTides` from dreamsigns and battle enemy descriptors

**Files:** `src/types/content.ts` (`DreamsignTemplate.packageTides`), `scripts/setup-assets.mjs` (dreamsign transform `packageTides`), `src/battle/types.ts` (`BattleEnemyDescriptor.packageTides`), `src/battle/integration/create-battle-init.ts` (`createEnemyDescriptor` — already empty), `src/screens/DreamsignSourceOverlay.tsx`, `src/rewards/reward-generator.ts` (any residual import).

- [ ] Delete `DreamsignTemplate.packageTides` and `BattleEnemyDescriptor.packageTides` and their producers/readers. Rebuild assets to confirm `dreamsign-data.json` drops `packageTides`.
- [ ] `npm run typecheck && npm test`; commit + push.

### Task 9.4: Remove tide-only modules

**Files:** `src/data/tide-weights.ts` (+ test), `src/data/structural-tides.ts`, `src/data/tide-docs.ts` (+ test), and any glossary/tide helpers, plus their imports.

- [ ] Delete the tide-only modules whose only purpose was tide weighting/documentation, after confirming via grep that their exports have no remaining non-tide consumers. If a module mixes tide and non-tide exports, remove only the tide exports. Remove dead imports.
- [ ] `npm run typecheck && npm test`; commit + push.

### Task 9.5: Remove tide props from screens and demos

**Files:** `src/screens/DreamsignDraftScreen.tsx`, `src/screens/DreamsignOfferingScreen.tsx`, `src/screens/DebugScreen.tsx`, `src/screens/debug-helpers.ts`, `src/components/TideDocumentationHoverDemo.tsx`, `src/components/HudDreamsignLayoutDemo.tsx`.

- [ ] Remove the `mandatoryTides`/`optionalTides`/`selectedTides`/tide-doc props threaded through these components and their child components' prop types. If `TideDocumentationHoverDemo` is purely a tide-documentation demo, delete it and its route/registration.
- [ ] `npm run typecheck && npm test`; commit + push.

### Task 9.6: Remove the `PackageTideId` type and final references

**Files:** `src/types/content.ts` and any straggler imports surfaced by grep.

- [ ] With all consumers gone, delete `export type PackageTideId`. Run the grep from the phase intro again; it should return only `draft_test`-relocated comments (already moved) and authoring tooling (Task 9.7).
- [ ] `npm run typecheck && npm test && npm run lint`; commit + push.

### Task 9.7 (optional): Remove card-authoring tide tooling

**Files:** `data/tabula/cards_v2.tides.toml`, `scripts/apply-archetype-tides.mjs`, `scripts/card-editor-tides.*`, the card editor's "Manage tides" panel under `src/editor/`.

- [ ] Remove the tide-authoring registry, scripts, and editor panel. This touches a separate tool; if it expands beyond a clean deletion, stop and leave it, noting the decision in the commit message. Run `npm run lint && npm run typecheck && npm test`; commit + push.

---

## Self-review notes

- **Spec coverage:** starter cards (2.1), drafts_anon corpus (2.2), library relocation (1.1–1.2), idf3 at quest start (4.2–4.4), all-32 Dreamcallers (4.3), specialty shop from chosen decklist (5.1), random dreamsigns incl. reward site (6.1), idf3-steered enemy decks (7.1), verification incl. browser QA (8), full tide removal (9). Covered.
- **Staging:** tide fields are kept-but-empty through Phases 4–7 and verified in Phase 8, then fully removed in Phase 9 — so a Phase 8 regression is attributable to the cutover and a Phase 9 regression to the teardown.
- **Risks:** `drafts_anon` card-name resolution against the V2 name index — `resolvePool` drops unresolved names, but a high drop rate would thin pools; watch pool sizes during QA. Numeric pool sizing (`POOL_TARGET_SIZE = 200`) approximates the old 190–210 band; adjust if QA pools feel off.

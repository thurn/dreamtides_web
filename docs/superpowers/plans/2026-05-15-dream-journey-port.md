# Dream Journey Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the quest prototype's existing Dream Journey screen with a port of the `~/journeys` CLI's plugin-based generator, rendering manifests as 1–3 circular images in a horizontal row with hover-cards and an Enter Dream button per option.

**Architecture:** All new code lives in `src/journeys/`. Only `src/journeys/adapter/` is allowed to import from the rest of the quest prototype. The CLI's plugin shapes, predicates, costs/rewards, value model, validators, and manifest contract port verbatim; Node-specific seams (RNG, fs loaders, terminal renderers) are replaced. The viability layer is *extended* past the CLI's bare-bones gating to honor live deck/pool/resource state. Decision-tree shapes advance step-by-step inside the journey screen via a single `advanceTree` helper that consumes the manifest's precommitted random outcomes.

**Tech Stack:** TypeScript, React 19, Vite, framer-motion (already used by the existing screen), vitest, smol-toml (already a dev dep), js-sha256 (new dep, ~3 KB, zero transitive deps, replaces Node `crypto.createHash`).

**Spec:** `docs/superpowers/specs/2026-05-15-dream-journey-port-design.md`. Read this first; the plan references its sections rather than restating them.

---

## File Structure

The directory layout is fixed by the spec's Architecture section. The plan adds these files (one task per logical group). Where a file ports verbatim from the CLI, the source path under `/Users/dthurn/journeys/src/journey/` is named; the implementer copies, then makes the minimal browser adjustments described.

- `src/journeys/index.ts` — public surface (re-exports `JourneyScreen` and `journeySeedForSite`).
- `src/journeys/adapter/seed.ts`, `content-bridge.ts`, `buildContext.ts` — quest state → journey context translation.
- `src/journeys/content/types.ts`, `keywords.ts` — internal Card/Dreamsign/Dreamcaller types.
- `src/journeys/util/rng.ts`, `stableJson.ts`, `tree.ts` — labeled-hash RNG, stable JSON, decision-tree traversal.
- `src/journeys/journey/manifest.ts`, `symbols.ts`, `rewardArtTypes.ts`, `effects.ts`, `value.ts`, `operationBuilders.ts`, `assembly.ts`, `generate.ts` — the pipeline.
- `src/journeys/journey/shared/types.ts`, `cec.ts`, `text.ts`, `content.ts`, `predicates.ts`, `viability.ts`, `costs.ts`, `rewards.ts`, `dreamwell.ts` — cross-shape helpers. `viability.ts` and `dreamwell.ts` are new in the port.
- `src/journeys/journey/shapes/registry.ts`, `scoreWeights.ts`, `shared.ts`, `types.ts` — shape registry and helpers.
- `src/journeys/journey/shapes/<id>/...` — one directory per plugin, 21 in total.
- `src/journeys/journey/validate/` — validators (root option count, shape topology, decision tree, references, etc.).
- `src/journeys/ui/JourneyScreen.tsx`, `JourneyOptionCircle.tsx`, `JourneyHoverCard.tsx`, `CloseButton.tsx`, `dreamArt.ts` — UI.
- `src/journeys/data/reward-art-matches.toml` — the ledger.
- `public/journeys/<imageId>.<ext>` — image assets, populated by `scripts/setup-assets.mjs` at build time.

Files removed: `src/data/dream-journeys.ts`, `src/screens/DreamJourneyScreen.tsx`, `src/screens/DreamJourneyScreen.test.tsx`. Files modified: `src/types/quest.ts`, `src/state/quest-context.tsx`, `src/state/multiplayer-quest-context.tsx`, the screen router that dispatches site rendering, `scripts/setup-assets.mjs`, `package.json`.

---

## Phase A: Foundation

### Task 1: Scaffold the module and add the SHA-256 dependency

**Files:**
- Create: `src/journeys/index.ts`, `src/journeys/ui/JourneyScreen.tsx` (stub), `src/journeys/adapter/seed.ts` (stub).
- Modify: `package.json` — add `js-sha256` as a regular dependency.
- Create: `src/journeys/README.md` summarizing the isolation contract from the spec's Architecture section, so future readers don't reintroduce coupling.

- [ ] **Step 1: Create the directory skeleton** matching the spec's Architecture section. Empty directories are fine for sub-trees that later tasks fill; the goal is to lock in the structure.
- [ ] **Step 2: Add `js-sha256` to `dependencies`** in `package.json`; run `npm install`; verify lock file updates cleanly.
- [ ] **Step 3: Implement the public surface stubs** — `JourneyScreen` renders a single hard-coded "journey placeholder" paragraph; `journeySeedForSite` returns a constant string. These exist so later tasks can wire the screen router without circular work.
- [ ] **Step 4: Write a lint/structure test** at `src/journeys/index.test.ts` that imports from `./index` and asserts both exports are defined. The bug it catches: future deletion of public-surface exports without noticing the breakage.
- [ ] **Step 5: Run `npm test`, `npm run typecheck`, `npm run lint`**; verify clean.
- [ ] **Step 6: Commit.** "Scaffold the journeys/ module skeleton and add js-sha256."

### Task 2: Port the labeled-hash RNG and stable JSON

**Files:**
- Create: `src/journeys/util/rng.ts` (port of `/Users/dthurn/journeys/src/util/rng.ts`).
- Create: `src/journeys/util/stableJson.ts` (port of `/Users/dthurn/journeys/src/util/stableJson.ts` — already pure).
- Create: `src/journeys/util/rng.test.ts`, `src/journeys/util/stableJson.test.ts`.

The only substantive change vs. the CLI is replacing `crypto.createHash("sha256")` with `js-sha256`'s synchronous SHA-256. The DrawContext shape, public helpers (`drawUnit`, `drawInt`, `weightedChoice`, `shuffleDeterministic`, `deterministicTieJitter`), and the hash-input string layout (null-byte-joined `seed:`, `content:`, `root:`, `step:`, `attempt:`, `label:`) port unchanged.

- [ ] **Step 1: Write the cross-port byte-stability test.** Pick three `(seed, contentVersion, rootJourneyIndex, label)` tuples from the CLI's own test fixtures and assert the ported `drawUnit` returns the same float to 13-hex-digit precision. **Bug class caught:** any SHA-256 implementation mismatch between Node `crypto` and `js-sha256`. This is the single test that justifies the dependency choice.
- [ ] **Step 2: Run; expect FAIL** (no implementation yet).
- [ ] **Step 3: Port `rng.ts`.** Translate the hash construction to use `sha256` from `js-sha256`. Match the CLI's hash-input format exactly.
- [ ] **Step 4: Run the cross-port test; expect PASS.**
- [ ] **Step 5: Port `stableJson.ts` verbatim** and add a small test asserting (a) key ordering, (b) `undefined` rejection, (c) non-finite numbers normalized to `null`. **Bug class:** silent JSON-shape drift across runs.
- [ ] **Step 6: Commit.** "Port labeled-hash RNG and stable JSON serializer."

### Task 3: Port shared types, text, cec, content helpers, predicates, and stub dreamwell

**Files:**
- Create: `src/journeys/journey/shared/types.ts` (Predicate, Cost, Reward, TemplateParams).
- Create: `src/journeys/journey/shared/text.ts` (joinSnippets, withLockedPrefix, quoteName — verbatim).
- Create: `src/journeys/journey/shared/cec.ts` (CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC).
- Create: `src/journeys/journey/shared/content.ts` (predicate helpers: cardMatches, dreamsignMatches, baneCount, essenceAmount, maxEssence, pickFromList, transfigurationsEligibleForPredicate, isCardEligibleForTransfiguration, etc.).
- Create: `src/journeys/journey/shared/predicates.ts` (the ~18 reusable predicates with their `text.plural` strings).
- Create: `src/journeys/journey/shared/dreamwell.ts` — exports `POSITIVE_DREAMWELL_CARDS = []` and `NEGATIVE_DREAMWELL_CARDS = []`. The spec's Dreamwell-placeholder section is the authority.
- Create: `src/journeys/content/types.ts`, `keywords.ts` (port of `/Users/dthurn/journeys/src/journey/content/keywords.ts`).
- Tests: `src/journeys/journey/shared/predicates.test.ts`.

- [ ] **Step 1: Port the content/shared scaffolding.** These files are pure; they port cleanly. Strip any Node-specific imports (none expected, but verify).
- [ ] **Step 2: Write one property test for predicates.** For a hand-built fixture context with 8 cards spanning the predicate axes (events/characters, low-cost, warriors, survivors, legendary), assert that every predicate returns at least one match for the predicates the fixture covers and zero matches when the fixture lacks the relevant card. **Bug class:** silent regression in predicate filter logic during the port. One test, not one-per-predicate.
- [ ] **Step 3: Write one structural test for the predicate table.** Each entry has a `text.plural` non-empty string; ids are unique. **Bug class:** typo'd or missing predicate metadata. (Do *not* assert specific predicate ids or plural strings — that's table-mirror duplication.)
- [ ] **Step 4: Run tests; expect PASS.**
- [ ] **Step 5: Commit.** "Port shared types, text helpers, predicates, content helpers, and stub dreamwell."

### Task 4: Port the manifest contract with the `locked` extension

**Files:**
- Create: `src/journeys/journey/manifest.ts` (port of `/Users/dthurn/journeys/src/journey/manifest.ts`).
- Create: `src/journeys/journey/symbols.ts` (port).
- Create: `src/journeys/journey/rewardArtTypes.ts` (port).
- Extend: `src/journeys/journey/effects.ts` (added in Task 3 with predicate-resolution scaffolding — Task 4 layers the effect catalog and operation kind definitions on top).
- Test: `src/journeys/journey/manifest.test.ts`.

The only contract change is two added fields:

```ts
// On JourneyOption:
readonly locked: boolean;

// On JourneyTreeBranch:
readonly locked: boolean;
```

Both default to `false` where the CLI constructs an option/branch; cost-rendering paths in later tasks set them to `true` when any cost on that option/branch is unaffordable. The `[LOCKED]` text prefix is unchanged.

- [ ] **Step 1: Port manifest.ts, symbols.ts, rewardArtTypes.ts** verbatim, and **extend the existing effects.ts** (added in Task 3 with predicate-resolution scaffolding) with the effect catalog and operation kind definitions — verbatim except for the two `locked` field additions on `JourneyOption` and `JourneyTreeBranch`.
- [ ] **Step 2: Update every CLI callsite that constructs a `JourneyOption` or `JourneyTreeBranch`** in the *ported* files to initialize `locked: false`. This is mechanical — but skipping it breaks downstream tests.
- [ ] **Step 3: Write a contract test** asserting `JourneyOption.locked` and `JourneyTreeBranch.locked` are required (TypeScript-enforced) and default to `false` when constructed via any helper in the ported manifest module. **Bug class:** future regression that drops the structural flag in favor of parsing the text prefix.
- [ ] **Step 4: Commit.** "Port manifest contract; add locked flag to options and branches."

---

## Phase B: Adapter

### Task 5: Implement the adapter (seed, content bridge, build context)

**Files:**
- Create: `src/journeys/adapter/seed.ts`, `content-bridge.ts`, `buildContext.ts`.
- Create: `src/journeys/adapter/buildContext.test.ts`.

This is the only directory allowed to import from `src/types/` or `src/state/`. The spec's "Adapter and journey context" section dictates the full mapping; the implementer follows it field by field.

Three concrete decisions the spec already settled:
- Rarity: `"Legendary"` → `"Rare"`, `"Starter"` → `"Starter"`, otherwise → `"Uncommon"`.
- Dreamsign kind: non-empty `packageTides` → `tidal`, empty → `neutral`.
- Seed: `sha256(questState.atlas.startingNodeId + ":" + site.id).slice(0, 16)`.

- [ ] **Step 1: Write the rarity-normalization test.** Three input rarities and `undefined`, four expected outputs. **Bug class:** drift in the normalization table.
- [ ] **Step 2: Write the dreamsign-kind test.** Two inputs, two expected outputs. Same bug class.
- [ ] **Step 3: Write the seed-determinism test.** Same site + state → identical seed across calls; different sites → different seeds. **Bug class:** non-determinism in seed derivation (would break manifest stability across renders).
- [ ] **Step 4: Write the bane-derivation test.** Build a deck fixture containing two bane-flagged entries and three normal cards; assert `projection.banes` has exactly the two banes and `projection.deck` has all five entries. **Bug class:** banes silently disappearing from the projection.
- [ ] **Step 5: Run tests; expect FAIL.**
- [ ] **Step 6: Implement adapter.** `seed.ts` is small (one hash call). `content-bridge.ts` maps quest types to journey-internal types. `buildContext.ts` assembles the `JourneyContext` and computes `contentVersion`.
- [ ] **Step 7: Run tests; expect PASS.**
- [ ] **Step 8: Commit.** "Implement adapter from quest state to journey context."

---

## Phase C: Value Model

### Task 6: Port the value model

**Files:**
- Create: `src/journeys/journey/value.ts` (port of `/Users/dthurn/journeys/src/journey/value.ts`).
- Create: `src/journeys/journey/value.test.ts`.

The value model is the largest pure-logic file (~1,300 LOC) and ports verbatim. Constants like `VALUE_MODEL_VERSION` carry over; the only adjustment is the literal version string (bump or keep; either works since the content version hash absorbs the change).

- [ ] **Step 1: Port `value.ts` verbatim.**
- [ ] **Step 2: Write one property test.** For a hand-built fixture of 20 random options across the three stages, assert (a) every `evaluateOptionValue` result has finite numeric CEC components; (b) `net` equals `effect - cost - burden + uncertainty` to within floating-point tolerance. **Bug class:** silent NaN propagation, sign flip, or missing component in the aggregator. One property test instead of per-effect-family assertions.
- [ ] **Step 3: Commit.** "Port value model with CEC aggregator."

---

## Phase D: Viability & Templates

### Task 7: Create shared viability helpers

**Files:**
- Create: `src/journeys/journey/shared/viability.ts`.
- Create: `src/journeys/journey/shared/viability.test.ts`.

The spec's "Shared viability helpers" subsection lists the seven helper names. These are NEW in the port — the CLI did not have a consolidated viability module. Implement each as a pure function over `JourneyContext`. For the discard-ability case, the predicate is substring search on `card.renderedText` for "discard" (case-insensitive), as the spec specifies.

- [ ] **Step 1: Write a single tabular test** that exercises each viability helper with a paired positive and negative fixture context. Eight pairs (one per helper, plus the discard-ability case). **Bug class:** each helper returning the wrong polarity (true when nothing matches, false when something does). Tabular keeps it to a single short test rather than one per helper.
- [ ] **Step 2: Implement viability helpers.**
- [ ] **Step 3: Commit.** "Add shared viability helpers used by cost and reward templates."

### Task 8: Port cost templates and complete the viability audit

**Files:**
- Create: `src/journeys/journey/shared/costs.ts` (port of `/Users/dthurn/journeys/src/journey/shared/costs.ts`).
- Create: `src/journeys/journey/shared/costs.test.ts`.

This is the first place the port *extends* the CLI rather than copying it. The CLI declares a `viable` on every cost template, but many are stand-ins: `viable: () => true` on a template that actually consumes a specific kind of deck card, or `cardMatches(...).length >= 1` on a template that operates on a specific named card. The audit's job is to upgrade these to honest checks. The implementer walks every entry in `COSTS`, categorizes it against the table below, and either keeps the existing `viable` (if it already matches the category's pattern) or rewrites it using the helpers from Task 7.

**Category table for costs:**

| Category | Viability rule | Example templates from the CLI |
| --- | --- | --- |
| Resource cost | `() => true`; locked-only via affordability check. | `pay_essence`, `pay_omens`, `pay_max_essence`, `pay_essence_random_range`, `pay_percent_essence`, `pay_all_remaining_essence`, `lose_max_essence`. |
| Deck non-empty | `deckHasMinSize(ctx, 1)`. | `purge_named_card`, `purge_random_predicate_card` (when the predicate is `any`), `purge_all_duplicate_cards` *(currently bare-bones — upgrade)*. |
| Deck contains predicate match | `deckContainsPredicate(ctx, predicateId, count)`. | `purge_random_predicate_card`, `purge_chosen_predicate_card`, `remove_transfigurations_from_random_predicate`. |
| Deck contains named card | `deckContainsCard(ctx, cardId)`. | `purge_named_card` (when the templated card name is parametric — verify against the CLI's parameter shape). |
| Deck size ≥ N | `deckHasMinSize(ctx, N)`. | `discard_X_cards` patterns; `pay_essence_random_range` if it has a draw-X-cards companion. |
| Active dreamsign required | `ctx.state.quest.activeDreamsigns.length >= N`. | `purge_named_dreamsign`, `purge_random_dreamsign`, `purge_chosen_dreamsign`, `transform_dreamsign_to_random`. |
| Bane count ≥ N | `baneCount(ctx) >= N`. | `gain_random_banes`, `gain_named_banes` (these are bane-imposing, so they're always viable in kind; the "≥ N" pattern matters for "remove banes" rewards in Task 9, not for costs). |
| Battle/shop/route modifier | `() => true`; the effect doesn't interrogate deck state. | `battle_reward_reduction_flat`, `battle_reward_reduction_percent`, `remove_shop_sites_from_next_dreamscapes`, `remove_dreamsign_sites_from_next_dreamscapes`, `set_starting_dreamwell_negative`, `shuffle_negative_dreamwell_cards`. |

**Smell patterns to fix during the audit:**
- `viable: () => true` on a template that actually requires a deck card, a specific dreamsign, or a bane. Upgrade to the matching category helper.
- `cardMatches(ctx, { source: "deck" }).length >= 1` on a template whose effect operates on a specific predicate (e.g. "duplicate Warrior"). Upgrade to `deckContainsPredicate`.
- `cardMatches(ctx, { source: "deck" }).length >= 1` on a template whose effect operates on a specific named card. Upgrade to `deckContainsCard`.
- A `purge_all_*` template whose `viable` only checks deck non-empty rather than checking that at least one matching target exists. Upgrade to count the actual matches.

The locked flag on `JourneyOption` is set by the template's render path when `locked(ctx, amount)` returns true. Shape `fill()` functions in Phase F read this flag and write it through to the option's `locked` field. The text prefix `[LOCKED]` continues to be applied by `withLockedPrefix` in `shared/text.ts`.

- [ ] **Step 1: Write the viability invariant test.** A property test over every entry in `COSTS`: assert each has a `viable` function defined and that on an "empty" fixture context (no deck, zero resources, no pool), at least one of these holds — viable returns false, OR the cost is one of the always-viable kinds (essence/omens). **Bug class:** missing or no-op `viable` function. This is the test that pins the audit's completeness.
- [ ] **Step 2: Write the locked-propagation test.** Build a fixture with 10 essence and an essence-loss cost of 50; assert the rendered text starts with `[LOCKED]` and the `locked` companion flag would be true. **Bug class:** the text prefix and structural flag falling out of sync.
- [ ] **Step 3: Write the compound-cost locking test.** Build a compound cost from one locked and one unlocked sub-cost; assert the result is locked and the rendered text has exactly one `[LOCKED]` prefix at the start. **Bug class:** double-prefixing or missing propagation.
- [ ] **Step 4: Port `costs.ts` with the viability audit.** This step touches every template. For each, decide its `viable` predicate using the shared helpers; for each, confirm its `locked` predicate matches the resource it consumes. Move slow parts of this work to subagents if dispatched.
- [ ] **Step 5: Commit.** "Port cost templates; complete the viability audit; structural locked flag."

### Task 9: Port reward templates and complete the viability audit

**Files:**
- Create: `src/journeys/journey/shared/rewards.ts` (port of `/Users/dthurn/journeys/src/journey/shared/rewards.ts`).
- Create: `src/journeys/journey/shared/rewards.test.ts`.

Same shape as Task 8 but for rewards. The CLI ships viability functions on most reward templates already, but several are too permissive — e.g., a "duplicate this specific named card" reward whose `viable` only checks deck non-empty rather than checking that the named card is actually in the deck. The audit walks every entry in `REWARDS`, categorizes against the table below, and upgrades where needed.

**Category table for rewards:**

| Category | Viability rule | Example templates from the CLI |
| --- | --- | --- |
| Resource gain | `() => true`. | `gain_essence`, `gain_omens`, `set_essence_to_percent_of_max`, `gain_essence_random_range`, `gain_essence_to_max`, `increase_max_essence`. |
| Deck predicate match required (≥ N) | `deckContainsPredicate(ctx, predicateId, N)`. | `gain_random_predicate_cards`, `draft_predicate_cards_from_4`, `take_any_from_predicate_choices`, `apply_named_transfiguration_to_chosen_predicate_cards`, `apply_named_transfiguration_to_random_predicate_cards`, `purge_chosen_predicate_cards`, `purge_chosen_predicate_with_replacement`, `transform_chosen_predicate_into_named`, `duplicate_random_predicate`, `draft_2_predicate_cards_from_4`, `draft_predicate_card_with_copies`, `draft_predicate_card_with_transfiguration`, `apply_named_transfiguration_to_all_predicate_cards`. |
| Deck contains named card | `deckContainsCard(ctx, cardId)`. | `duplicate_named_card_X` *(currently checks only non-empty deck — upgrade)*, `apply_named_transfiguration_to_card_name`, `transform_card_in_deck_into_named`. |
| Deck contains a discard-ability card | substring search `"discard"` (case-insensitive) over `card.renderedText` in `ctx.state.quest.deck`. | Any template whose effect references the discard mechanic. Grep `costs.ts`/`rewards.ts` for `discard` to find them. |
| Transfiguration target available | `transfigurationHasEligibleTarget(ctx, transfigurationId)`. | `apply_chosen_transfiguration_to_chosen_card`, `apply_named_transfiguration_to_*` (re-check that the eligibility filter is enforced for the *named* transfiguration, not just any transfiguration), `transfigure_random_starters`, `transfigure_all_starters`, `transfigure_chosen_starters`, `apply_random_transfigurations_to_random_cards`. |
| Starter cards in deck | `starterCardCount(ctx) >= N`. | `transfigure_random_starters`, `transfigure_all_starters`, `purge_named_starter`, `purge_random_starter`, `purge_random_starter_with_predicate_replacement`, `transform_starter_into_named_card`, `purge_chosen_starters`, `purge_all_starters`, `replace_starter_via_draft`. |
| Dreamsign pool match required | `poolHasDreamsignWithTide(ctx, tide)` or `dreamsignMatches(ctx).length >= N` for the unfiltered form. | `gain_random_dreamsign`, `gain_named_dreamsign`, `choose_1_of_X_dreamsigns`, `temporary_dreamsign_for_X_battles`. |
| Active dreamsign required | `ctx.state.quest.activeDreamsigns.length >= 1`. | `gain_copy_of_random_dreamsign`, `gain_copy_of_chosen_dreamsign`, `transform_dreamsign_to_named`. |
| Bane count ≥ N | `baneCount(ctx) >= N`. | `purge_X_banes`, `purge_all_banes`. |
| Route/shop modifier | `() => true`. | `add_site_to_dreamscape`, `add_site_to_next_dreamscape`, `replace_site_type`, `boost_site_appearance_chance`, `next_X_shop_rerolls_free`, `shop_essence_discount`, `shop_omen_discount`, `set_starting_dreamwell_positive`, `shuffle_positive_dreamwell_cards`. |
| Deck size ≥ N (no predicate filter) | `ctx.state.quest.deck.summary.totalCards >= N`. | `duplicate_chosen_cards`, `draw_X_and_duplicate_chosen`, `make_random_cards_reclaim`, `make_random_cards_fast`, `apply_random_transfigurations_to_random_cards`, `change_card_to_become_type`, `make_card_reclaim`, `modify_random_cards_to_types`, `opening_hand_grant_for_X_battles`, `temporary_card_copy_for_X_battles`. |
| Always viable in kind | `() => true`. | `card_cost_reduction_for_X_battles` (operates on future battles, not the current deck). |

**Smell patterns to fix during the audit:**
- A `*_named_*` reward whose `viable` only checks deck non-empty rather than checking the named card is actually in the deck. Upgrade to `deckContainsCard`.
- A `*_predicate_*` reward whose `viable` checks deck non-empty rather than checking the predicate has matches. Upgrade to `deckContainsPredicate`.
- A transfiguration reward whose `viable` returns true regardless of whether any deck card passes the *specific* transfiguration's eligibility filter. Upgrade to `transfigurationHasEligibleTarget` for that transfiguration id.
- A "duplicate a card with a discard ability" reward whose `viable` doesn't search renderedText for "discard". Add the substring check.
- A dreamsign-gain reward whose `viable` returns true regardless of pool emptiness. Upgrade to `poolHasDreamsignWithTide` or `dreamsignMatches(ctx).length >= 1`.

- [ ] **Step 1: Write the viability invariant test** symmetric to Task 8's: every reward template has a `viable` function; on an empty fixture (no deck, no dreamsign pool, no eligible transfiguration targets), every reward whose `viable` could possibly fire on emptiness returns false. **Bug class:** missing eligibility check on deck-content rewards. This is the central guarantee the viability audit must deliver.
- [ ] **Step 2: Write the discard-ability test.** Build two decks — one with a card whose `renderedText` contains "discard", one without — and assert `viable` returns true for the first and false for the second. **Bug class:** the substring search regressing to no-op or to over-strict (e.g., word-boundary issues).
- [ ] **Step 3: Write the transfiguration-eligibility test.** For each of the eight transfigurations, assert `viable` returns false on a deck where no card passes the eligibility filter and true on a deck where at least one does. **Bug class:** transfiguration rewards being offered for unreachable cards. One test, tabular over the eight transfigurations.
- [ ] **Step 4: Port `rewards.ts` with the viability audit.** Touch every reward template. For each, decide its `viable` predicate using the shared helpers from Task 7. Templates that target a specific deck card (or a card matching a predicate) call `deckContainsPredicate`. Transfiguration rewards call `transfigurationHasEligibleTarget`. Dreamsign-gain rewards call `poolHasDreamsignWithTide` (or the simpler "pool non-empty" form when no tide filter applies). The CLI's existing render-text logic is preserved unchanged.
- [ ] **Step 5: Commit.** "Port reward templates; complete the viability audit for deck and pool content."

---

## Phase E: Shape Infrastructure

### Task 10: Port shape registry, types, and shared helpers

**Files:**
- Create: `src/journeys/journey/shapes/types.ts`, `shared.ts`, `scoreWeights.ts`, `registry.ts`.
- Create: `src/journeys/journey/shapes/registry.test.ts`.

The registry is initially empty (no plugins registered yet). Phase F populates it. Each shape file `registry.ts` imports a plugin object from a sibling directory; as Phase F adds plugins, the registry's import list grows. The registry's three integrity checks (unique ids, all weighted shapes registered, all registered shapes have weights) port verbatim.

- [ ] **Step 1: Port shape `types.ts` and `shared.ts`** (defineShapePlugin, freezeShapeDefinition, decisionTreeValidator stub etc.).
- [ ] **Step 2: Port `scoreWeights.ts`** with the full 21-entry weight table.
- [ ] **Step 3: Port `registry.ts`** with the import list and the validatePlugins integrity checks. Comment out the plugin imports for now (Phase F will uncomment each as it adds them).
- [ ] **Step 4: Write the registry integrity test.** Two cases: (a) when the registry contains all 21 weighted shapes, validation passes; (b) when an entry is removed, validation throws with a clear message. **Bug class:** the registry getting out of sync with the score-weight table — the exact regression the CLI's `validatePlugins` is designed to catch.
- [ ] **Step 5: Commit.** "Port shape registry, types, and shared plugin helpers."

### Task 11a: Port operation builders

**Files:**
- Create: `src/journeys/journey/operationBuilders.ts` (port).

This is ~2,000 LOC of mechanical translation: shape-fill outputs into typed `JourneyOperation` records, classified by `operationKind`, `role`, `visibility`, `timing`, and `value`. Pure logic; no Node-specific seams. No new tests at this layer — the operation-builder logic is fully exercised by Phase F's shape tests and Phase G's integration test.

- [ ] **Step 1: Port `operationBuilders.ts`** verbatim. Watch for imports of `manifest.ts` types that may need extension for the `locked` flag (operations themselves don't carry it; the flag lives at the option/branch level).
- [ ] **Step 2: Run `npm run typecheck`** to surface any import or type mismatch from the port.
- [ ] **Step 3: Commit.** "Port operation builders."

### Task 11b: Port the assembly layer

**Files:**
- Create: `src/journeys/journey/assembly.ts` (port).

`assembly.ts` is ~400 LOC: takes the shape's `FilledJourney`, combines it with shape-agnostic metadata, and produces a draft manifest. Includes `attachTargetResolutionMetadata`, which evaluates predicates against the live deck to record concrete target lists per operation. The `locked` flag flows through here when option costs are evaluated.

- [ ] **Step 1: Port `assembly.ts`** verbatim, with two small additions: after building each option, set `option.locked = options.some(cost => cost.locked === true)` (using the locked flag from Task 8's cost rendering); same logic for tree branches.
- [ ] **Step 2: Run `npm run typecheck`.**
- [ ] **Step 3: Commit.** "Port assembly layer; wire locked flag through to options and branches."

### Task 11c: Port validators

**Files:**
- Create: `src/journeys/journey/validate/` directory with one file per validator (`tree.ts`, `references.ts`, `topology.ts`, `randomOdds.ts`, `envelopes.ts`, `sequenceMenus.ts`, `generatedObjects.ts`, etc., mirroring the CLI's `src/journey/validate/`).
- Create: `src/journeys/journey/validate/index.ts` exporting `validateJourneyManifest`.
- Tests: per-validator files only for the contract-heavy ones (see Step 2).

The validators are the lifeline that surfaces shape regressions early. CLI validators port verbatim. Most are pure; the tree validator is the largest.

- [ ] **Step 1: Port each validator file** into `validate/`. Confirm the index exports `validateJourneyManifest` with the same signature as the CLI.
- [ ] **Step 2: Add positive-and-negative tests** for the three most contract-heavy validators: tree (`decision_tree_invariants`), references (`references_are_resolvable`), topology (`options_match_shape_topology`). **Bug class:** a malformed manifest slipping past validation. Three tests at this layer, not one per rule.
- [ ] **Step 3: Commit.** "Port validators with positive-and-negative tests for the contract-heavy rules."

---

## Phase F: Shape Plugins

Each shape directory contains one or more files (typically `index.ts` exporting the plugin, plus `fill.ts`, `validators.ts`, sometimes `text.ts`). The CLI's directory structure mirrors what the port should produce. Test design per task: one **contract test per shape** verifies the shape's structural promise (option count in range, role mix matches topology, every option has a non-empty text). No per-template tests, no per-magic-number tests.

### Task 12a: Port direct-menu shapes (first batch)

**Plugins (5):** `random_rewards`, `random_trades`, `one_operation_many_targets`, `one_target_many_operations`, `same_cost_different_rewards`.

The per-shape contract test described below is the standard test pattern reused throughout Tasks 12a, 12b, 13, 14, and 15. The "test design" subsection here applies to every shape task that follows.

**Test design (applies to every shape task in Phase F):** For each shape, a single test that runs `plugin.fill(...)` on a populated fixture context (deck of ~10 cards, 1–2 active dreamsigns, modest essence/omens), then asserts: option (or branch) count within `rootOptionCount` bounds, each option has non-empty `text`, each option's `locked` flag is a boolean, the shape's specific validators all pass. **Bug class:** silent regression in shape `fill()` that produces structurally valid but semantically malformed manifests. One test per shape, no enumeration of options.

- [ ] **Step 1: Port each of the 5 plugin directories** under `src/journeys/journey/shapes/<id>/`. As each plugin lands, uncomment its import in `registry.ts`.
- [ ] **Step 2: Write per-shape contract tests** following the pattern above.
- [ ] **Step 3: Run; verify all 5 shape tests pass and registry integrity still holds.**
- [ ] **Step 4: Commit.** "Port direct-menu shapes (random_rewards, random_trades, one_operation_many_targets, one_target_many_operations, same_cost_different_rewards)."

### Task 12b: Port direct-menu shapes (second batch)

**Plugins (5):** `same_reward_different_costs`, `heterogeneous_pair`, `choose_your_loss`, `alter_dreamscapes`, `flat_escalating_trade`.

- [ ] **Step 1: Port each of the 5 plugin directories.** Uncomment imports in `registry.ts` as you go.
- [ ] **Step 2: Write per-shape contract tests** following the Task 12a pattern.
- [ ] **Step 3: Run; verify all 5 shape tests pass.**
- [ ] **Step 4: Commit.** "Port direct-menu shapes (same_reward_different_costs, heterogeneous_pair, choose_your_loss, alter_dreamscapes, flat_escalating_trade)."

### Task 13: Port single-offer, random-commit, and delayed-hook shapes

**Plugins (6):** `single_offer`, `single_wager`, `single_random_outcome`, `now_vs_later`, `commit_now_future_payoff`, `reward_after_trigger`.

- [ ] **Step 1: Port each plugin.**
- [ ] **Step 2: Write per-shape contract tests** following the Task 12 pattern. The shape-specific validators (e.g., `single_offer`'s exactly-one-take-and-one-leave rule) ride along through the contract test.
- [ ] **Step 3: Commit.** "Port single-offer, random-commit, and delayed-hook shapes."

### Task 14: Port repeatable-menu shapes

**Plugins (2):** `shop_row`, `take_any_number`. Both cap at `rootOptionCount.max = 3`, so the UI's "1–3 circles" rendering holds.

- [ ] **Step 1: Port each plugin.**
- [ ] **Step 2: Write per-shape contract tests** + one regression assertion that `rootOptionCount.max === 3` for both shapes. **Bug class:** the bound creeping above 3 without UI awareness.
- [ ] **Step 3: Commit.** "Port repeatable-menu shapes."

### Task 15: Port decision-tree shapes

**Plugins (3):** `push_your_luck`, `random_pool_draws`, `escalating_reward_chain`. These build a `tree` rather than `options`. Their precommit validators check that random branches' odds sum to 1 and that every node is reachable.

- [ ] **Step 1: Port each plugin.**
- [ ] **Step 2: Write per-shape contract tests.** For each: assert a non-empty `tree.nodes` array, `tree.rootNodeId` matches one of the nodes, the tree validator passes, the precommit bundle's `random` entries reference real branches. **Bug class:** malformed tree topology, orphan nodes, or missing precommit rolls.
- [ ] **Step 3: Commit.** "Port the three decision-tree journey shapes."

---

## Phase G: Generation and Tree Traversal

### Task 16: Port the generation pipeline and add tree advancement helpers

**Files:**
- Create: `src/journeys/journey/generate.ts` (port).
- Create: `src/journeys/util/tree.ts` (new — `advanceTree` and `initializeTree` per the spec).
- Tests: `src/journeys/journey/generate.test.ts`, `src/journeys/util/tree.test.ts`.

`generate.ts` ports verbatim. The history input is empty array for now (spec's open extension point). Forced-shape and forced-stage paths port unchanged.

`tree.ts` is new. The spec's "Decision-tree advancement" subsection specifies the algorithm: `advanceTree(tree, fromBranchId, precommitted) → { nextNode, terminal }` walks player-choice / random / automatic branches using `precommitted.random` until it reaches the next player-choice node or a terminal. `initializeTree(tree, precommitted)` is the same logic starting from `tree.rootNodeId`.

- [ ] **Step 1: Port `generate.ts`.**
- [ ] **Step 2: Write the byte-stable generation test.** For one fixed seed and one fixed fixture context, run `generateNextJourney` twice and assert the manifests are JSON-stable. **Bug class:** non-determinism creeping into generation (would break the persistence model from the spec).
- [ ] **Step 3: Write the forced-shape sweep test.** For every registered shape id, run `generateNextJourney` with `forcedShapeId` set; assert success and that the returned manifest's `shapeId` equals the forced id. **Bug class:** a shape that fails to generate even when forced — the most common port-regression signal. One loop over 21 shapes, not 21 tests.
- [ ] **Step 4: Implement `advanceTree` and `initializeTree`.**
- [ ] **Step 5: Write the tree-advancement test.** For a hand-built tree with one root player-choice node, one random child, one player-choice grandchild, and one terminal: call `advanceTree` on the root branch; assert the result is the grandchild node, having traversed the random child via the precommitted bundle. Repeat with a path that terminates; assert `nextNode` is null and `terminal` is populated. **Bug class:** the traversal getting stuck on random/automatic branches, or jumping past a player-choice node.
- [ ] **Step 6: Commit.** "Port generation pipeline; add decision-tree advancement helpers."

---

## Phase H: Dream Art and UI

### Task 17: Port the dream art ledger and matcher, extend the asset pipeline

**Files:**
- Create: `src/journeys/data/reward-art-matches.toml` — copy from `/Users/dthurn/journeys/docs/journey-reward-art-matches.toml`.
- Create: `src/journeys/ui/dreamArt.ts` — browser port of the CLI's matcher (allocation logic, NOT iTerm2 image rendering). Returns `{ imageId, dreamName, imageUrl }` per option/branch.
- Modify: `scripts/setup-assets.mjs` — add a step that copies (or symlinks, matching the script's existing pattern) `/Users/dthurn/Documents/shutterstock/images_journeys/*` into `public/journeys/`, preserving the trailing-numeric-id naming convention (`*-<imageId>.<ext>`).
- Test: `src/journeys/ui/dreamArt.test.ts`.

The asset pipeline question from the spec is settled here: the existing setup-assets.mjs already pulls assets from `~/Documents/` for other categories (dreamcallers, dreamsigns); journey art uses the same convention.

- [ ] **Step 1: Copy the ledger TOML** into `src/journeys/data/`.
- [ ] **Step 2: Port the matcher's allocation algorithm** (the deterministic per-manifest-seed walk that prefers an unused dream of the matching reward type, falls back to cross-type, falls back to repeat). Strip out everything related to terminal rendering (`supportsInlineImages`, `sharp` PNG resizing, OSC 1337 escapes).
- [ ] **Step 3: Wire `imageUrlFor(imageId)`** to return `/journeys/<imageId>.<ext>`. The `<ext>` is captured from the on-disk filename during ledger load (the CLI's `imagePathIndex` logic ports as a function that scans `public/journeys/` at module load and caches the imageId→extension map; in the browser, this map is populated at build time by setup-assets.mjs writing a small manifest JSON the matcher can fetch). Decision point for the implementer: simplest browser-friendly form is a static `imageId-to-extension.json` written by setup-assets.mjs and imported synchronously.
- [ ] **Step 4: Extend setup-assets.mjs.** Add a journeys block that mirrors the existing dreamcaller/dreamsign blocks: source path `~/Documents/shutterstock/images_journeys`, destination `public/journeys/`. If the source path is absent (developer who lacks the asset cache), the script logs a warning and continues — matching the existing graceful-degradation pattern.
- [ ] **Step 5: Write the matcher determinism test.** Build a small manifest with three reward-bearing options; assign dreams twice; assert the assignments are identical. **Bug class:** allocator non-determinism — would cause UI flicker on re-render.
- [ ] **Step 6: Write the fallback-chain test.** Build a manifest whose options all have the same reward type that has only one entry in a tiny fixture ledger; assert at least one option borrows a cross-type dream and the matcher returns a `repeatFallbacks` entry. **Bug class:** the fallback chain regressing to either crash or silent omission.
- [ ] **Step 7: Commit.** "Port dream-art ledger and matcher; extend setup-assets for journey images."

### Task 18: Build UI primitive components

**Files:**
- Create: `src/journeys/ui/CloseButton.tsx`, `JourneyHoverCard.tsx`, `JourneyOptionCircle.tsx`.

Each component is small. Props are spelled out in the spec's "Components" subsection. Style cues: use the existing screen's gradient backgrounds and the purple palette (`#7c3aed` for the Enter Dream button, `#a855f7` for accents) so the new screen sits visually with the rest of the prototype.

Test approach: don't add unit tests for individual primitives. The integration test in Task 19 covers their wiring through the `JourneyScreen`. Per the spec's testing rules, avoid trivial "renders without crashing" tests.

- [ ] **Step 1: Implement CloseButton.** White × on red round button, top-left absolute position. `disabled` prop suppresses click and dims the visual.
- [ ] **Step 2: Implement JourneyHoverCard.** Popover with dreamName heading + full rendered text. framer-motion fade-in matches the existing screen's style.
- [ ] **Step 3: Implement JourneyOptionCircle.** Composes the circular `<img>`, dream-name caption, and Enter Dream button. `locked` prop disables the button; hover handlers wire the hover card.
- [ ] **Step 4: Commit.** "Add journey UI primitive components."

### Task 19: Build JourneyScreen with state machine and tests

**Files:**
- Create: `src/journeys/ui/JourneyScreen.tsx`.
- Create: `src/journeys/ui/JourneyScreen.test.tsx`.

The component's state and render rules are fully specified in the spec's "UI and rendering" section: memoized manifest, `currentNodeId` state initialized via `initializeTree`, render the current node's player-choice branches (or `manifest.options` for flat shapes), handle Enter Dream (advance vs. close), handle Close (with `choose_your_loss` exception), render the error fallback if generation throws.

Tests use a mocked `generateNextJourney` so each test owns its manifest. This keeps the test file fast and decoupled from generator behavior (which is already covered by Phase F and Phase G tests).

- [ ] **Step 1: Implement JourneyScreen** following the spec's rules. The component is the single place that knows when to call `onClose` vs. when to advance.
- [ ] **Step 2: Write the six UI tests** the spec's "UI tests" subsection lists:
  - Flat manifest renders one circle per option.
  - Option with `locked: true` renders a disabled Enter Dream button.
  - `choose_your_loss` shape renders a disabled Close button; every other shape renders it enabled.
  - Tree manifest's Enter Dream on a non-terminal branch advances `currentNodeId` and re-renders.
  - Tree manifest's Enter Dream on a branch whose advancement reaches a terminal calls `onClose`.
  - A manifest that throws during generation renders the "This dream eludes you. Press × to leave." fallback with an enabled Close button.

  **Bug class for each:** a regression that breaks the player flow on a single shape category. These six are non-redundant; they each pin a distinct branch in the screen's state machine.
- [ ] **Step 3: Commit.** "Add JourneyScreen with decision-tree state machine and UI tests."

---

## Phase I: Cutover

### Task 20: Wire the new screen into the quest prototype

**Files:**
- Modify: `src/types/quest.ts` — simplify the `DreamJourneySiteRuntime` arm to `{ kind: "dreamJourney"; completed: boolean }` (drop `optionIds`).
- Modify: `src/state/quest-context.tsx` — add `completeDreamJourneySite(siteId)` mutation; expose via the `QuestMutations` interface.
- Modify: `src/state/multiplayer-quest-context.tsx` — mirror the new mutation.
- Modify: the screen router that dispatches site rendering (find via grep — likely `src/components/ScreenRouter.tsx` or a sibling) so that `"DreamJourney"` sites render `<JourneyScreen site={site} onClose={...} />` from `src/journeys`.
- Modify: `src/state/quest-context.tsx` — the existing `ensureDreamJourneyRuntime` continues to fire to populate the simplified `{ completed: false }` slot on first visit. The `optionIds` field is removed from the assignment.

The new mutation marks the site visited and returns to the dreamscape. Same logging events fire from the new screen.

- [ ] **Step 1: Add `completeDreamJourneySite` mutation** in both quest contexts.
- [ ] **Step 2: Update the screen router** to dispatch DreamJourney sites to the new screen.
- [ ] **Step 3: Update `ensureDreamJourneyRuntime`** to write the simplified runtime slot.
- [ ] **Step 4: Write one integration test** for the new mutation: dispatch `completeDreamJourneySite("site-1")`; assert the site is in `visitedSites`, the runtime is `{ kind: "dreamJourney", completed: true }`, deck and resources are unchanged. **Bug class:** the new mutation accidentally mutating deck/resources, which is the central no-effects-applied contract.
- [ ] **Step 5: Commit.** "Wire the new JourneyScreen into the quest prototype."

### Task 21: Delete the old dream journey system

**Files:**
- Delete: `src/data/dream-journeys.ts`, `src/screens/DreamJourneyScreen.tsx`, `src/screens/DreamJourneyScreen.test.tsx`.
- Modify: `src/state/quest-context.tsx` — remove `ensureDreamJourneyRuntime` (replaced by inline runtime creation in the new flow if needed), `completeDreamJourneyOption`, `applyDreamJourneyEffect`, `dreamJourneyOptionId`, `findDreamJourneyOption`.
- Modify: `src/state/multiplayer-quest-context.tsx` — mirror the removals.
- Modify: `src/types/quest.ts` — remove the `JourneyEffect` union (already moved earlier).
- Modify: tests anywhere in `src/` that referenced `DREAM_JOURNEYS`, `completeDreamJourneyOption`, or `ensureDreamJourneyRuntime` — delete the assertions; if a test loses all its assertions, delete the whole test.

The previous task left the old `ensureDreamJourneyRuntime` in place writing a simplified slot. If the new flow doesn't need a runtime-creation step at all (the runtime can be lazily created by the new screen's mount), drop `ensureDreamJourneyRuntime` entirely.

- [ ] **Step 1: Delete the doomed files.**
- [ ] **Step 2: Strip the old mutations and helpers** from both quest contexts.
- [ ] **Step 3: Run `npm test`** and triage failures. For each failing test that references deleted code: if the test's bug class is still relevant under the new flow, rewrite it against the new mutation; otherwise delete it.
- [ ] **Step 4: Run `npm run typecheck`** and resolve any straggling references.
- [ ] **Step 5: Commit.** "Delete the legacy dream-journey system."

---

## Phase J: QA and Cleanup

### Task 22: Manual QA and final polish

**Files:** No source changes expected. If QA surfaces a bug, follow the bug's diagnosis to a focused fix in the appropriate task's files.

- [ ] **Step 1: Run the full test suite.** `npm test`. Time the run with `time npm test`. If any individual test file exceeds 10 seconds, refactor or split it; if any exceeds 30 seconds, delete the slowest assertions and re-evaluate (per the spec's hard rules).
- [ ] **Step 2: Run `npm run typecheck` and `npm run lint`.** Both must be clean.
- [ ] **Step 3: Run the dev server** (`npm start`) and execute the spec's Manual QA checklist via the `agent-browser` CLI tool:
  - Open a Dream Journey site in each dreamscape stage; confirm 1–3 circles with images, hover-cards, and Enter Dream buttons.
  - Confirm Close is enabled on every shape except `choose_your_loss`.
  - Force low essence; confirm at least one option renders as `[LOCKED]` with a disabled Enter Dream button.
  - Trigger a decision-tree shape; confirm Enter Dream advances and eventually closes at a terminal.
  - Confirm Enter Dream returns to the dreamscape without modifying state.
- [ ] **Step 4: Commit any incidental fixes** discovered during QA.
- [ ] **Step 5: Final commit and push.** "Polish dream-journey port after manual QA."

---

## Open Extension Points (deferred per spec)

These appear in the spec's "Open extension points" section and intentionally do not have tasks in this plan. They are listed here so a future planner can pick them up:

- Prior-shape history fed from `visitedSites` into shape scoring.
- Persisting decision-tree progress (`currentNodeId`) on the site runtime so reloads don't rewind.
- Debug panel exposing `--shape`, `--stage`, and `--seed` overrides.
- Shape-distribution Monte Carlo dev script.
- Real Dreamwell card content in `shared/dreamwell.ts`.
- Tag-based predicate for discard-ability (replacing the substring search).

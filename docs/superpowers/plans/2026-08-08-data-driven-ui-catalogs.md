# Data-Driven Gamble, Transfiguration, Dreamwell Prompt, Tide, and Rules-Symbol Catalogs

**Status:** Technical proposal and TDD implementation plan
**Date:** 2026-08-08

## Outcome

Move five families of repeated authored UI and rules metadata out of TypeScript and Fluent lookup tables and into canonical typed RON catalogs:

1. Gamble rules, tuning, outcomes, and presentation live in `data/gamble.ron`.
2. Transfiguration rules, tuning, forms, and presentation live in `data/transfiguration.ron`.
3. Dreamwell automation prompts live beside their owning cards in `data/dreamwell.ron`.
4. The five resonances live in `data/resonance.ron`.
5. Rules-text symbol labels and presentation metadata live on their concepts in `data/glossary.ron`.

The migration preserves the exact source-English experience. TypeScript remains responsible for generic algorithms, state transitions, rendering, and closed interpreters. It must not contain per-game, per-form, per-resonance, per-symbol, or per-prompt content tables after cutover.

## Why This Boundary

The current implementation distributes the same concepts across RON, generated JSON, Fluent, and TypeScript. That produces several independent lookup tables which must agree by convention. A new Gamble game or Transfiguration form requires edits in unrelated layers; prompt copy can drift from the Dreamwell card that triggers it; and basic labels are duplicated between visible and accessible UI.

The intended ownership rule is:

| Concern | Owner after migration | Runtime responsibility |
| --- | --- | --- |
| Authored rules, values, ordering, labels, descriptions, visual tokens | Typed RON | Load and interpret |
| Stable persisted identity | Closed, validated identifiers | Store IDs, never display names |
| Algorithms such as shuffling and state folding | TypeScript | Apply catalog values deterministically |
| Closed effect operations | Rust schema plus TypeScript interpreter | Exhaustively execute operation kinds |
| Grammar, plural/select behavior, and reusable sentence shells | Fluent | Format complete messages from semantic arguments |
| One-off interface controls | Fluent | Format at the display boundary |

Data-driven does not mean putting executable programs in RON. Catalogs select from typed operations and predicates. TypeScript may switch on an operation kind such as `SetFast` or `AppendRulesClause`; it may not switch on `Hastened` or another authored form identity.

## Goals

- Give every repeated authored concept one canonical source.
- Move all Gamble-owned rules and presentation to `gamble.ron`, including values currently in `sites.ron`, `economy.ron`, Fluent, and code constants.
- Move all Transfiguration-owned rules and presentation to `transfiguration.ron`, including selection tuning and prices currently owned by other catalogs.
- Preserve stable Gamble game IDs, Transfiguration form IDs, Dreamwell card UUIDs, tide IDs, and symbol IDs.
- Preserve deterministic replay and cooperative-room content compatibility.
- Preserve source-English wording, punctuation, ordering, colors, icons, outcomes, eligibility, and numerical behavior.
- Make missing, duplicate, or invalid catalog coverage a compile-time or startup error.
- Make production logs sufficient to reconstruct which catalog rules were applied.

## Non-Goals

- Redesigning the Gamble games or rebalancing their values.
- Changing any Transfiguration effect or eligibility rule.
- Moving generic site placement, site icons, guide dialogue, or random-site routing out of their current owners.
- Moving all Dreamwell effect execution into RON; this proposal moves Dreamwell prompt ownership only.
- Replacing Fluent. Fluent remains the right owner for grammatical shells, plural/select logic, and isolated application controls.
- Making arbitrary runtime-defined operation kinds possible.
- Changing persisted IDs or comparing player-facing names as identities.

## Current Ownership Debt

### Gamble

Gamble configuration is split among `data/sites.ron`, `data/economy.ron`, `data/locales/en-US/sites.ftl`, rule-version constants, five game modules under `src/data`, the Journey Gamble reducer, and site-provider setup. Values and copy are selected by game identity in several layers.

`sites.ron` should continue to describe Gamble as a site and participate in site placement. `economy.ron` should continue to describe general Journey economy. Neither should own a Gamble game's internal prices, payouts, attempt limits, target bands, outcomes, or rules version.

### Transfiguration

Form names and descriptions are spread across site, card, and accessibility Fluent files. Colors, icons, and display tints live in `transfiguration-display.ts`; form-specific behavior and eligibility live in `transfiguration-logic.ts`; choice rendering repeats form switches; pricing lives in `economy.ron`; and allowed forms plus benefit tuning live in `reward_selection.ron`.

The generic reward-selection blend remains in `reward_selection.ron`. Transfiguration's forms and their scoring inputs belong to `transfiguration.ron`.

### Dreamwell prompts

Dreamwell card identity and authored card text live in `dreamwell.ron`, while automation prompts live in `battle-prompts.ftl`. The effect table maps card UUIDs to descriptors, and lifecycle compatibility code also contains a large legacy prompt lookup. Prompt wording is therefore detached from the card definition that owns the interaction.

### Resonances

The five tide names exist in visible and accessible Fluent branches while icon and color metadata lives in `tide-spec.ts`. Some consumers title-case identifiers rather than reading authored display names.

### Rules-text symbols

Six accessibility labels live in `cards.ftl`, while `RulesText.tsx` maps tokens to both icons and Fluent IDs. The glossary already owns the concepts represented by most of these symbols, making it the natural source for symbol metadata.

## Target Data Flow

Canonical RON is compiled through `tools/game-data`, lowered to compatibility TOML where required, and refreshed into checked generated JSON. Runtime loaders validate the generated payload before exposing typed data. The manifest records dependencies and refresh ownership.

For gameplay catalogs, the room genesis stores the catalog fold hash. A client must pass the existing content-configuration gate before joining or resuming a room whose Gamble or Transfiguration rules differ. Presentation-only tide and glossary metadata does not affect a gameplay fold hash.

```text
canonical RON -> Rust source model and semantic validation
              -> compatibility TOML and generated JSON
              -> runtime validator and typed loader
              -> generic interpreter / view-model builder
              -> React and accessibility output
```

## Catalog Design

### 1. `data/gamble.ron`

`GambleCatalog` owns the complete authored definition of every Gamble game. The initial catalog has exact coverage for Blackjack, Gravok's Wager, Tidemark Ladder Climb, Starway Stairs, and Four-Suit Reprise.

Each game definition contains:

- A stable game ID and rules-version value.
- Selection weight and deterministic fallback participation.
- Title, rules disclosure, action labels, outcome labels, and accessibility descriptions.
- Entry price, retry price, rewards, payouts, and loss values.
- Attempt limits, deck configuration, thresholds, target bands, tiers, and outcome ordering.
- A typed game-specific rule payload selected by a closed `GambleGameRules` enum.

The minimum schema shape is:

```rust
struct GambleGameDefinition {
    id: GambleGameId,
    rules_version: String,
    selection: GambleSelection,
    economy: GambleEconomy,
    presentation: GamblePresentation,
    rules: GambleGameRules,
}
```

The Rust compiler validates exact game coverage, unique IDs, non-negative economic values, reachable and non-overlapping configured outcome ranges, valid deck composition, valid attempt counts, unique tier boundaries, and complete presentation for every emitted outcome.

The TypeScript implementation retains generic deterministic deck construction, seeded shuffling, reducer transitions, and outcome evaluation. A closed interpreter dispatches on the `GambleGameRules` variant. Per-game tuning and copy do not live in that interpreter.

The migration removes the Gamble rule subtree from `sites.ron` and Gamble prices/rewards from `economy.ron`. `sites.ron` keeps site-level metadata, placement constraints, and navigation. Dream Guide dialogue remains in `dream_guides.ron`.

### 2. `data/transfiguration.ron`

`TransfigurationCatalog` owns site configuration, pricing, selection tuning, benefit tuning, form order, form presentation, eligibility, and effects. It has exact coverage for all nine stable form IDs, including `Hastened`.

Each form contains:

- Stable form ID and glossary UUID.
- Source-English name, effect disclosure, selected-card description, and accessibility description.
- Icon/glyph token, accent color, tint values, and display order.
- A typed eligibility predicate.
- A typed effect operation and its parameters.
- Benefit-scoring configuration used by reward selection.

The site-level catalog contains choice limits, pricing, allowed-form ordering, and rules-version metadata. The existing generic Transfiguration reward blend remains in `reward_selection.ron`; the list of forms and form-specific benefit inputs move to this catalog.

The predicate and operation schemas are closed algebras. Representative operations include `HalveEnergyCost`, `UseAuthoredAmplifiedText`, `DoubleSpark`, `AppendRulesClause`, `SetFast`, `WidenNamedTrigger`, `ReduceActivatedEnergyCost`, and `ApplyEligibleForms`. Parameters such as rounding, minimum result, appended semantic clause, reduction amount, and child-form order are data.

The catalog must not contain JavaScript, regular expressions, or free-form executable expressions. Generic code implements each closed operation and answers whether that operation applies to a card. A small exhaustive switch on operation kind is expected; a switch on form ID is prohibited.

The compiler validates exact stable-ID coverage, unique glossary references, valid colors and glyph tokens, legal predicate/operation pairings, positive pricing, deterministic form order, and absence of recursive application cycles. `Hastened` receives a canonical glossary entry so every form has the same ownership model.

The migration removes Transfiguration prices from `economy.ron`, choice limits from `sites.ron`, and form-specific selection tuning from `reward_selection.ron`.

### 3. Dreamwell-owned prompts

Each Dreamwell card definition may contain an `automation` block with stable semantic prompt keys. Prompt records own complete source-English title, subtitle, instructions, and card-specific choices. Reusable controls such as a generic Cancel action may remain Fluent.

Runtime state refers to prompt content semantically:

```ts
type DreamwellPromptRef = {
  cardUuid: CardId;
  promptKey: string;
  args: Record<string, SemanticPromptArg>;
};
```

Prompt keys are stable identifiers within a Dreamwell card, not array indexes. Rendering resolves the reference through the room's pinned Dreamwell catalog at the display boundary. Battle logs record the card UUID, prompt key, and semantic arguments, not rendered English.

The existing TypeScript effect registry remains responsible for automation behavior in this proposal. Its prompt-producing actions must use semantic prompt references. The compiler and runtime coverage test ensure every prompt reference resolves and every placeholder receives the correct semantic argument type.

Legacy persisted Fluent descriptors remain readable through a narrowly scoped compatibility decoder. New gameplay state does not emit them. Compatibility must be tested with synthetic legacy fixtures rather than mutable production catalogs.

### 4. `data/resonance.ron`

This presentation catalog contains exactly the five stable resonance IDs. Each record owns its display name, glyph token, accent color, and accessibility name inputs. Complete grammatical accessibility shells such as a resonance announcement may remain Fluent and receive the authored name as an argument.

The runtime and editor consume the same generated data. `tide-spec.ts` becomes a loader-backed accessor rather than an authored table, and consumers stop deriving display names by title-casing IDs.

The compiler validates exact stable-ID coverage, unique IDs, valid glyph tokens, valid CSS colors, and deterministic order. Tides4 tide definitions are curated in `data/tides.ron`, and Dream Avatar tide-pool composition is curated in `data/dream_avatar_tide_pools.ron`.

### 5. Glossary-owned rules symbols

`data/glossary.ron` gains optional `rules_symbol` metadata. The six initial entries cover essence, points, lunar/exhaust, memory, energy, and spark. Each record owns a stable symbol token, accessible label, glyph key, and optional semantic color role.

`RulesText.tsx` derives its token registry from generated glossary data. Generated glossary metadata supplies both the icon and accessibility label. The special Fast/Interrupt bolt announcement may remain Fluent because it is a grammatical, context-sensitive message rather than a symbol name.

The compiler validates unique token ownership, exact coverage of supported rules-text tokens, valid glyph keys, and complete accessibility labels. Rules parsing continues to recognize a closed token syntax; adding arbitrary syntax through data is not part of this proposal.

## Localization Contract

The new RON fields contain the canonical source-English content. Generated runtime data exposes authored text through semantic owner IDs and fields, not anonymous string arrays. This follows the repository's current single-source-English runtime while leaving a clean seam for a future catalog localization layer.

Fluent remains the owner of messages that need plural/select logic, grammatical reordering, or a complete reusable sentence shell. It must not be used as a second database for the names, descriptions, rules disclosures, outcomes, or visual labels owned by these catalogs.

The cutover uses an explicit parity fixture during development to compare normalized old output with new output. Committed tests assert structural coverage, semantic arguments, and resolver behavior; they do not assert specific UI strings.

Translator descriptions are updated for any remaining Fluent shell whose arguments now come from a RON catalog. Arguments use semantic names such as `resonanceName`, `formName`, or `attemptCount`, and descriptions explain the complete rendered sentence.

## Runtime and Persistence Contract

### Generated data and loaders

The pipeline adds generated `gamble-data.json`, `transfiguration-data.json`, and `resonances-data.json` outputs and extends glossary and Dreamwell outputs with their new metadata. Runtime validators fail closed on malformed payloads.

`JourneyContent` gains typed Gamble and Transfiguration data. Code must accept these dependencies explicitly rather than importing mutable module-level production fixtures in reducers or tests.

### Cooperative rooms

Room genesis and content configuration gain `gambleFoldHash` and `transfigurationFoldHash`. The hashes cover canonical gameplay-relevant catalog bytes after compilation. Moving Gamble and Transfiguration values out of sites/economy also removes those bytes from the sites/economy fold hashes, preventing one authored rule from being represented by two hashes.

Legacy room fixtures which do not contain the new hashes are rejected by the existing content-configuration compatibility gate with a stable reason. Reducer state versions do not change solely because content moved: persisted Gamble rules-version strings and Transfiguration IDs retain their existing shapes. Any discovered state-shape change requires an explicit version migration and a synthetic replay test before implementation proceeds.

### Rule versions

Each Gamble game rules version moves to `gamble.ron` and is copied into persisted game state when a site opens. Transfiguration gains a catalog rules version used in logs and room content validation. Code constants cease to be authoritative.

### Logging

Gamble selection, site opening, attempts, and outcomes log the Gamble fold hash, stable game ID, rules version, resolved thresholds, economic inputs, deterministic seed context, and result. Transfiguration offers and applications log the Transfiguration fold hash, stable form IDs, predicate decision, operation parameters, price, and resulting semantic card changes. Dreamwell prompts log card UUID, prompt key, and semantic arguments.

Logs must allow reconstruction without relying on the current catalog or display strings.

## Testing Strategy

Every task follows red–green–refactor:

1. Name the missing ownership or invalid behavior as the bug class.
2. Add the smallest deterministic synthetic test that fails for that reason.
3. Run the focused command and confirm the expected failure.
4. Implement the smallest typed contract that makes it pass.
5. Refactor only after the focused test is green.
6. Run the relevant generated-data and integration checks.

Tests use synthetic catalog fixtures and stable IDs. They do not assert particular player-facing strings, mutable production balance values, production catalog counts beyond closed identity coverage, or private implementation details. Temporary parity tooling may compare old and new source-English output during migration, but string snapshots are removed before the final commit.

## Implementation Plan

### Task 1: Establish a reproducible ownership inventory and cutover guardrails

**Bug class:** authored Gamble, Transfiguration, Dreamwell prompt, tide, and rules-symbol data can be added to TypeScript or Fluent without any ownership check.

**Red**

- Add a focused audit test which identifies forbidden identity-keyed tables and legacy message families in the five scoped areas.
- Add structural tests describing which catalog will own each current source field.
- Run the focused audit and confirm it fails on the current known tables and messages.

**Green**

- Introduce a machine-readable migration allowlist so the audit can land before cutover and shrink task by task.
- Record every current field, consumer, persisted representation, and logging site in the test fixture.
- Ensure the audit distinguishes legitimate closed operation switches and one-off Fluent strings from authored lookup tables.

**Verify**

- `npm test -- scripts/data-driven-ui-ownership.test.ts`
- `npm run game-data:check`

**Done when:** all five areas have an executable inventory, and an unlisted new identity-keyed table fails the audit.

### Task 2: Add typed compiler foundations for the new catalogs

**Bug class:** canonical gameplay catalogs can compile without semantic validation, dependency declaration, or deterministic generated output.

**Red**

- Add Rust tests with minimal synthetic Gamble, Transfiguration, and tide documents.
- Cover duplicate IDs, missing closed-ID coverage, invalid values, invalid glyph/color tokens, illegal predicate/operation pairs, and nondeterministic ordering.
- Confirm each invalid fixture fails with a field-specific diagnostic.

**Green**

- Add typed Rust source models, validators, and lowerers.
- Register `gamble`, `transfiguration`, and `resonances` in `data/game-data-manifest.ron` with explicit dependencies and refresh owners.
- Extend Dreamwell and glossary models for prompts and rules-symbol metadata.
- Generate deterministic compatibility TOML and runtime JSON.

**Verify**

- `npm run game-data:rust-test`
- `npm run game-data:compile`
- `npm run game-data:check`

**Done when:** valid synthetic catalogs round-trip deterministically and every invalid semantic case fails before runtime.

### Task 3: Make `gamble.ron` the sole Gamble rule owner

**Bug class:** the same Gamble rule or value can differ between sites, economy, Fluent, and a game module.

**Red**

- Add synthetic compiler tests for all five game-rule variants and their outcome validation.
- Add a data-ownership test proving sites/economy inputs containing Gamble-owned fields are rejected after schema cutover.
- Add a temporary parity harness that evaluates representative old and new configurations with fixed seeds and reports any behavioral or source-English difference.

**Green**

- Author `data/gamble.ron` from the current production values and text.
- Remove Gamble-owned subtrees from `sites.ron` and `economy.ron`.
- Remove direct Gamble presentation messages from `sites.ftl`, retaining only genuine grammatical shells and generic controls.
- Refresh generated artifacts.

**Refactor**

- Delete compatibility fields once all consumers use the new artifact.
- Remove the temporary string assertions after parity is proven; retain semantic and structural tests.

**Verify**

- `npm run game-data:compile`
- `npm run game-data:parity`
- `npm test -- src/data/gamble-data.test.ts`

**Done when:** changing a Gamble rule, value, outcome, or owned label requires one edit in `gamble.ron`.

### Task 4: Interpret Gamble data generically at runtime

**Bug class:** TypeScript game-identity switches continue to act as hidden authored rule tables after the catalog exists.

**Red**

- Add reducer and algorithm tests using tiny injected Gamble fixtures for selection, attempts, prices, rewards, thresholds, and every outcome kind.
- Add a negative test showing an unsupported typed rule variant fails exhaustively.
- Add a logging test which reconstructs an outcome from logged semantic inputs.

**Green**

- Add the runtime loader and validator and inject Gamble data through `JourneyContent`.
- Convert the five modules and Journey reducer to consume typed game definitions.
- Move rules-version and maximum-attempt constants to catalog reads.
- Build view models from catalog presentation records.
- Remove per-game copy/value lookup tables and shrink the migration allowlist.

**Verify**

- `npm test -- src/data/gamble-data.test.ts src/rules/journey/gamble.test.ts src/coop/providers/site-provider.test.ts`
- Run each Gamble game through its normal player workflow and inspect the captured error buffer.

**Done when:** TypeScript contains algorithms and exhaustive rule-variant handling, but no authored per-game table.

### Task 5: Make `transfiguration.ron` the sole Transfiguration rule owner

**Bug class:** a Transfiguration form's effect, eligibility, presentation, price, and reward-selection behavior can drift independently.

**Red**

- Add synthetic compiler tests for all predicate and operation variants.
- Test exact stable-form coverage, missing glossary links, cycles in `ApplyEligibleForms`, invalid display tokens, and illegal operation parameters.
- Add a temporary parity harness over a synthetic matrix of card types, costs, rules text, spark, amplified text, and Fast state.

**Green**

- Author `data/transfiguration.ron` from current production behavior and presentation.
- Add the missing canonical glossary ownership for `Hastened`.
- Remove Transfiguration-owned pricing, choice limits, form lists, and benefit tuning from economy, sites, and reward-selection catalogs.
- Remove duplicated form names, disclosures, badges, and direct descriptions from Fluent.

**Verify**

- `npm run game-data:rust-test`
- `npm run game-data:compile`
- `npm test -- src/transfiguration/transfiguration-data.test.ts`

**Done when:** every authored fact about a Transfiguration form is reachable from its one record in `transfiguration.ron`.

### Task 6: Replace form-identity logic with typed Transfiguration interpreters

**Bug class:** form-ID switches in logic and components remain a second executable definition of Transfiguration.

**Red**

- Add operation-level tests with synthetic form IDs to prove behavior is selected by operation kind, not known production form identity.
- Add predicate tests for exact boundary cases and composition.
- Add view-model tests proving order, glyph, colors, descriptions, and accessibility semantics come from injected data without asserting their literal text.
- Add deterministic tests for multi-form application order and prevention of recursive self-application.

**Green**

- Add the runtime loader and inject Transfiguration data through Journey content.
- Replace form switches in `transfiguration-logic.ts`, display helpers, controls, adapters, and selection code with catalog lookup plus closed interpreters.
- Preserve existing stable persisted form IDs.
- Remove code-owned form presentation and benefit tables and shrink the migration allowlist.

**Verify**

- `npm test -- src/transfiguration src/cumulus/components/controls/TransfigurationButton.test.tsx src/rules/journey/reward-selection.test.ts`
- Exercise offer, affordability, selection, application, and resulting card display through the normal player workflow.

**Done when:** adding a form using existing predicate and operation kinds needs catalog data and no per-form TypeScript branch.

### Task 7: Move Dreamwell automation prompts onto their card records

**Bug class:** Dreamwell prompt content is keyed independently from the card and automation step that owns it.

**Red**

- Extend synthetic Dreamwell compiler tests for duplicate prompt keys, missing fields, unknown placeholders, and invalid semantic argument types.
- Add battle tests where a synthetic prompt-producing effect emits a `DreamwellPromptRef` and resolves it through injected catalog data.
- Add a legacy fixture proving an old Fluent descriptor remains readable without becoming the new emitted shape.

**Green**

- Add prompt records to the relevant Dreamwell card definitions.
- Change prompt-producing effects to emit card UUID plus stable prompt key and semantic arguments.
- Resolve prompt records at the display boundary.
- Remove migrated Dreamwell messages from `battle-prompts.ftl` and remove their entries from the lifecycle compatibility lookup where compatibility coverage does not require them.

**Verify**

- `npm run game-data:rust-test`
- `npm test -- src/rules/battle/dreamwell-effects-table.test.ts src/rules/journey/lifecycle.test.ts`
- Exercise every prompt kind through the battle automation harness.

**Done when:** prompt copy is found by starting from the Dreamwell card UUID, and new state never emits a prompt Fluent ID.

### Task 8: Centralize resonance presentation

**Bug class:** tide names, icons, colors, and accessibility branches can disagree across runtime and editor surfaces.

**Red**

- Add compiler tests for exact five-ID coverage and invalid presentation tokens.
- Add component tests using synthetic names and colors to prove callers do not title-case IDs or own fallback tables.

**Green**

- Author `data/resonance.ron` with current exact presentation.
- Add a generated loader used by runtime, Cumulus, and editor consumers.
- Replace `tide-spec.ts` authored constants with accessors.
- Consolidate visible and accessible Fluent branches into complete shells where grammar requires Fluent.

**Verify**

- `npm run game-data:compile`
- `npm test -- src/cumulus/components/hud/tide-spec.test.ts`

**Done when:** one resonance record supplies every surface's name, glyph, and color.

### Task 9: Make glossary concepts own rules-symbol metadata

**Bug class:** a rules symbol's icon and accessible label are maintained in independent TypeScript and Fluent tables.

**Red**

- Add glossary compiler tests for duplicate tokens, unsupported glyphs, missing accessible labels, and exact supported-token coverage.
- Add RulesText tests with a synthetic glossary artifact to prove the rendered accessible name follows semantic metadata without asserting literal production copy.

**Green**

- Add `rules_symbol` records to the six owning glossary concepts.
- Expose the metadata in generated glossary runtime data.
- Derive the RulesText symbol registry from that data.
- Remove the six direct Fluent symbol labels and the parallel TypeScript table.

**Verify**

- `npm run game-data:compile`
- `npm test -- src/cumulus/components/rules/RulesText.test.tsx src/data/glossary-data.test.ts`

**Done when:** each supported rules symbol has exactly one glossary owner and RulesText has no authored symbol-label lookup.

### Task 10: Pin gameplay catalogs in co-op configuration and improve reconstruction logs

**Bug class:** peers can interpret persisted stable IDs under different extracted rules, and production logs cannot prove which catalog values were used.

**Red**

- Add room-genesis tests for matching, mismatching, and missing Gamble/Transfiguration fold hashes.
- Add synthetic replay tests proving existing persisted IDs and Gamble rules versions retain their meaning.
- Add logging tests which reconstruct Gamble selection/outcomes, Transfiguration eligibility/effects, and Dreamwell prompts from structured fields.

**Green**

- Add both fold hashes to generated content configuration, room genesis, validation, diagnostics, and test builders.
- Thread catalog identity into the relevant structured log events.
- Ensure logs contain resolved numeric/semantic inputs and never require display-name identity.
- Document the new log fields and compatibility behavior.

**Verify**

- `npm test -- src/coop src/logging src/runtime/content-config.test.ts`

**Done when:** peers cannot silently use different gameplay catalogs and each affected production decision is reconstructable.

### Task 11: Remove migration scaffolding and enforce ownership

**Bug class:** compatibility paths and allowlisted lookup tables become permanent alternate sources.

**Red**

- Set the ownership audit's expected baseline to zero for migrated TypeScript and Fluent families.
- Confirm it fails while any scoped authored table or direct message remains.

**Green**

- Delete temporary production fallbacks, parity-only fixtures, dead message descriptors, unused generated types, and obsolete adapters.
- Keep only explicit persisted-state compatibility code with a synthetic fixture and removal rationale.
- Regenerate localization types and all game-data outputs.

**Verify**

- `npm test -- scripts/data-driven-ui-ownership.test.ts`
- `npm run localization-types`
- `npm run game-data:check`

**Done when:** the zero-baseline audit passes and there is no competing production owner for any of the five areas.

### Task 12: Integrated QA and final review

**Bug class:** individually correct catalogs can still break generation, cooperative configuration, normal player workflows, accessibility, or responsive presentation when integrated.

**Red**

- Before fixes in this task, run the integrated matrix once and record only real failures attributable to the migration.

**Green**

- Repair integration defects at the owning layer and add the smallest regression test for each confirmed defect.
- Run normal workflows for all five Gamble games, Transfiguration offer/application, representative Dreamwell prompts, tide display, and rules-symbol screen-reader output.
- Inspect the captured browser error buffer and objective DOM state. Capture only affected visual states if presentation differs.

**Verify**

- `scripts/regenerate-assets.sh`
- `npm run game-data:parity`
- `npm run review`
- `npm run review:full`

Because this migration crosses compiler schemas, generated assets, gameplay content hashes, reducers, and shared UI infrastructure, the full review is warranted at final cutover.

**Done when:** focused tests, generation checks, normal workflows, accessibility checks, diff-aware review, and full review pass with no unresolved material finding.

## Suggested Commit Boundaries

Each task should land as its own reviewable commit and be pushed immediately. Prefer these dependency-safe boundaries:

1. Ownership audit and migration inventory.
2. Compiler models and manifest registrations.
3. Gamble canonical data extraction.
4. Gamble runtime cutover.
5. Transfiguration canonical data extraction.
6. Transfiguration interpreter cutover.
7. Dreamwell prompt ownership.
8. Resonance catalog.
9. Glossary rules-symbol metadata.
10. Co-op hashes and reconstruction logging.
11. Zero-baseline cleanup.
12. Integrated QA repairs and documentation.

Do not combine schema introduction and removal of the old runtime path in one untested step. During each vertical migration, keep the old and new paths only long enough to run the temporary parity harness, then delete the old production path in the same task.

## Acceptance Criteria

- `gamble.ron` is the only canonical owner of all five Gamble games' rules, tuning, economic values, rules versions, outcomes, and repeated presentation.
- `transfiguration.ron` is the only canonical owner of all nine forms' rules, eligibility, tuning, pricing, selection metadata, visual metadata, and repeated presentation.
- Dreamwell card records own every card-specific automation prompt through stable semantic prompt keys.
- `resonance.ron` owns all five resonances' names, glyphs, colors, and accessibility-name inputs.
- Glossary records own the six supported rules symbols' token, glyph, and accessible label.
- TypeScript contains no per-game, per-form, per-resonance, per-symbol, or per-prompt authored lookup table in scope.
- Remaining Fluent messages are complete grammatical shells or one-off UI strings, not alternate content databases.
- Source-English behavior and presentation are unchanged.
- Persisted identity remains UUID- or stable-ID-based and never name-based.
- Cooperative rooms pin Gamble and Transfiguration gameplay catalog hashes.
- Structured logs can reconstruct affected selections, eligibility decisions, effects, and outcomes.
- Deterministic synthetic tests cover schemas, interpreters, persistence compatibility, and generated-data boundaries without asserting specific UI strings.
- Generated assets, focused tests, `npm run review`, and final `npm run review:full` pass.

## Rollout and Recovery

Land the work in vertical slices, keeping each production surface on exactly one owner after its slice. Generated artifacts are committed with their canonical sources. The content-configuration gate prevents mixed-catalog cooperative sessions.

If a vertical slice fails parity or QA, revert that slice as a unit. Do not restore a permanent dual-read path. Persisted compatibility decoders remain narrowly scoped to previously emitted state and are covered by synthetic fixtures.

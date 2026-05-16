# Dream Journey Effects: Design

Status: approved spec, ready for implementation planning.
Author: brainstorming session, 2026-05-16.
Supersedes nothing. Follow-up to `2026-05-15-dream-journey-port-design.md`,
which landed the generator and read-only UI; this spec wires the chosen
option's mechanical effects into the quest state.

## Goal

When the player clicks Enter Dream on a Dream Journey option (flat manifest)
or branch (decision-tree manifest), the chosen template's mechanical effects
apply to `QuestState` via the existing `QuestMutations`, then the screen
advances or closes.

Player choice (for templates such as "Apply Bronze to a chosen card") is
collected through an inline overlay layered on the journey screen.

The journey module's isolation contract from the port spec is preserved by
introducing a `JourneyMutations` interface inside `src/journeys/` and wiring
it from the adapter layer. The cost/reward template catalog in
`shared/costs.ts` and `shared/rewards.ts` gains an `apply(params, ctx, mut)`
method per template; no other directory under `src/journeys/journey/`,
`src/journeys/content/`, `src/journeys/ui/`, or `src/journeys/util/` imports
`QuestMutations` or `QuestState`.

## Non-goals

- Battle-mode effects that only resolve mid-battle: rendered text-only,
  no-op when picked. Specifically: the four dreamwell-keyed templates
  (`set_starting_dreamwell_positive`, `shuffle_positive_dreamwell_cards`,
  `set_starting_dreamwell_negative`, `shuffle_negative_dreamwell_cards`)
  and `card_cost_reduction_for_X_battles`.
- Card-rules-text rewrites: rendered text-only, no-op when picked.
  Specifically: `make_card_reclaim`, `make_random_cards_reclaim`,
  `change_card_to_become_type`, `modify_random_cards_to_types`,
  `make_random_cards_fast`. The plumbing to mutate a deck card's
  `rulesText` / keywords does not exist.
- Atomicity / rollback if a chained step fails mid-application. Each
  mutation lands as it runs; a thrown apply call surfaces to the screen,
  which logs and closes the site as-is.
- Re-running effects on screen reload. Effects apply exactly once per
  Enter Dream click; the site's `completed: true` flag plus the existing
  `visited` bookkeeping prevent re-entry.

## Architecture

Two new pieces, both inside `src/journeys/`:

```
src/journeys/
├── apply/                              # NEW. Effect-application surface.
│   ├── JourneyMutations.ts             # The interface costs/rewards call.
│   ├── applyOption.ts                  # Walks costs+effects on a JourneyOption.
│   ├── applyBranch.ts                  # Walks costs+effects on a JourneyTreeBranch.
│   ├── chooserPlan.ts                  # Pure: turns an option/branch into 0+ chooser requests.
│   └── payloads.ts                     # Narrow `option.costs[]`/`option.effects[]` envelopes.
├── adapter/
│   ├── journeyMutations.ts             # NEW. Implements JourneyMutations via QuestMutations.
│   └── ...existing files...
├── journey/shared/
│   ├── costs.ts                        # Each Cost gains `apply(params, ctx, mut)`.
│   ├── rewards.ts                      # Each Reward gains `apply(params, ctx, mut)`.
│   └── types.ts                        # Cost<P>/Reward<P> gain the `apply` method.
└── ui/
    ├── JourneyScreen.tsx               # MODIFIED: routes Enter Dream through applyOption/Branch.
    └── chooser/                        # NEW (Wave 2). Inline overlay components.
        ├── ChooserOverlay.tsx
        ├── CardChooser.tsx
        ├── DreamsignChooser.tsx
        └── TransfigurationChooser.tsx
```

### Isolation contract additions

- `src/journeys/apply/` may import from `src/journeys/journey/`,
  `src/journeys/util/`, and define types. It MUST NOT import from
  `src/types/` or `src/state/`.
- `src/journeys/adapter/journeyMutations.ts` is the only file that imports
  both `JourneyMutations` (from `apply/`) and `QuestMutations` (from
  `src/state/`).
- `src/journeys/journey/shared/costs.ts` and `shared/rewards.ts` gain an
  `apply` method that depends only on `JourneyMutations` (defined inside
  `apply/`) and on existing `JourneyContext` reads.
- `src/journeys/ui/JourneyScreen.tsx` calls into `apply/applyOption.ts`
  and `apply/applyBranch.ts`; it receives the `JourneyMutations`
  implementation via a new prop (`mutations: JourneyMutations`).

### Data flow

```
JourneyScreen (player clicks Enter Dream)
    │
    │  resolutions = empty Map<string, ChooserResolution>
    ▼
applyOption(option, ctx, mutations, resolutions)
    │
    │  walks option.costs[] then option.effects[]
    │  each entry: { kind: "shared_*_template", templateId, params, text }
    │  resolves the Cost or Reward via getCost(id) / getReward(id)
    │
    │  IF the template requires a choice AND resolutions has no entry
    │  for this template-instance:
    │     return { needsChoice: ChooserRequest }
    │
    │  ELSE:
    │     template.apply(params, ctx, mutations, resolution?)
    │
    ▼
JourneyMutations (interface, defined inside src/journeys/apply/)
    │
    ▼
adapter/journeyMutations.ts (delegates to QuestMutations)
    │
    ▼
QuestMutations.changeEssence / addBaneCard / transfigureCard / …
    │
    ▼
QuestState (mutation via existing reducers)
```

When `applyOption` returns `{ needsChoice }`, the screen mounts the
appropriate chooser overlay. On confirm, the screen adds the resolution to
the map and re-calls `applyOption`. When the call returns `{ done: true }`,
the screen calls `onClose()`.

The same flow runs for `applyBranch`, with `branch.costs[]` and
`branch.effects[]` in place of the option's.

## JourneyMutations interface

```ts
// src/journeys/apply/JourneyMutations.ts

export interface JourneyMutations {
  // ---- Resources ---------------------------------------------------------
  /** Add `delta` to current essence (negative shrinks). Clamps at 0 and maxEssence. */
  changeEssence(delta: number, source: string): void;

  /** Add `delta` to omens (negative shrinks). Clamps at 0. */
  changeOmens(delta: number, source: string): void;

  /** Set essence to `value`, clamped to [0, maxEssence]. */
  setEssence(value: number, source: string): void;

  /** Add `delta` to maxEssence; current essence clamps to the new max. */
  changeMaxEssence(delta: number, source: string): void;

  // ---- Deck (mechanical card movement; rules-text edits are not in scope) -
  /** Add a card by catalog id to the deck. */
  addCardById(cardId: string, source: string): void;

  /** Add a card by catalog id flagged as a bane card. */
  addBaneCardById(cardId: string, source: string): void;

  /** Remove the deck entry with the given entryId. */
  removeDeckEntry(entryId: string, source: string): void;

  /** Add a duplicate of the deck entry with the given entryId. */
  duplicateDeckEntry(entryId: string, source: string): void;

  /** Apply a transfiguration to the deck entry. Delegates to the existing
   *  transfigureCard mutation, which already handles eligibility, source
   *  logging, and the transfiguration effect-details payload. */
  transfigureDeckEntry(
    entryId: string,
    type: TransfigurationType,
    source: string,
  ): void;

  // ---- Dreamsigns --------------------------------------------------------
  /** Add a Dreamsign. `purgeIndex` resolves the 12-cap purge if needed. */
  addDreamsign(dreamsign: Dreamsign, source: string, purgeIndex?: number): void;

  /** Remove the active Dreamsign at `index`. */
  removeDreamsign(index: number, source: string): void;

  // ---- Banes (cleanup) ---------------------------------------------------
  /** Remove `count` bane cards from the deck (random selection). */
  purgeRandomBaneCards(count: number, source: string): void;

  /** Remove all bane cards from the deck. */
  purgeAllBaneCards(source: string): void;

  // ---- Atlas / route -----------------------------------------------------
  /** Add a site of `siteType` to the dreamscape at `dreamscape` (0 = current).
   *  `placement` is "current" or "next". */
  addSiteToDreamscape(
    placement: "current" | "next",
    siteType: SiteType,
    source: string,
  ): void;

  /** Replace one occurrence of `from` site type with `to` in the current
   *  dreamscape. */
  replaceSiteType(from: SiteType, to: SiteType, source: string): void;

  /** Remove all sites of `siteType` from the next `dreamscapes` dreamscapes. */
  removeSiteTypeFromNextDreamscapes(
    siteType: SiteType,
    dreamscapes: number,
    source: string,
  ): void;

  // ---- Battle-window counters -------------------------------------------
  /** Stack a "next N battles, essence reward -X" or "-X%" modifier. */
  pushBattleRewardModifier(
    kind: "flat" | "percent",
    amount: number,
    battles: number,
    source: string,
  ): void;

  /** Stack a "gain N <bane> for the next M battles" modifier. The bane is
   *  added to the deck immediately; the modifier records when to remove it. */
  pushTemporaryBaneGrant(
    baneName: string,
    count: number,
    battles: number,
    source: string,
  ): void;

  // ---- Shop modifiers ----------------------------------------------------
  /** Grant `count` free shop rerolls (consumed at shops; ungrouped). */
  grantFreeShopRerolls(count: number, source: string): void;

  /** Add `percent` to the permanent shop essence discount. */
  applyShopEssenceDiscount(percent: number, source: string): void;

  /** Push `count` one-use "−1 omen" tokens onto the upcoming-shop queue. */
  grantShopOmenDiscounts(count: number, source: string): void;

  // ---- Site boost --------------------------------------------------------
  /** Boost appearance chance of `siteType` by `percent` for `dreamscapes`. */
  boostSiteAppearance(
    siteType: SiteType,
    percent: number,
    dreamscapes: number,
    source: string,
  ): void;
}
```

Wave 1 implements every method in this interface. Wave 2 adds the chooser
glue but does not extend the interface (choosers compute a resolution that
gets fed into existing apply methods, e.g. `duplicateDeckEntry(entryId)`).

## QuestState extensions

Two new fields on `QuestState` to support the battle-window and
shop-modifier mutations:

```ts
interface QuestState {
  // ...existing fields...

  /** Modifiers consumed by future battles. Each modifier has a remaining
   *  count of battles; the battle resolver decrements on each completed
   *  battle and drops entries at 0. */
  readonly battleModifiers: readonly BattleModifier[];

  /** Modifiers consumed at shop sites. Free-reroll grants stack additively;
   *  the omen-discount queue is FIFO; the essence discount is a permanent
   *  additive percentage applied to every shop purchase. */
  readonly shopModifiers: {
    readonly freeRerolls: number;
    readonly upcomingOmenDiscounts: number;
    readonly essenceDiscountPercent: number;
  };

  /** Modifiers consumed by future dreamscapes. Each modifier decrements
   *  when a new dreamscape opens. */
  readonly dreamscapeModifiers: readonly DreamscapeModifier[];
}

type BattleModifier =
  | {
      kind: "reward_reduction_flat";
      amount: number;
      battlesRemaining: number;
      source: string;
    }
  | {
      kind: "reward_reduction_percent";
      percent: number;
      battlesRemaining: number;
      source: string;
    }
  | {
      kind: "temporary_bane_grant";
      baneName: string;
      count: number;
      battlesRemaining: number;
      // The deck entries added when this modifier was pushed; removed when
      // battlesRemaining hits 0.
      addedEntryIds: readonly string[];
      source: string;
    };

type DreamscapeModifier =
  | {
      kind: "remove_shop_sites";
      dreamscapesRemaining: number;
      source: string;
    }
  | {
      kind: "remove_dreamsign_sites";
      dreamscapesRemaining: number;
      source: string;
    }
  | {
      kind: "boost_site_appearance";
      siteType: SiteType;
      dreamscapesRemaining: number;
      source: string;
    };
```

Reducers decrement counters at the appropriate boundaries:

- `BattleModifier.battlesRemaining` decrements when `incrementCompletionLevel`
  fires for a battle site. At 0 the modifier drops; `temporary_bane_grant`
  additionally removes its `addedEntryIds`.
- `DreamscapeModifier.dreamscapesRemaining` decrements when
  `setCurrentDreamscape` advances to a new dreamscape id.
- `shopModifiers.freeRerolls` decrements inside `rerollShop` when > 0,
  skipping the omen cost.

Battle-resolver consumption (reading `battleModifiers` to actually reduce
essence rewards) is the responsibility of the battle code that lands
separately; this spec wires the *push* and the *decay*, not the read. The
battle code will read `state.battleModifiers` for the active modifiers when
that hookup lands.

Site-spawn consumption (reading `dreamscapeModifiers` to suppress shop or
dreamsign sites, or to weight `siteType` appearance) is similarly the
responsibility of atlas-generation code that already produces the
dreamscape. This spec leaves the consumer hookup as a follow-up TODO with
the field in place and decay wired.

## `option.costs` and `option.effects` payload contract

The manifest types declare these as `unknown[]`. At the shape-fill layer
they are populated with envelopes:

```ts
type SharedCostPayload = {
  kind: "shared_cost_template";
  templateId: string;
  params: TemplateParams;
  text: string;
  convertedEssence: number;
};

type SharedRewardPayload = {
  kind: "shared_reward_template";
  templateId: string;
  params: TemplateParams;
  text: string;
  convertedEssence: number;
};
```

`src/journeys/apply/payloads.ts` narrows the manifest's `unknown[]` to these
shapes via runtime guards. Any entry that does not match a known kind is
skipped with a warning logged via `console.warn`; the apply pass continues
with the next entry. The guard's `kind` check leaves room for future
non-shared-template payload kinds (e.g. operation-based) without breaking
the apply loop.

## Cost / Reward template `apply` contract

`shared/types.ts` extends `Cost<P>` and `Reward<P>`:

```ts
export interface Cost<P = TemplateParams> {
  // ...existing fields (id, weight, rollParams, cec, viable, locked, render)...
  apply(
    params: P,
    ctx: JourneyContext,
    mut: JourneyMutations,
    resolution?: ChooserResolution,
  ): void;
}

export interface Reward<P = TemplateParams> {
  // ...existing fields (id, weight, rollParams, cec, viable, render)...
  apply(
    params: P,
    ctx: JourneyContext,
    mut: JourneyMutations,
    resolution?: ChooserResolution,
  ): void;

  /** Optional: which choice (if any) this template needs collected before
   *  apply can run. Returning undefined means no choice needed. */
  choosePlan?(params: P, ctx: JourneyContext): ChooserRequest | undefined;
}
```

The same `choosePlan?` method is added to `Cost<P>` for the
`purge_chosen_predicate_card`, `purge_chosen_dreamsign`, and
`draw_X_purge_chosen` cost templates.

`ChooserResolution` is a discriminated union (see "Chooser shapes" below).

## Template-by-template plan

Wave 1 = no-choice templates. Wave 2 = chosen-target templates plus the
overlay infrastructure. "No-op" = render text shows, apply is a no-op
(documented in the template comment).

### Costs (`shared/costs.ts`)

| Template id                                       | Apply                                                                                          | Wave |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---- |
| `pay_essence`                                     | `mut.changeEssence(-p.x, "dream_journey:pay_essence")`                                         | 1    |
| `pay_omens`                                       | `mut.changeOmens(-p.x, "dream_journey:pay_omens")`                                             | 1    |
| `pay_max_essence`                                 | `mut.changeMaxEssence(-maxEssence(ctx), "…")`                                                  | 1    |
| `pay_essence_random_range`                        | Roll within [min,max] via labeled RNG, then `changeEssence(-roll)`                             | 1    |
| `pay_percent_essence`                             | `changeEssence(-floor(essence * p.percent/100), "…")`                                          | 1    |
| `pay_all_remaining_essence`                       | `setEssence(0, "…")`                                                                           | 1    |
| `battle_reward_reduction_flat`                    | `pushBattleRewardModifier("flat", p.amount, p.battles, "…")`                                   | 1    |
| `battle_reward_reduction_percent`                 | `pushBattleRewardModifier("percent", p.percent, p.battles, "…")`                               | 1    |
| `purge_named_card`                                | Resolve named card → first matching deck entry → `removeDeckEntry`                             | 1    |
| `purge_random_predicate_card`                     | Roll a random matching deck entry → `removeDeckEntry`                                          | 1    |
| `purge_chosen_predicate_card`                     | `choosePlan` → CardChooser over deck entries matching predicate → `removeDeckEntry`            | 2    |
| `gain_random_cards_from_pool`                     | Roll p.count card ids from catalog → `addCardById` each                                        | 1    |
| `transform_card_to_random_pool`                   | Resolve named deck card → `removeDeckEntry` + roll one pool card → `addCardById`               | 1    |
| `purge_all_duplicate_cards`                       | Walk deck, for each duplicate stack keep one entry, `removeDeckEntry` the rest                 | 1    |
| `purge_named_dreamsign`                           | Find active Dreamsign by name → `removeDreamsign(index)`                                       | 1    |
| `purge_random_dreamsign`                          | Roll a random active Dreamsign → `removeDreamsign(index)`                                      | 1    |
| `purge_chosen_dreamsign`                          | `choosePlan` → DreamsignChooser → `removeDreamsign(index)`                                     | 2    |
| `transform_dreamsign_to_random`                   | `choosePlan` → DreamsignChooser → `removeDreamsign` + roll new pool dreamsign → `addDreamsign` | 2    |
| `gain_random_banes`                               | Roll p.count bane names from `BANE_NAMES`, each → `addBaneCardById` for that bane's card       | 1    |
| `gain_named_banes`                                | For p.count iterations: `addBaneCardById` for the named bane's card                            | 1    |
| `gain_named_banes_for_X_battles`                  | `pushTemporaryBaneGrant(p.baneName, p.count, p.battles, "…")`                                  | 1    |
| `gain_additional_starters`                        | Roll p.count starter cards from catalog → `addCardById` each                                   | 1    |
| `set_starting_dreamwell_negative`                 | **No-op** (dreamwell, deferred).                                                               | 1    |
| `shuffle_negative_dreamwell_cards`                | **No-op** (dreamwell, deferred).                                                               | 1    |
| `remove_transfiguration_from_card`                | Resolve named deck card → if has transfiguration, `transfigureDeckEntry(entryId, null, "…")`   | 1    |
| `remove_transfigurations_from_random_predicate`   | Roll p.count random matching deck entries → `transfigureDeckEntry(entryId, null, "…")` each   | 1    |
| `draw_X_purge_chosen`                             | `choosePlan` → CardChooser over a random p.drawCount-sized subset of deck → `removeDeckEntry`  | 2    |
| `remove_shop_sites_from_next_dreamscapes`         | `removeSiteTypeFromNextDreamscapes("Shop", p.dreamscapes, "…")`                                | 1    |
| `remove_dreamsign_sites_from_next_dreamscapes`    | `removeSiteTypeFromNextDreamscapes("DreamsignOffering", p.dreamscapes, "…")`                   | 1    |
| `lose_max_essence`                                | `mut.changeMaxEssence(-p.amount, "…")`                                                         | 1    |
| `meta_pay_2_costs`                                | Recurse: apply both sub-costs in order. The meta's wave is determined by its sub-costs: if both sub-costs resolve to Wave-1 apply methods, the meta runs in Wave 1; if either sub-cost needs a chooser, the meta defers to Wave 2 along with the chooser machinery. | 1+    |

Notes:
- `transfigureDeckEntry` is extended to accept `type: null` to mean "remove
  the current transfiguration". The underlying `transfigureCard` mutation
  already gates on eligibility; the null variant is a thin reducer
  addition that clears the entry's `transfiguration` field and adds a
  `card_transfigured` log event with `transfiguration: null`.

### Rewards (`shared/rewards.ts`)

| Template id                                                   | Apply                                                                                                       | Wave |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---- |
| `gain_essence`                                                | `mut.changeEssence(p.x, "…")`                                                                              | 1    |
| `gain_omens`                                                  | `mut.changeOmens(p.x, "…")`                                                                                | 1    |
| `set_essence_to_percent_of_max`                               | `mut.setEssence(floor(maxEssence(ctx) * p.percent/100), "…")`                                              | 1    |
| `gain_essence_random_range`                                   | Roll [min,max] via labeled RNG → `changeEssence(+roll)`                                                    | 1    |
| `gain_essence_to_max`                                         | `setEssence(maxEssence(ctx), "…")`                                                                         | 1    |
| `gain_random_predicate_cards`                                 | Roll p.count cards from predicate-matching catalog → `addCardById` each                                    | 1    |
| `draft_predicate_cards_from_4`                                | Wave 2: CardChooser over 4 rolled candidates, pick 1 → `addCardById`                                       | 2    |
| `take_any_from_predicate_choices`                             | Wave 2: CardChooser over p.choices candidates, pick any subset → `addCardById` each                        | 2    |
| `gain_named_card`                                             | `addCardById(catalog id for p.name, "…")`                                                                  | 1    |
| `apply_chosen_transfiguration_to_chosen_card`                 | Wave 2: TransfigurationChooser then CardChooser → `transfigureDeckEntry`                                   | 2    |
| `apply_named_transfiguration_to_chosen_predicate_cards`       | Wave 2: CardChooser p.count entries → `transfigureDeckEntry(entryId, p.transfiguration, "…")` each         | 2    |
| `apply_named_transfiguration_to_card_name`                    | Resolve named card → first matching entry → `transfigureDeckEntry`                                         | 1    |
| `apply_named_transfiguration_to_random_predicate_cards`       | Roll p.count matching entries → `transfigureDeckEntry` each                                                | 1    |
| `apply_named_transfiguration_to_all_predicate_cards`          | Walk deck, every matching entry → `transfigureDeckEntry`                                                   | 1    |
| `transfigure_random_starters`                                 | Roll p.count starter entries → `transfigureDeckEntry` each                                                 | 1    |
| `transfigure_all_starters`                                    | Walk deck for starter entries → `transfigureDeckEntry` each                                                | 1    |
| `transfigure_chosen_starters`                                 | Wave 2: CardChooser over starter entries (p.count) → `transfigureDeckEntry` each                           | 2    |
| `change_card_to_become_type`                                  | **No-op (visual)** — card-rules-text rewrite.                                                              | 1    |
| `modify_random_cards_to_types`                                | **No-op (visual)** — card-rules-text rewrite.                                                              | 1    |
| `make_random_cards_fast`                                      | **No-op (visual)** — card-rules-text rewrite.                                                              | 1    |
| `make_card_reclaim`                                           | **No-op (visual)** — card-rules-text rewrite.                                                              | 1    |
| `make_random_cards_reclaim`                                   | **No-op (visual)** — card-rules-text rewrite.                                                              | 1    |
| `purge_chosen_predicate_cards`                                | Wave 2: CardChooser over predicate-matching deck entries (p.count) → `removeDeckEntry` each                | 2    |
| `purge_chosen_predicate_with_replacement`                     | Wave 2: CardChooser, then roll replacement → `removeDeckEntry` + `addCardById`                             | 2    |
| `purge_named_starter`                                         | Find first deck entry whose catalog name = p.name AND rarity = Starter → `removeDeckEntry`                 | 1    |
| `purge_random_starter`                                        | Roll random starter entry → `removeDeckEntry`                                                              | 1    |
| `purge_random_starter_with_predicate_replacement`             | Roll random starter entry → `removeDeckEntry` + roll predicate-matching card → `addCardById`               | 1    |
| `transform_starter_into_named_card`                           | Find named starter entry → `removeDeckEntry` + `addCardById(p.target)`                                     | 1    |
| `transform_card_in_deck_into_named`                           | Find named deck entry → `removeDeckEntry` + `addCardById(p.target)`                                        | 1    |
| `transform_chosen_predicate_into_named`                       | Wave 2: CardChooser predicate-matching → `removeDeckEntry` + `addCardById(p.target)`                       | 2    |
| `duplicate_named_card_X`                                      | Find named deck entry → `duplicateDeckEntry` p.count times                                                 | 1    |
| `duplicate_chosen_cards`                                      | Wave 2: CardChooser deck-wide (p.count) → `duplicateDeckEntry` each                                        | 2    |
| `duplicate_random_predicate`                                  | Roll p.count predicate-matching deck entries → `duplicateDeckEntry` each                                   | 1    |
| `draw_X_and_duplicate_chosen`                                 | Wave 2: CardChooser over a random p.drawCount-sized subset of deck → `duplicateDeckEntry` chosen entries   | 2    |
| `purge_X_banes`                                               | `purgeRandomBaneCards(p.count, "…")`                                                                       | 1    |
| `purge_all_banes`                                             | `purgeAllBaneCards("…")`                                                                                   | 1    |
| `gain_random_dreamsign`                                       | Roll dreamsign from `dreamsignPoolIds` → `addDreamsign(dreamsign, "…")`                                    | 1    |
| `gain_named_dreamsign`                                        | Look up dreamsign by name → `addDreamsign(dreamsign, "…")`                                                 | 1    |
| `choose_1_of_X_dreamsigns`                                    | Wave 2: DreamsignChooser over p.choices candidates → `addDreamsign`                                        | 2    |
| `gain_copy_of_random_dreamsign`                               | Roll a copy of a random active dreamsign → `addDreamsign(copy, "…")`                                       | 1    |
| `gain_copy_of_chosen_dreamsign`                               | Wave 2: DreamsignChooser over active dreamsigns → `addDreamsign(copy, "…")`                                | 2    |
| `add_site_to_dreamscape`                                      | `addSiteToDreamscape("current", p.siteType, "…")`                                                          | 1    |
| `add_site_to_next_dreamscape`                                 | `addSiteToDreamscape("next", p.siteType, "…")`                                                             | 1    |
| `set_starting_dreamwell_positive`                             | **No-op** (dreamwell, deferred).                                                                            | 1    |
| `shuffle_positive_dreamwell_cards`                            | **No-op** (dreamwell, deferred).                                                                            | 1    |
| `next_X_shop_rerolls_free`                                    | `grantFreeShopRerolls(p.count, "…")`                                                                       | 1    |
| `increase_max_essence`                                        | `changeMaxEssence(+p.amount, "…")`                                                                         | 1    |
| `draft_2_predicate_cards_from_4`                              | Wave 2: CardChooser over 4 rolled candidates, pick 2 → `addCardById` each                                  | 2    |
| `draft_predicate_card_with_copies`                            | Wave 2: CardChooser over rolled candidates → `addCardById` p.copies times                                  | 2    |
| `draft_predicate_card_with_transfiguration`                   | Wave 2: CardChooser, then auto-apply named transfiguration → `addCardById` + `transfigureDeckEntry`        | 2    |
| `opening_hand_grant_for_X_battles`                            | **No-op (visual)** — temporary card; battle-mode only.                                                      | 1    |
| `temporary_card_copy_for_X_battles`                           | **No-op (visual)** — temporary card; battle-mode only.                                                      | 1    |
| `card_cost_reduction_for_X_battles`                           | **No-op (visual)** — card-rules-text rewrite.                                                               | 1    |
| `replace_starter_via_draft`                                   | Wave 2: roll a random starter to drop, then CardChooser to add → `removeDeckEntry` + `addCardById`         | 2    |
| `purge_chosen_starters`                                       | Wave 2: CardChooser over starter entries → `removeDeckEntry` each                                          | 2    |
| `purge_all_starters`                                          | Walk deck for starter entries → `removeDeckEntry` each                                                     | 1    |
| `apply_random_transfigurations_to_random_cards`               | Roll p.count entries + p.count transfigurations → pair up → `transfigureDeckEntry` each                    | 1    |
| `transform_dreamsign_to_named`                                | Wave 2: DreamsignChooser → `removeDreamsign` + look up named → `addDreamsign`                              | 2    |
| `temporary_dreamsign_for_X_battles`                           | **No-op (visual)** — temporary dreamsign; battle-mode only.                                                 | 1    |
| `replace_site_type`                                           | `replaceSiteType(p.fromType, p.toType, "…")`                                                               | 1    |
| `shop_essence_discount`                                       | `mut.applyShopEssenceDiscount(p.percent, "…")` — adds to `shopModifiers.essenceDiscountPercent` (permanent additive). | 1    |
| `shop_omen_discount`                                          | `mut.grantShopOmenDiscounts(p.count, "…")` — pushes p.count one-use −1-omen tokens into `shopModifiers.upcomingOmenDiscounts`. | 1    |
| `boost_site_appearance_chance`                                | `boostSiteAppearance(p.siteType, p.percent, p.dreamscapes ?? 3, "…")`                                      | 1    |
| `meta_gain_2_rewards`                                         | Recurse: apply both sub-rewards in order. The meta's wave is determined by its sub-rewards (same rule as `meta_pay_2_costs`). | 1+    |

Notes:
- `shop_essence_discount` / `shop_omen_discount`: the spec records that
  these push a shop-side modifier into a new field on `shopModifiers` (e.g.
  `essenceDiscountPercent`, `omenDiscountPercent`). The exact shop reducer
  hookup is left to implementation; the apply call records intent.
- Where a template needs "find catalog id for named card", the adapter
  exposes `lookupCardIdByName(name): string | undefined`. Hits in unit
  tests are pre-seeded; misses log a warning and the template skips.

## Chooser shapes (Wave 2)

```ts
// src/journeys/apply/chooserPlan.ts

export type ChooserRequest =
  | {
      kind: "card";
      requestId: string;            // stable per (option#, templateId, slot)
      poolKind: "deck" | "catalog" | "rolled";
      // For poolKind="deck": filter entries by these criteria.
      deckFilter?: {
        predicateId?: string;
        starterOnly?: boolean;
      };
      // For poolKind="rolled": pre-rolled card ids the chooser shows.
      rolledCardIds?: readonly string[];
      minPicks: number;
      maxPicks: number;
      title: string;                // shown in the overlay header
    }
  | {
      kind: "dreamsign";
      requestId: string;
      poolKind: "active" | "pool" | "rolled";
      rolledDreamsignIds?: readonly string[];
      minPicks: number;
      maxPicks: number;
      title: string;
    }
  | {
      kind: "transfiguration";
      requestId: string;
      // Filter by which transfigurations have at least one eligible deck
      // entry; computed by the planner.
      eligibleTransfigurations: readonly TransfigurationType[];
      title: string;
    };

export type ChooserResolution =
  | { kind: "card"; entryIds: readonly string[]; cardIds?: readonly string[] }
  | { kind: "dreamsign"; indices: readonly number[]; dreamsignIds?: readonly string[] }
  | { kind: "transfiguration"; type: TransfigurationType };

export type ApplyResult =
  | { done: true }
  | { done: false; needsChoice: ChooserRequest };
```

The `requestId` is deterministic: `${optionNumberOrBranchId}:${templateId}:${slot}`.
Stable identifiers let the screen reuse a resolution across re-entries.

### Overlay UX

- Mounted as a child of `JourneyScreen` (the screen still owns the chrome).
- Background is a semi-transparent dim; the journey circles remain visible
  beneath.
- Header: `title` from the request.
- Body:
  - Card chooser: scrollable grid of card tiles, with rules text on hover.
    Selected tiles get a purple border. Confirm button disabled until
    pick count is in `[minPicks, maxPicks]`.
  - Dreamsign chooser: vertical list of dreamsign rows with description.
  - Transfiguration chooser: 8 colored tiles (Bronze, Viridian, Golden,
    Scarlet, Azure, Magenta, Rose, Prismatic), each grayed out if not in
    `eligibleTransfigurations`.
- Footer: Cancel (left), Confirm (right). Cancel returns to the journey
  screen without applying any effects (the journey option is not
  committed; the player may pick a different option). Confirm passes the
  resolution back to `applyOption`.

### Cancel semantics

When the player cancels a chooser:

1. The screen drops the resolution map entirely.
2. The chooser overlay closes.
3. The journey screen remains, no mutations have been applied (apply
   commits inside `applyOption` only after every chooser is resolved).
4. The player may pick the same or a different option.

This means `applyOption` MUST batch all mutations: it collects every
needed `ChooserRequest` *first*, then runs every `template.apply` call.
Wave 1 templates have no choosers so they apply directly; Wave 2 adds the
two-phase pass.

#### Two-phase apply

Phase 1 (`planOption`): walk every cost and effect, calling
`template.choosePlan(params, ctx)` where present. If any request is missing
from the resolution map, return `{ done: false, needsChoice: nextMissing }`.

Phase 2 (`commitOption`): walk every cost and effect, calling
`template.apply(params, ctx, mut, resolution)`. The resolution map is now
guaranteed complete. Mutations run in order: costs first, then effects.

`planOption` and `commitOption` are pure (no mutation side-effects in
`planOption`; only `commitOption` calls `mut.*`).

## Decision-tree timing

On Enter Dream against a tree branch:

1. `applyBranch(branch, ctx, mutations, resolutions)` runs the same
   two-phase apply against `branch.costs` and `branch.effects`.
2. If `applyBranch` returns `needsChoice`, the screen mounts the overlay.
   On confirm, re-call.
3. On `{ done: true }`, the screen calls `advanceTree`.
4. If the next node is a terminal, `applyTerminal(terminal, ctx, mut, _)`
   runs against `terminal.costs` and `terminal.effects`, then `onClose()`.
5. Otherwise the screen updates `currentNodeId`.

Effects apply per branch as the player advances, not at the terminal.
This matches the wording of branches like "Risk it: lose 25 essence to
reveal" — the cost is felt at the click, not at the end of the run.

The terminal also applies its own operations (the manifest stores them on
`terminal.costs` / `terminal.effects`). Terminals usually carry summary
text and no additional operations, but the path is wired so a terminal
that *does* carry rewards (e.g. an escalating-reward-chain payout) lands
its effects too.

## Locking re-check at apply time

Templates set `option.locked = true` at generation time when a cost is
unaffordable. The UI disables Enter Dream for locked options. But quest
state can change between generation and clicking (a parallel mutation —
unlikely in the prototype, but defensive):

- `applyOption` re-runs `cost.locked(params, ctx)` for every cost before
  calling `commitOption`.
- If any cost is now locked, `applyOption` returns
  `{ done: true }` without applying anything and the screen logs
  `dream_journey_locked_at_apply` with the templateId.

This makes apply idempotent against generation drift without needing a
separate "is this still affordable" check at the UI layer.

## JourneyScreen wiring

The screen gains one new prop:

```ts
export interface JourneyScreenProps {
  readonly context: JourneyContext;
  readonly onClose: () => void;
  readonly mutations: JourneyMutations;     // NEW
  readonly extensionMap?: ExtensionMap;
}
```

The dreamscape site router passes `mutations` from the new adapter helper.

State additions inside `JourneyScreen`:

```ts
const [resolutions, setResolutions] = useState<ChooserResolutionMap>(
  () => new Map(),
);
const [pendingChooser, setPendingChooser] = useState<ChooserRequest | null>(
  null,
);
```

On Enter Dream (flat option path):

```ts
const result = applyOption(option, context, mutations, resolutions);
if (result.done) {
  onClose();
} else {
  setPendingChooser(result.needsChoice);
}
```

On chooser confirm:

```ts
setResolutions((prev) => new Map(prev).set(request.requestId, resolution));
setPendingChooser(null);
// useEffect that watches resolutions re-fires applyOption against the
// last-clicked option, OR the screen calls applyOption immediately in the
// chooser confirm handler. Implementation pick is in the plan.
```

On chooser cancel:

```ts
setResolutions(new Map());
setPendingChooser(null);
// The screen stays mounted; the player can re-click Enter Dream.
```

## Logging

Add four new log events:

- `dream_journey_applied`:
  `{ siteId, journeyId, shapeId, optionNumber?, branchId?, templateIds }`
  — fired once per Enter Dream click after `commitOption` completes
  successfully.
- `dream_journey_skipped_visual`:
  `{ siteId, journeyId, templateId, reason: "visual" | "battle_window" | "dreamwell" }`
  — fired per no-op template, for the QA visibility checklist.
- `dream_journey_chooser_cancelled`:
  `{ siteId, journeyId, requestId }`
  — fired when the player cancels a chooser.
- `dream_journey_locked_at_apply`:
  `{ siteId, journeyId, templateId }`
  — defensive; fired when apply-time locking re-check catches a drift.

The existing `site_entered` / `site_completed` events continue to fire
from `JourneyScreen` mount and `onClose` respectively.

## Testing strategy

Hard rules from the port spec apply: under 10 seconds per test preferred,
30-second cap, no full content-bundle loads, hand-built fixtures.

### Wave 1 tests

1. **Template apply units** at
   `src/journeys/journey/shared/costs.apply.test.ts` and
   `shared/rewards.apply.test.ts`. One test per template. Each builds a
   minimal `JourneyContext` plus a stub `JourneyMutations` that records
   calls, runs `template.apply(params, ctx, mut)`, and asserts the
   recorded call list. Target: <50 ms per test.
2. **Two-phase apply** at `src/journeys/apply/applyOption.test.ts`. Cases:
   - Single cost + single reward: both apply in order.
   - Locked cost at apply time: returns done, no mutations.
   - Skipped no-op template: emits the `_skipped_visual` log, continues.
   - Compound cost (`meta_pay_2_costs`): both sub-costs apply.
3. **Tree apply** at `applyBranch.test.ts`. Same shape as `applyOption`.
4. **Adapter wiring** at `adapter/journeyMutations.test.ts`. Stubs
   `QuestMutations`, calls each `JourneyMutations` method, asserts the
   correct delegation. Includes the `null` transfiguration variant.
5. **QuestState reducer extensions** at
   `src/state/quest-context.test.tsx`. Cases:
   - `pushBattleRewardModifier` adds an entry; `incrementCompletionLevel`
     for a battle decrements; at 0 the entry drops.
   - `pushTemporaryBaneGrant` adds the bane card AND a modifier; at 0
     remaining battles the bane card is removed.
   - `addSiteToDreamscape("current", "Shop", …)` mutates the atlas; the
     new site is present and visit-tracked correctly.
   - `replaceSiteType` swaps a site in the current dreamscape.
   - `removeSiteTypeFromNextDreamscapes` adds a dreamscape-scoped modifier
     and decrements correctly on `setCurrentDreamscape`.
   - `grantFreeShopRerolls` adds to `shopModifiers.freeRerolls`;
     `rerollShop` consumes one and skips the omen cost.

### Wave 2 tests

6. **Chooser plans** at `apply/chooserPlan.test.ts`. Per chosen-target
   template: assert `choosePlan` returns the expected `ChooserRequest`
   shape and that a resolution drives apply correctly.
7. **Chooser overlay UI** at
   `src/journeys/ui/chooser/ChooserOverlay.test.tsx`. Cases:
   - Card chooser renders pool, enforces minPicks/maxPicks, confirm
     resolves.
   - Dreamsign chooser renders active dreamsigns and resolves on confirm.
   - Transfiguration chooser disables ineligible tiles.
   - Cancel clears resolutions and closes overlay without mutating.
8. **JourneyScreen apply integration** at
   `src/journeys/ui/JourneyScreen.test.tsx`. New cases:
   - Enter Dream on a Wave-1 option: calls `mutations.*` once and
     `onClose`.
   - Enter Dream on a Wave-2 option: mounts overlay, confirm calls
     `mutations.*` and `onClose`.
   - Cancel from overlay: no `mutations.*` calls, screen stays mounted.
   - Tree branch with cost: branch apply runs, screen advances to next
     node.

### Deleted tests

None. The port spec's tests still apply unchanged.

## Migration / rollout

### Wave 1 (effects-first)

Lands inside one worktree commit:

- `src/journeys/apply/JourneyMutations.ts`, `applyOption.ts`,
  `applyBranch.ts`, `payloads.ts`.
- `src/journeys/adapter/journeyMutations.ts`.
- `apply` method added to every Cost and Reward template.
- `mutations` prop added to `JourneyScreen`; dreamscape site router wires
  the adapter helper.
- `QuestState.battleModifiers`, `shopModifiers`, `dreamscapeModifiers`
  fields plus reducer hookups for push and decay.
- `JourneyMutations` methods 1–17 (everything except chooser).
- All Wave-1 template apply implementations.
- All Wave-1 tests.

### Wave 2 (choosers)

Lands as a second worktree commit:

- `src/journeys/apply/chooserPlan.ts`.
- `choosePlan` method added to Wave-2 templates.
- Two-phase apply (planOption / commitOption split) wired into
  `applyOption` and `applyBranch`.
- `src/journeys/ui/chooser/` directory and the four overlay components.
- `pendingChooser` and `resolutions` state added to `JourneyScreen`.
- Wave-2 template apply implementations.
- All Wave-2 tests.

### Worktree workflow

Per user direction, all work happens on a dedicated git worktree; nothing
pushes to master.

- The worktree lives at
  `/Users/dthurn/quest_prototype/.claude/worktrees/dream-journey-effects`
  on branch `worktree-dream-journey-effects`, created via the
  super-using-git-worktrees skill (which uses the harness's native
  `EnterWorktree` tool — the harness prefixes the supplied name with
  `worktree-`).
- All commits land on `worktree-dream-journey-effects`.
- Wave-1 commit message: `Apply Dream Journey effects (Wave 1: no-choice
  templates).`
- Wave-2 commit message: `Apply Dream Journey effects (Wave 2: chooser
  overlay + chosen-target templates).`
- Per the user's direction, the worktree branch is not pushed to the
  remote during implementation; the user decides at completion whether
  to push, merge, rebase, or close.

## Manual QA (run from the worktree)

After Wave 1:

- Open a Dream Journey site, pick an option with `gain_essence`. Confirm
  the resource bar updates.
- Pick an option with `gain_random_predicate_cards`. Confirm a card
  appears in the deck.
- Pick an option with `purge_X_banes` (start from a state with banes).
  Confirm banes are removed.
- Pick an option with `add_site_to_next_dreamscape`. Confirm the next
  dreamscape has the added site.
- Pick `battle_reward_reduction_flat` and trigger a battle. Confirm the
  modifier is recorded on `state.battleModifiers` (battle-side reading is
  out of scope; the modifier presence is the wave-1 deliverable).
- Pick a no-op template (`make_card_reclaim`). Confirm the journey
  closes, the `dream_journey_skipped_visual` log fires, no deck changes.
- Trigger a `push_your_luck` decision tree. Confirm per-branch costs
  apply as the player advances.

After Wave 2:

- Pick `apply_chosen_transfiguration_to_chosen_card`. Confirm the
  transfiguration chooser opens, then the card chooser, then the
  transfiguration applies.
- Pick `draft_predicate_cards_from_4`. Confirm the 4 candidates render
  and the picked one is added to the deck.
- Cancel a chooser mid-flow. Confirm no state changes; the journey
  screen remains.
- Pick `purge_chosen_predicate_cards`. Confirm the chooser enforces the
  count limit.

## Open extension points (deferred)

- Reading `battleModifiers` from the battle resolver to actually apply
  reward reductions and tick down battle counters during a battle run.
- Reading `dreamscapeModifiers` from atlas generation to suppress
  shop/dreamsign sites or weight site appearance.
- Card-rules-text rewrites (reclaim, type changes, etc.) when the deck
  card text-mutation system lands.
- Dreamwell card lists; the four dreamwell-keyed templates will then
  promote from no-op to real apply via the same `JourneyMutations`
  interface.
- Operation-based generic apply (the fallback path for shapes that emit
  richer `operations[]` beyond the shared-template envelope).

# Dream Journey Debug Action Audit

This document audits every effect a Dream Journey site can resolve to and
proposes the right-click debug actions needed for a tester to apply each
effect by hand. Effect source: `src/journeys/journey/shared/costs.ts`
(31 cost templates) and `src/journeys/journey/shared/rewards.ts` (64 reward
templates), plus the meta sub-template machinery in both files.

The proposal assumes the existing right-click context-menu pattern used by
the battle surface (`src/battle/components/BattleContextMenu.tsx`) is reused
for every quest-surface menu listed below. All debug actions are manual:
the tester walks through the same physical state change the player would
see, so any chain effects (e.g. a cost that also adds a bane) decompose
into the individual primitive actions.

---

## Phase 1 — Catalog Of Possible Effects

### Vocabularies

The templates draw their named-value parameters from these closed sets;
typeahead pickers should source their suggestions here.

- **Bane names** (`BANE_NAMES`): Nightmare, Despair, Oblivion, Betrayal,
  Envy, Doubt, Silence, Paranoia, Burden, Paralysis, Lethargy.
- **Transfigurations** (`JOURNEY_TRANSFIGURATIONS`): Viridian, Golden,
  Scarlet, Magenta, Azure, Bronze, Rose, Prismatic.
- **Site types** (`JOURNEY_REWARDABLE_SITE_TYPES`): Essence, Shop,
  Specialty Shop, Purge, Transfiguration, Dreamsign Offering,
  Dreamsign Draft, Duplication.
- **Replaceable site types** (`JOURNEY_REPLACEABLE_SITE_TYPES`): all of
  the above plus Dream Journey.
- **Card-type predicates** used by `change_card_to_become_type` and
  `modify_random_cards_to_types`: Warriors, Survivors, Spirit Animals.
- **Predicate ids** (`PREDICATES`): events, characters, warriors,
  survivors, spirit_animals, low_cost, high_cost, low_spark, high_spark,
  materialized, judgment, fast, starter, legendary, transfigured,
  discard_text, abandon, event_copying, energy_generation, dissolve,
  reclaim. All predicates carry singular/plural rendering text and a
  card filter the typeahead can preview against.
- **Card pool**: every entry in `QuestContent.cardDatabase`. Some
  rewards exclude starters (`namedCardGainPool`).
- **Dreamsign pool**: every entry the run was seeded with (the resolved
  package's `dreamsignPoolIds`).
- **Dreamwell cards**: `POSITIVE_DREAMWELL_CARDS` for rewards,
  `NEGATIVE_DREAMWELL_CARDS` for costs (currently stub lists; the
  templates self-hide until content lands).

### Cost templates (31)

| # | Template id | Player-facing effect |
|---|-------------|----------------------|
| 1 | `pay_essence` | Lose 50–200 essence (in 5s). |
| 2 | `pay_omens` | Lose 1–2 omens. |
| 3 | `pay_max_essence` | Lose your maximum essence. |
| 4 | `pay_essence_random_range` | Lose X–Y essence (random roll at resolve). |
| 5 | `pay_percent_essence` | Lose 25/50/75% of current essence. |
| 6 | `pay_all_remaining_essence` | Lose all remaining essence. |
| 7 | `battle_reward_reduction_flat` | Battle essence rewards reduced by N for the next M battles. |
| 8 | `battle_reward_reduction_percent` | Battle essence rewards reduced by N% for the next M battles. |
| 9 | `purge_named_card` | Purge a specific deck card by name. |
| 10 | `purge_random_predicate_card` | Purge a random predicate-matching deck card. |
| 11 | `purge_chosen_predicate_card` | Purge a chosen predicate-matching deck card. |
| 12 | `gain_random_cards_from_pool` | Gain 1–3 random cards from the card pool. |
| 13 | `transform_card_to_random_pool` | Transform a named deck card into a random card from the pool. |
| 14 | `purge_all_duplicate_cards` | Purge all duplicate cards from the deck. |
| 15 | `purge_named_dreamsign` | Purge a specific active dreamsign by name. |
| 16 | `purge_random_dreamsign` | Purge a random active dreamsign. |
| 17 | `purge_chosen_dreamsign` | Purge a chosen active dreamsign. |
| 18 | `transform_dreamsign_to_random` | Transform a chosen dreamsign into a random dreamsign. |
| 19 | `gain_random_banes` | Gain 1–3 random banes. |
| 20 | `gain_named_banes` | Gain N copies of a specific bane. |
| 21 | `gain_named_banes_for_X_battles` | Gain N copies of a specific bane for the next M battles. |
| 22 | `gain_additional_starters` | Gain 1–3 random starter cards. |
| 23 | `set_starting_dreamwell_negative` | Your starting dreamwell card is "X" for the next M battles. |
| 24 | `shuffle_negative_dreamwell_cards` | Shuffle N copies of "X" into your dreamwell for the next M battles. |
| 25 | `remove_transfiguration_from_card` | Remove the transfiguration from a named deck card. |
| 26 | `remove_transfigurations_from_random_predicate` | Remove transfigurations from N random predicate-matching cards. |
| 27 | `draw_X_purge_chosen` | Draw N cards from your deck and purge one of choice. |
| 28 | `remove_shop_sites_from_next_dreamscapes` | Remove all shop sites from the next N dreamscapes you visit. |
| 29 | `remove_dreamsign_sites_from_next_dreamscapes` | Remove all dreamsign sites from the next N dreamscapes you visit. |
| 30 | `lose_max_essence` | Lose 25–125 maximum essence. |
| 31 | `meta_pay_2_costs` | Compound: pay two sub-costs (any non-meta cost). |

### Reward templates (64)

| # | Template id | Player-facing effect |
|---|-------------|----------------------|
| 1 | `gain_essence` | Gain 50–200 essence. |
| 2 | `gain_omens` | Gain 1–3 omens. |
| 3 | `set_essence_to_percent_of_max` | Set essence to 50/75/125% of your max. |
| 4 | `gain_essence_random_range` | Gain X–Y essence (random roll). |
| 5 | `gain_essence_to_max` | Gain essence up to your maximum. |
| 6 | `gain_random_predicate_cards` | Gain N random predicate-matching cards. |
| 7 | `draft_predicate_cards_from_4` | Draft 1 of 4 predicate-matching cards. |
| 8 | `take_any_from_predicate_choices` | Take any number of predicate-matching cards from N choices. |
| 9 | `gain_named_card` | Gain a specific card by name. |
| 10 | `apply_chosen_transfiguration_to_chosen_card` | Apply a chosen transfiguration to a chosen card. |
| 11 | `apply_named_transfiguration_to_chosen_predicate_cards` | Apply X transfiguration to N chosen predicate-matching cards. |
| 12 | `apply_named_transfiguration_to_card_name` | Apply X transfiguration to a named deck card. |
| 13 | `apply_named_transfiguration_to_random_predicate_cards` | Apply X transfiguration to N random predicate-matching cards. |
| 14 | `transfigure_random_starters` | Apply a random transfiguration to N random starter cards. |
| 15 | `transfigure_all_starters` | Apply a random transfiguration to each starter card. |
| 16 | `change_card_to_become_type` | Change a named card to become a Warrior / Survivor / Spirit Animal. |
| 17 | `modify_random_cards_to_types` | Modify N random cards to become a chosen card type. |
| 18 | `make_random_cards_fast` | Change N random cards to have Fast. |
| 19 | `purge_chosen_predicate_cards` | Purge up to N chosen predicate-matching cards. |
| 20 | `purge_chosen_predicate_with_replacement` | Transform up to N chosen predicate cards into random predicate cards. |
| 21 | `purge_named_starter` | Purge a specific named starter card. |
| 22 | `purge_random_starter` | Purge a random starter card. |
| 23 | `purge_random_starter_with_predicate_replacement` | Transform a random starter into a random predicate-matching card. |
| 24 | `transform_starter_into_named_card` | Choose a starter to transform into a named card. |
| 25 | `transform_card_in_deck_into_named` | Transform deck card "A" into "B". |
| 26 | `transform_chosen_predicate_into_named` | Transform a chosen predicate-matching card into a named card. |
| 27 | `duplicate_named_card_X` | Create N duplicates of a named deck card. |
| 28 | `duplicate_chosen_cards` | Duplicate N chosen cards. |
| 29 | `duplicate_random_predicate` | Duplicate N random predicate-matching cards. |
| 30 | `draw_X_and_duplicate_chosen` | Draw N cards and duplicate one of choice. |
| 31 | `purge_X_banes` | Purge N bane cards. |
| 32 | `purge_all_banes` | Purge all bane cards. |
| 33 | `gain_random_dreamsign` | Gain a random Dreamsign from the pool. |
| 34 | `gain_named_dreamsign` | Gain a specific named Dreamsign. |
| 35 | `choose_1_of_X_dreamsigns` | Choose 1 of N Dreamsigns to gain. |
| 36 | `gain_copy_of_random_dreamsign` | Gain a copy of one of your dreamsigns chosen at random. |
| 37 | `gain_copy_of_chosen_dreamsign` | Gain a copy of one of your dreamsigns of your choice. |
| 38 | `add_site_to_dreamscape` | Add an X site to this dreamscape. |
| 39 | `add_site_to_next_dreamscape` | Add an X site to the next dreamscape you visit. |
| 40 | `set_starting_dreamwell_positive` | Your starting dreamwell card is "X". |
| 41 | `shuffle_positive_dreamwell_cards` | Shuffle N copies of "X" into your dreamwell. |
| 42 | `next_X_shop_rerolls_free` | Your next N shop rerolls are free. |
| 43 | `boost_site_appearance_chance` | N% higher chance to see X sites in the next 3 dreamscapes. |
| 44 | `increase_max_essence` | Increase your maximum essence by 25–125. |
| 45 | `draft_2_predicate_cards_from_4` | Draft 2 of 4 predicate-matching cards. |
| 46 | `draft_predicate_card_with_copies` | Draft 1 of 4 predicate cards and gain N copies of it. |
| 47 | `draft_predicate_card_with_transfiguration` | Draft 1 of 4 predicate cards and apply X transfiguration to it. |
| 48 | `make_card_reclaim` | Add Reclaim N to a named deck card. |
| 49 | `make_random_cards_reclaim` | Add Reclaim N to M random cards. |
| 50 | `opening_hand_grant_for_X_battles` | Opening hand contains "X" for the next N battles. |
| 51 | `temporary_card_copy_for_X_battles` | Gain a temporary copy of "X" for the next N battles. |
| 52 | `card_cost_reduction_for_X_battles` | Predicate-matching cards cost N less for the next M battles. |
| 53 | `apply_named_transfiguration_to_all_predicate_cards` | Apply X transfiguration to all predicate-matching cards. |
| 54 | `transfigure_chosen_starters` | Apply a random transfiguration to N chosen starter cards. |
| 55 | `purge_chosen_starters` | Purge up to N chosen starter cards. |
| 56 | `purge_all_starters` | Purge all starter cards. |
| 57 | `replace_starter_via_draft` | Replace a chosen starter with 1 of 4 drafted cards. |
| 58 | `apply_random_transfigurations_to_random_cards` | Apply random transfigurations to N random cards. |
| 59 | `transform_dreamsign_to_named` | Transform a chosen Dreamsign into "X". |
| 60 | `temporary_dreamsign_for_X_battles` | Gain a random Dreamsign for the next N battles. |
| 61 | `replace_site_type` | Replace an X site in this dreamscape with a Y site. |
| 62 | `shop_essence_discount` | Shop essence costs are permanently reduced by N%. |
| 63 | `shop_omen_discount` | Your next N shop purchases cost 1 fewer omen. |
| 64 | `meta_gain_2_rewards` | Compound: gain two sub-rewards (any non-meta reward). |

---

## Phase 2 — Debug Actions Required

Every effect listed above decomposes into one or more of the primitive
debug operations grouped here. Each group lives behind a single right-click
surface in the quest UI; sub-menus carry the per-effect parameters
(typeahead pickers, numeric inputs, predicate pickers).

The mapping table at the end of this section names the surface + menu path
for every Phase-1 template, then closes with a coverage audit.

### A. Resources — right-click the HUD essence total (`HUD.tsx`, `data-hud-essence`)

- **Add/remove essence** → numeric input (positive or negative integer),
  clamped to `[0, essenceCap]`. Handles `pay_essence`,
  `pay_all_remaining_essence`, `pay_percent_essence` (via "Lose X% of
  current"), `gain_essence`, `gain_essence_to_max`.
- **Gain random amount in range** → two numeric inputs (min, max);
  resolves a `drawInt(min, max)` and applies. Handles
  `gain_essence_random_range`.
- **Lose random amount in range** → mirror of the above; negative
  delta. Handles `pay_essence_random_range`.
- **Set essence to value** → single numeric input. Handles
  `set_essence_to_percent_of_max` (compute target = `floor(max * pct/100)`
  manually, or via the "Set essence to % of max" shortcut below).
- **Set essence to % of max** → percent input (with 50/75/125 quick
  buttons). Handles `set_essence_to_percent_of_max`.
- **Add/remove maximum essence** → numeric delta, applied to
  `essenceCap`. Handles `increase_max_essence`, `lose_max_essence`,
  `pay_max_essence` (use "Set max essence to current essence" shortcut
  if helpful).
- **Set maximum essence to value** → single numeric input. Same backing
  field as above.

### B. Omens — right-click the HUD omens total (`HUD.tsx`, `data-hud-omens`)

- **Add/remove omens** → numeric delta. Handles `gain_omens`, `pay_omens`,
  and `shop_omen_discount` (the discount is implemented by manually
  reducing omen spend on the shop screen — see Group F).

### C. Deck root — right-click the "View Deck" HUD button or the deck count chip

Right-click menus never carry predicate-specific submenus. Anything
that has to filter or randomize by a card predicate routes the tester
through the Deck Viewer (Group D) or Card Pool Viewer (Group G), which
own the filter + sort chrome.

- **Add bane** → submenu listing `BANE_NAMES` plus a "Random" entry, then
  a quantity input. `BANE_NAMES` is a closed vocabulary, not a card
  predicate, so it stays on the right-click menu. Handles
  `gain_named_banes`, `gain_random_banes`,
  `gain_named_banes_for_X_battles` (combine with "Add status note" below
  to remember the battle count).
- **Open Deck Viewer** → opens Group D. The tester applies any
  deck-targeting effect through the viewer's chrome (predicate filter,
  randomize sort) plus per-row right-click actions.
- **Open Card Pool Viewer** → opens Group G. The tester applies any
  pool-targeting effect (gain, draft, transform-into-X) through the
  viewer's chrome plus per-card right-click actions.

### D. Deck Viewer — chrome + per-card right-click (`DeckViewer.tsx`)

**Viewer chrome (not right-click):**

- **Predicate filter** → drop-down bound to `PREDICATES`. Narrows the
  visible deck to predicate-matching entries before per-card actions.
  Owns every "filter by predicate" step in the coverage table.
- **Randomize sort order** → header button. Reshuffles the row order so
  "first N cards displayed" reads off as the random target set. Handles
  the random-target steps for
  `remove_transfigurations_from_random_predicate`,
  `apply_random_transfigurations_to_random_cards`,
  `make_random_cards_reclaim`, `make_random_cards_fast`,
  `modify_random_cards_to_types`, `purge_random_predicate_card`,
  `duplicate_random_predicate`,
  `apply_named_transfiguration_to_random_predicate_cards`,
  `transfigure_random_starters`, `purge_random_starter`.
- The existing All / Characters / Events filter, sort criteria, and
  card-size chrome stay as-is.

**Per-card right-click items:**

- **Purge card** → removes the entry. Handles `purge_named_card`,
  `purge_random_predicate_card` (combined with deck-shuffle + first
  match), `purge_chosen_predicate_card`, `purge_all_duplicate_cards`
  (apply per-duplicate row, or add a deck-root "Purge all duplicates"
  shortcut), `purge_chosen_predicate_cards`, `purge_named_starter`,
  `purge_random_starter`, `purge_chosen_starters`, `purge_all_starters`
  (deck-root shortcut), `purge_X_banes`, `purge_all_banes` (deck-root
  shortcut), `draw_X_purge_chosen`, `transform_card_in_deck_into_named`
  (combine with Group C "Add card by name"), `transform_card_to_random_pool`
  (combine with "Add random card from pool"),
  `purge_random_starter_with_predicate_replacement` (combine with Group G),
  `purge_chosen_predicate_with_replacement` (combine with Group G).
- **Duplicate card** → appends another `DeckEntry` with the same
  `cardNumber` and same transfiguration. Handles `duplicate_named_card_X`,
  `duplicate_chosen_cards`, `duplicate_random_predicate`,
  `draw_X_and_duplicate_chosen`, `draft_predicate_card_with_copies`.
  (`gain_copy_of_random_dreamsign` is a dreamsign action — see Group E.)
- **Add transfiguration** → submenu of `JOURNEY_TRANSFIGURATIONS` plus a
  "Random" entry. Sets `entry.transfiguration`. Handles
  `apply_chosen_transfiguration_to_chosen_card`,
  `apply_named_transfiguration_to_card_name`,
  `apply_named_transfiguration_to_chosen_predicate_cards`,
  `apply_named_transfiguration_to_random_predicate_cards`,
  `apply_named_transfiguration_to_all_predicate_cards`,
  `transfigure_random_starters`, `transfigure_all_starters`,
  `transfigure_chosen_starters`,
  `apply_random_transfigurations_to_random_cards`,
  `draft_predicate_card_with_transfiguration` (combined with Group C).
- **Remove transfiguration** → clears `entry.transfiguration`. Handles
  `remove_transfiguration_from_card`,
  `remove_transfigurations_from_random_predicate`.
- **Change card type** → submenu: Warrior / Survivor / Spirit Animal.
  Mutates the entry's runtime card-type override (or via the same
  override mechanism used elsewhere). Handles
  `change_card_to_become_type`, `modify_random_cards_to_types`.
- **Add text/keyword** → submenu of common keywords + free-form text:
  Fast, Reclaim N, custom text. Handles `make_random_cards_fast`,
  `make_card_reclaim`, `make_random_cards_reclaim`,
  `temporary_card_copy_for_X_battles` (use "Temporary copy for next N
  battles" submenu so the entry can be removed later), and adjacent
  reminder notes for any text-based modifier.
- **Set as starter / clear starter flag** → toggles the `isBane` analogue
  for starter classification (needed because the predicate `starter: true`
  drives several rewards/costs).
- **Inspect** → opens the existing card inspector.

### E. Dreamsigns — right-click the HudDreamsignRow tile (or its container)

- **Gain dreamsign** → typeahead over the resolved package's dreamsign
  pool (`remainingDreamsignPool` plus `ctx.content.dreamsigns`). Handles
  `gain_random_dreamsign` (use the "Random" shortcut),
  `gain_named_dreamsign`, `choose_1_of_X_dreamsigns`,
  `gain_copy_of_random_dreamsign`, `gain_copy_of_chosen_dreamsign`.
- **Purge dreamsign** (per-tile context menu on each existing dreamsign
  tile) → removes the entry from `state.dreamsigns`. Handles
  `purge_named_dreamsign`, `purge_random_dreamsign`,
  `purge_chosen_dreamsign`.
- **Transform dreamsign into…** (per-tile) → typeahead destination from
  the pool. Handles `transform_dreamsign_to_random` (with the typeahead
  set to "Random"), `transform_dreamsign_to_named`.
- **Temporary dreamsign (next N battles)** (deck-root + status note) →
  same as "Gain", but also queues a status note auto-pinned with the
  remaining-battle countdown. Handles `temporary_dreamsign_for_X_battles`.

### F. Dreamscape & Atlas — right-click the Dreamscape screen and per-site

- **Dreamscape screen background → Add site** → submenu of
  `JOURNEY_REWARDABLE_SITE_TYPES`. Handles `add_site_to_dreamscape`.
- **Dreamscape screen background → Add site to next dreamscape** → same
  picker, queues a status note (Group H) so the tester remembers to act
  next visit. Handles `add_site_to_next_dreamscape`,
  `boost_site_appearance_chance` (note records the percent + dreamscape
  count; effect applied manually when the tester rolls each new
  dreamscape).
- **Per-site → Remove site** → deletes a site from the current
  dreamscape's `SiteState[]`. Handles `remove_shop_sites_from_next_dreamscapes`
  (combine with the Group H note so it triggers on the next 3
  dreamscapes you visit), `remove_dreamsign_sites_from_next_dreamscapes`,
  cleanup after `add_site_to_next_dreamscape`.
- **Per-site → Replace site type** → submenu of replacement site types
  (`JOURNEY_REWARDABLE_SITE_TYPES`). Handles `replace_site_type`.
- **Atlas screen → Mark dreamscape as visited / unvisited** → debug-only
  toggle for working through multi-dreamscape effects.

### G. Card Pool Viewer — new screen, opened from the deck-root right-click "Open Card Pool Viewer"

The viewer renders every card in `ctx.content.cards` (or
`cardDatabase.values()`). All filtering and randomization lives in the
viewer chrome — never in a right-click menu. Per-card right-click items
operate only on the focused card and carry no predicate awareness.

**Viewer chrome (not right-click):**

- **Predicate filter** → drop-down bound to `PREDICATES`. Owns every
  "filter by predicate" step that targets the card pool.
- **Other filters** → rarity, starter toggle, dreamcaller-package
  filter, free-form name search.
- **Sort menu** → alphabetical, cardNumber, rarity, energyCost,
  **Randomize**. Randomize is the mechanism for every "random card
  from the pool" effect: filter to the desired predicate, randomize,
  then take the first N rows via the per-card right-click.

**Per-card right-click items:**

- **Add to deck** → inserts a `DeckEntry`; sub-menu allows immediate
  transfiguration / card-type override.
- **Add N copies to deck** → numeric input.
- **Inspect** → opens the existing card inspector.

With filter + randomize set, the tester reads off the first M cards as
the "random" picks. This is the mechanism for
`gain_random_cards_from_pool`, `gain_random_predicate_cards`,
`transform_card_to_random_pool`,
`purge_chosen_predicate_with_replacement`,
`purge_random_starter_with_predicate_replacement`,
`transform_chosen_predicate_into_named` (when the destination is the
"random of predicate" branch),
`apply_named_transfiguration_to_random_predicate_cards` (target deck
cards belong to Group D), `duplicate_random_predicate`. Effects whose
random target is "N random cards from the deck" rather than "from the
pool" — `make_random_cards_fast`, `make_random_cards_reclaim`,
`modify_random_cards_to_types`, `apply_random_transfigurations_to_random_cards`,
`remove_transfigurations_from_random_predicate`,
`purge_random_predicate_card`, `purge_random_starter`,
`transfigure_random_starters` — route through Group D's Randomize Sort
on the Deck Viewer instead.

### H. Status Notes Overlay — new affordance, right-click HUD or atlas, "Add status note"

Free-form notes that persist with the quest and render in a corner
popover. Each note carries an optional **expiration trigger** (after N
battles, next dreamscape, after specific events) so the tester knows
when to manually unwind the effect. Per-note context menu:

- **Dismiss note** → removes it.
- **Edit note** → reopens the text editor.

Status notes are the canonical place to record any effect with delayed,
recurring, or hard-to-encode behaviour. Examples:

- `battle_reward_reduction_flat` → "−N essence on next M battle rewards".
- `battle_reward_reduction_percent` → "−N% on next M battle rewards".
- `gain_named_banes_for_X_battles` → "Remove N <bane> after next M
  battles" (banes are added immediately via Group C; the note tracks the
  removal trigger).
- `remove_shop_sites_from_next_dreamscapes` /
  `remove_dreamsign_sites_from_next_dreamscapes` → "Remove all shop /
  dreamsign sites from the next N dreamscapes" (action taken on
  arrival via Group F).
- `boost_site_appearance_chance` → "+N% chance of X sites in the next 3
  dreamscapes".
- `next_X_shop_rerolls_free` → "Next N rerolls free" (applied at the
  shop via Group I).
- `shop_essence_discount` → "Shop essence costs −N% permanently"
  (applied at the shop).
- `card_cost_reduction_for_X_battles` → "<Predicate> cards cost N less
  for next M battles" (applied per-card in the battle hand).
- `opening_hand_grant_for_X_battles` → "Opening hand contains X for
  next N battles" (applied by manually moving the card into the
  battle's opening hand via the battle context menu, then deleting it
  after the N battles).
- `temporary_card_copy_for_X_battles` → "Temp copy of X for N battles"
  (the copy is added to the deck via Group D's Duplicate, then purged
  by the tester after the countdown).
- `temporary_dreamsign_for_X_battles` → "Random Dreamsign X for next N
  battles" (the dreamsign is added via Group E, then purged after N
  battles).
- `set_starting_dreamwell_positive` /
  `set_starting_dreamwell_negative` → "Starting dreamwell card = X for
  next M battles" (applied via Group I at the next battle).
- `shuffle_positive_dreamwell_cards` /
  `shuffle_negative_dreamwell_cards` → "Shuffle N copies of X into
  dreamwell for next M battles" (applied at battle).

### I. Battle and Shop overrides — right-click in the battle / shop screen

The battle surface already has a context menu
(`src/battle/components/BattleContextMenu.tsx`). The quest-level effects
that materialise inside a battle hook into the existing menu rather than
introducing a new one:

- **Shop screen background → Reduce prices by %** → numeric input;
  multiplies every slot's `discountPercent` toward 100. Handles
  `shop_essence_discount` (the persistent quest-level discount is
  recorded as a status note from Group H and reapplied here every shop
  visit).
- **Shop screen background → Mark next reroll free** → checkbox or
  per-reroll override that skips the omen deduction. Handles
  `next_X_shop_rerolls_free` (countdown lives in a status note).
- **Shop screen background → Apply omen discount to next purchase** →
  toggles a "-1 omen on next purchase" flag. Handles `shop_omen_discount`
  (paired with a status note for the remaining-purchase count).
- **Battle screen → Set starting dreamwell card** → existing battle
  debug machinery already supports manual dreamwell edits via the
  battle context menu; surface a "Set as starting dreamwell" shortcut.
  Handles `set_starting_dreamwell_positive`,
  `set_starting_dreamwell_negative`.
- **Battle screen → Shuffle card into dreamwell** → existing per-card
  "Move to deck top/bottom" works; document the path. Handles
  `shuffle_positive_dreamwell_cards`,
  `shuffle_negative_dreamwell_cards`.
- **Battle screen → Reduce predicate-matching card cost by N** → applied
  via the existing battle debug "Override cost" path on a per-card basis.
  Handles `card_cost_reduction_for_X_battles` (status note tracks the
  battle countdown and the predicate).
- **Battle screen → Add to opening hand** → use the existing battle
  context-menu "→ Hand" path on the starting card. Handles
  `opening_hand_grant_for_X_battles`.
- **Battle screen → Create temporary card copy** → existing
  `CREATE_CARD_COPY` debug edit. Handles
  `temporary_card_copy_for_X_battles` (purged from the deck after the
  countdown).
- **Battle screen → Reduce battle reward essence** → manual edit of the
  battle-result essence reward (or, equivalently, subtract from the
  HUD essence right after the battle resolves via Group A). Handles
  `battle_reward_reduction_flat`, `battle_reward_reduction_percent`.

### Compound effects

`meta_pay_2_costs` and `meta_gain_2_rewards` are compositions of two
non-meta templates. They need no dedicated affordance: the tester
applies each sub-template through the actions above. The status-note
overlay (Group H) is the right place to record the second sub-effect
if its trigger is delayed.

---

## Coverage Audit — every Phase-1 template maps to a Phase-2 action

The columns are: **template id**, **primary debug surface**, **primary
right-click path**, **supporting status note**.

### Cost templates

| Template id | Surface | Right-click path | Note? |
|-------------|---------|------------------|-------|
| `pay_essence` | HUD essence | Add/remove essence → -N | — |
| `pay_omens` | HUD omens | Add/remove omens → -N | — |
| `pay_max_essence` | HUD essence | Set max essence to current | — |
| `pay_essence_random_range` | HUD essence | Lose random in range → min/max | — |
| `pay_percent_essence` | HUD essence | Add/remove essence → -floor(essence·%) | — |
| `pay_all_remaining_essence` | HUD essence | Set essence to 0 | — |
| `battle_reward_reduction_flat` | Battle / HUD | After battle, subtract N from essence | Yes (M battles) |
| `battle_reward_reduction_percent` | Battle / HUD | After battle, subtract N% from essence reward | Yes (M battles) |
| `purge_named_card` | Deck Viewer | Find card → Purge | — |
| `purge_random_predicate_card` | Deck Viewer | Randomize → filter by predicate → Purge first | — |
| `purge_chosen_predicate_card` | Deck Viewer | Filter by predicate → Purge chosen | — |
| `gain_random_cards_from_pool` | Card Pool Viewer | Randomize → Add to deck × N | — |
| `transform_card_to_random_pool` | Deck Viewer + Pool Viewer | Purge named, then add random from pool | — |
| `purge_all_duplicate_cards` | Deck Viewer | Sort by name → Purge each duplicate (or deck-root "Purge all duplicates") | — |
| `purge_named_dreamsign` | HudDreamsignRow | Per-tile → Purge | — |
| `purge_random_dreamsign` | HudDreamsignRow | Pick random tile → Purge | — |
| `purge_chosen_dreamsign` | HudDreamsignRow | Per-tile → Purge | — |
| `transform_dreamsign_to_random` | HudDreamsignRow | Per-tile → Transform → Random | — |
| `gain_random_banes` | Deck root | Add bane → Random × N | — |
| `gain_named_banes` | Deck root | Add bane → pick name × N | — |
| `gain_named_banes_for_X_battles` | Deck root + status note | Add bane × N | Yes (remove after M battles) |
| `gain_additional_starters` | Card Pool Viewer | Filter: starter → Randomize → Add × N | — |
| `set_starting_dreamwell_negative` | Battle screen + status note | Set as starting dreamwell card | Yes (M battles) |
| `shuffle_negative_dreamwell_cards` | Battle screen + status note | Shuffle card into dreamwell × N | Yes (M battles) |
| `remove_transfiguration_from_card` | Deck Viewer | Find card → Remove transfiguration | — |
| `remove_transfigurations_from_random_predicate` | Deck Viewer | Randomize → filter predicate → Remove transfiguration × N | — |
| `draw_X_purge_chosen` | Deck Viewer | Randomize → take first N → Purge chosen | — |
| `remove_shop_sites_from_next_dreamscapes` | Dreamscape + status note | On each next-N dreamscape → per-site Remove on Shop sites | Yes (N dreamscapes) |
| `remove_dreamsign_sites_from_next_dreamscapes` | Dreamscape + status note | Same for Dreamsign Offering / Dreamsign Draft sites | Yes (N dreamscapes) |
| `lose_max_essence` | HUD essence | Add/remove max essence → -N | — |
| `meta_pay_2_costs` | n/a | Apply each sub-cost via its row above | — |

### Reward templates

| Template id | Surface | Right-click path | Note? |
|-------------|---------|------------------|-------|
| `gain_essence` | HUD essence | Add/remove essence → +N | — |
| `gain_omens` | HUD omens | Add/remove omens → +N | — |
| `set_essence_to_percent_of_max` | HUD essence | Set essence to % of max → pct | — |
| `gain_essence_random_range` | HUD essence | Gain random in range → min/max | — |
| `gain_essence_to_max` | HUD essence | Set essence to value → essenceCap | — |
| `gain_random_predicate_cards` | Card Pool Viewer | Filter predicate → Randomize → Add × N | — |
| `draft_predicate_cards_from_4` | Card Pool Viewer | Filter predicate → Randomize → review first 4 → Add chosen | — |
| `take_any_from_predicate_choices` | Card Pool Viewer | Filter predicate → Randomize → review first N → Add any subset | — |
| `gain_named_card` | Deck root | Add card by name → typeahead | — |
| `apply_chosen_transfiguration_to_chosen_card` | Deck Viewer | Per-card → Add transfiguration → pick | — |
| `apply_named_transfiguration_to_chosen_predicate_cards` | Deck Viewer | Filter predicate → per-card Add transfiguration × N | — |
| `apply_named_transfiguration_to_card_name` | Deck Viewer | Find card → Add transfiguration → pick | — |
| `apply_named_transfiguration_to_random_predicate_cards` | Deck Viewer | Filter predicate → Randomize → Add transfiguration to first N | — |
| `transfigure_random_starters` | Deck Viewer | Filter starter → Randomize → Add transfiguration → Random on first N | — |
| `transfigure_all_starters` | Deck Viewer | Filter starter → Add transfiguration → Random on each | — |
| `change_card_to_become_type` | Deck Viewer | Find card → Change card type | — |
| `modify_random_cards_to_types` | Deck Viewer | Randomize → Change card type on first N | — |
| `make_random_cards_fast` | Deck Viewer | Randomize → Add text → Fast on first N | — |
| `purge_chosen_predicate_cards` | Deck Viewer | Filter predicate → per-card Purge × ≤N | — |
| `purge_chosen_predicate_with_replacement` | Deck Viewer + Pool Viewer | Purge × ≤N, then Add random predicate × same | — |
| `purge_named_starter` | Deck Viewer | Find starter by name → Purge | — |
| `purge_random_starter` | Deck Viewer | Filter starter → Randomize → Purge first | — |
| `purge_random_starter_with_predicate_replacement` | Deck Viewer + Pool Viewer | Purge random starter, then Add random predicate | — |
| `transform_starter_into_named_card` | Deck Viewer + Deck root | Purge chosen starter, then Add card by name | — |
| `transform_card_in_deck_into_named` | Deck Viewer + Deck root | Purge A, then Add card by name B | — |
| `transform_chosen_predicate_into_named` | Deck Viewer + Deck root | Filter predicate → Purge chosen, then Add card by name | — |
| `duplicate_named_card_X` | Deck Viewer | Find card → Duplicate × N | — |
| `duplicate_chosen_cards` | Deck Viewer | Per-card → Duplicate × N | — |
| `duplicate_random_predicate` | Deck Viewer | Filter predicate → Randomize → Duplicate first N | — |
| `draw_X_and_duplicate_chosen` | Deck Viewer | Randomize → take first N → Duplicate chosen | — |
| `purge_X_banes` | Deck Viewer | Filter bane → per-row Purge × N | — |
| `purge_all_banes` | Deck Viewer | Filter bane → deck-root Purge All (or per-row × all) | — |
| `gain_random_dreamsign` | HudDreamsignRow | Gain dreamsign → Random | — |
| `gain_named_dreamsign` | HudDreamsignRow | Gain dreamsign → typeahead | — |
| `choose_1_of_X_dreamsigns` | HudDreamsignRow | Gain dreamsign → review N candidates → pick 1 | — |
| `gain_copy_of_random_dreamsign` | HudDreamsignRow | Pick random active tile → Gain dreamsign of same id | — |
| `gain_copy_of_chosen_dreamsign` | HudDreamsignRow | Per-tile → Gain dreamsign of same id | — |
| `add_site_to_dreamscape` | Dreamscape | Add site → pick type | — |
| `add_site_to_next_dreamscape` | Dreamscape + status note | Add site → on next dreamscape | Yes (single dreamscape) |
| `set_starting_dreamwell_positive` | Battle screen + status note | Set as starting dreamwell card | Yes (until used) |
| `shuffle_positive_dreamwell_cards` | Battle screen + status note | Shuffle card into dreamwell × N | Yes (until used) |
| `next_X_shop_rerolls_free` | Shop screen + status note | Mark next reroll free | Yes (N rerolls) |
| `boost_site_appearance_chance` | Dreamscape + status note | Tester favours the boosted type when rolling new dreamscapes | Yes (3 dreamscapes) |
| `increase_max_essence` | HUD essence | Add/remove max essence → +N | — |
| `draft_2_predicate_cards_from_4` | Card Pool Viewer | Filter predicate → Randomize → Add 2 of first 4 | — |
| `draft_predicate_card_with_copies` | Card Pool Viewer + Deck Viewer | Add 1 of first 4, then Duplicate × N−1 | — |
| `draft_predicate_card_with_transfiguration` | Card Pool Viewer + Deck Viewer | Add 1 of first 4, then per-card Add transfiguration | — |
| `make_card_reclaim` | Deck Viewer | Find card → Add text → Reclaim N | — |
| `make_random_cards_reclaim` | Deck Viewer | Randomize → Add text → Reclaim N on first M | — |
| `opening_hand_grant_for_X_battles` | Battle screen + status note | Battle context menu "→ Hand" on the named card at battle start | Yes (N battles) |
| `temporary_card_copy_for_X_battles` | Deck Viewer + status note | Find card → Duplicate; remove duplicate after N battles | Yes (N battles) |
| `card_cost_reduction_for_X_battles` | Battle screen + status note | Per-card cost override on matching cards each turn | Yes (M battles) |
| `apply_named_transfiguration_to_all_predicate_cards` | Deck Viewer | Filter predicate → per-card Add transfiguration on all | — |
| `transfigure_chosen_starters` | Deck Viewer | Filter starter → per-card Add transfiguration → Random × N | — |
| `purge_chosen_starters` | Deck Viewer | Filter starter → per-card Purge × ≤N | — |
| `purge_all_starters` | Deck Viewer | Filter starter → deck-root Purge All (or per-row × all) | — |
| `replace_starter_via_draft` | Deck Viewer + Card Pool Viewer | Purge chosen starter → Randomize pool → Add 1 of first 4 | — |
| `apply_random_transfigurations_to_random_cards` | Deck Viewer | Randomize → Add transfiguration → Random on first N | — |
| `transform_dreamsign_to_named` | HudDreamsignRow | Per-tile → Transform → typeahead | — |
| `temporary_dreamsign_for_X_battles` | HudDreamsignRow + status note | Gain dreamsign → Random; remove after N battles | Yes (N battles) |
| `replace_site_type` | Dreamscape | Per-site → Replace site type | — |
| `shop_essence_discount` | Shop + status note | Reduce prices by N% (reapplied each shop visit) | Yes (permanent) |
| `shop_omen_discount` | Shop + status note | Apply omen discount to next purchase | Yes (purchase countdown) |
| `meta_gain_2_rewards` | n/a | Apply each sub-reward via its row above | — |

### Coverage check

Total template count: **31 costs + 64 rewards = 95**. Every row above
appears in exactly one of the two tables and points at a concrete
right-click path under Groups A–I. No template is left unhandled. The
meta templates explicitly defer to their sub-templates and need no new
affordance beyond the building blocks listed in Groups A–I.

### Net-new UI surfaces

For implementation planning, the building-block list above requires the
following net-new surfaces:

1. **HUD right-click menus** on the essence chip, the omens chip, the
   deck count chip, the View-Deck button, and each Dreamsign tile (+
   the empty HudDreamsignRow container).
2. **Deck Viewer additions**: predicate-filter drop-down and
   randomize-sort option in the header chrome, plus a per-row
   right-click menu (Group D). Right-click items carry no predicate
   awareness.
3. **Card Pool Viewer screen** (Group G): predicate filter,
   randomize sort, and per-card right-click. Right-click items carry
   no predicate awareness.
4. **Dreamscape per-site right-click menu** (Remove, Replace) and a
   **Dreamscape background right-click menu** (Add site).
5. **Status Notes overlay** with free-form text and per-note dismissal
   (Group H).
6. **Shop and Battle screen background right-click menus** for
   shop-discount and battle-time application (Group I); per-card paths
   inside battles reuse the existing `BattleContextMenu`.

# QA Scenes (`?goto=`)

QA scenes are named jump points to screens that are otherwise reachable only by
playing a journey forward through battles. Appending `?goto=<scene>` to the dev URL
boots a fresh room straight onto the target screen, so a surface like the Dream
Atlas boss preview or a site screen can be opened for browser QA without playing
up to it.

```
http://localhost:5174/?goto=atlas
http://localhost:5174/?goto=duplication-enhanced
```

The scene id is trimmed and matched case-insensitively. An empty value
(`?goto=`) is ignored.

## How it works

1. `parseRuntimeConfig` reads `?goto=` into `runtimeConfig.gotoScene`
   (`src/runtime/runtime-config.ts`).
2. When `gotoScene` is set and no `?game=` room id is present,
   `MultiplayerRoomGate` auto-creates and joins a fresh room, skipping the manual
   "Create Game" gate — the same auto-create path `?loadJourney=` uses
   (`src/multiplayer/MultiplayerRoomGate.tsx`, `src/App.tsx`).
3. On the freshly created (empty) room, `bootstrapQaScene` builds a complete,
   valid `JourneyState` for the scene from live journey content — the same generators
   the real journey uses, never hand-faked fixtures — and parks the run on the
   target screen (`src/runtime/qa-scenes.ts`).

Each load writes a `debug_qa_scene_loaded` event to `logs/journey-log.jsonl`,
stamped with the room `gameId`.

The bootstrap guards on `dreamAvatar === null`, so it only fires on a brand-new
empty room. Once the room exists (the URL gains `&game=<id>`), reloading resumes
that room rather than rebuilding the scene. An unknown id, or a scene whose
required content is missing, leaves the room on the normal Dream Avatar selection
screen and logs the outcome (`unknown_scene` or `build_failed`).

Site scenes retype one of the starter dreamscape's non-battle sites to the target
site type and park the run on it; the site's per-screen runtime (offers, choices)
is created on entry by the screen itself, exactly as in normal play. An
`-enhanced` variant marks the site `isEnhanced`, surfacing its enhanced behavior
(for example, the Duplication site offering the whole deck instead of a small
random hand).

## Exploration card

`?goto=exploration&card=<UUID>` opens the Exploration scene with the authored
encounter for that exact source-card UUID. The same option composes with
`?goto=exploration-enhanced`, `?goto=exploration-duplicates`, and
`?goto=exploration-purchases`. The duplicate scene adds one extra copy of each
of two cards in its QA deck. The purchase-path scene starts at 101 Essence and
places an ordinary Shop and Dreamsign Bazaar beside Exploration in the same
Dreamscape. The UUID must identify one of the source cards in the Exploration
encounter catalog.

```
http://localhost:5174/?goto=exploration&card=161482b6-af07-4d9e-822d-8c738672beb9
http://localhost:5174/?goto=exploration-duplicates&card=b1d36337-5668-4f1d-b155-2d07fc00f872
```

Exploration QA retains the authentic starter deck from the selected Dream
Avatar package. Add `&starterCount=<N>` to retain exactly the first `N` entries
from that recipe before the encounter is prepared. Omitting the parameter keeps
the complete starter deck; `starterCount=0` exercises an unavailable
starter-card action. The count must be a nonnegative integer no larger than the
live starter recipe.

The starter-card redesigns have deterministic browser-QA entry points:

```text
# Template 32: disclosed prepared starter purge
http://localhost:5174/?goto=exploration&card=b957466e-f748-4a95-89b2-8509dc762223&starterCount=4&seed=3201

# Template 33: concealed random starter purge
http://localhost:5174/?goto=exploration&card=c6ae1899-c94c-464f-8edb-4a0b1ec2c981&starterCount=4&seed=3301

# Template 34: one concealed starter-to-card replacement pair
http://localhost:5174/?goto=exploration&card=5ab11bef-5dcd-49f5-be49-ae2ccde76e70&starterCount=1&seed=3401

# Template 35: every retained starter replaced; use for narrow and reduced-motion QA
http://localhost:5174/?goto=exploration&card=7b55efd1-6d9f-4156-9de7-1c71ccc410cb&starterCount=4&seed=3501
```

The multi-card redesigns use the standard Exploration QA deck. It retains the
authentic starter recipe and appends at least two Events, exactly two authored
Warriors, and enough other Characters to exercise each count-two action:

```text
# Template 8: choose one or two Events and reveal their prepared replacements
http://localhost:5174/?goto=exploration&card=3725379c-676d-4efd-81ee-7e45d80db6d0&seed=8001

# Template 21: choose exactly two Warriors to receive Kindled
http://localhost:5174/?goto=exploration&card=78673e2b-a6d1-43de-8850-3d3327de5cc6&seed=2101

# Template 52: automatically copy two prepared Character entries
http://localhost:5174/?goto=exploration&card=0a19c54c-7a2e-4614-99c9-2c9142729ebb&seed=5201

# Template 54: automatically change two prepared non-Event entries into Events
http://localhost:5174/?goto=exploration&card=12bb1efa-463b-4ac8-b9bd-e5bd135c3eb4&seed=5401
```

The Wave 7 deck-mutation and Legendary-reward redesigns use the same standard
Exploration QA deck and route-level QA seed:

```text
# Template 48: conceal one signed random Character target and replace it with the fixed card
http://localhost:5174/?goto=exploration&card=bc1ffcd7-36c3-43b7-871b-bc2e6b3d0034&seed=4801

# Template 53: disclose one concrete deck entry, then automatically make it a Character
http://localhost:5174/?goto=exploration&card=4e3c04a9-1cdd-468a-b42a-40157ed9c9d6&seed=5301

# Template 72: gain one prepared Legendary card
http://localhost:5174/?goto=exploration&card=455ef341-8a26-44e1-b287-19e53bdc6158&seed=7201
```

The Wave 8 compound-card redesigns use the standard scene except for template
80, whose duplicate scene proves that selection is keyed by concrete deck-entry
UUID rather than base-card UUID:

```text
# Template 40, authored action 2: transfigure every prepared eligible deck entry
http://localhost:5174/?goto=exploration&card=848b41b3-9f87-45fb-b86f-b52fc913d201&seed=4001
# action UUID: 7b390b9d-5d57-4a70-b25b-aaa5f842a1ca

# Template 75, authored action 1: purge one disclosed entry and apply Resonant to its same-type companions
http://localhost:5174/?goto=exploration&card=890970bd-475f-4da4-b835-2fb75882a84d&seed=7501
# action UUID: 7c4aa242-8a27-4835-8ad0-4abc08b18e60

# Template 77, authored action 2: make every prepared Event fast and gain two Nightmares
http://localhost:5174/?goto=exploration&card=c96c6c7f-c0fe-4272-b856-a54ace01f596&seed=7701
# action UUID: fcce63dc-f8c5-4183-be2a-9de4929ca8c2

# Template 78, authored action 1: take an Event subset from four Enduring previews and gain two Nightmares
http://localhost:5174/?goto=exploration&card=475fcc5b-c82d-4ef7-8020-90a8aeb2df53&seed=7801
# action UUID: 2352e33a-f5a3-461e-ab6d-d1d6eb15c6b9

# Template 80, authored action 1: choose one of four concrete entries to purge; apply Attuned to and copy the others
http://localhost:5174/?goto=exploration-duplicates&card=c86c1364-6ac4-4c90-8053-4e49441a2c83&seed=8001
# action UUID: e01fd10a-0e68-4bf4-b0fb-9859ba0d6443
```

Activate each Wave 8 action by UUID with
`[data-exploration-action-id="<UUID>"]`. The authored ordinal above is useful
for manual orientation, but browser automation uses the UUID selector. A
compound chooser is rooted at `[data-exploration-followup]` and exposes its
runtime kind in `data-exploration-effect-kind`. Select template 75 and template
80 cards by `data-entry-id`; select template 78 previews by `data-card-id`.

Run templates 40, 75, and 80 at a desktop viewport. Run templates 77 and 78 at
390×844, and repeat one resolved compound outcome with reduced motion enabled.
Before activation, assert `location.href`, `window.innerWidth`, the prepared
UUID bindings, and an empty `window.__caps`. Exercise controls with keyboard as
well as pointer input, and verify focused and selected cards are visible without
clipping or overlap.

Template 40 resolves at
`[data-exploration-outcome="multi-card-transfiguration"]`; every prepared entry
must retain its UUID and carry its signed persisted form. Templates 75, 77, 78,
and 80 resolve at
`[data-exploration-outcome="compound-card-mutation"][data-exploration-compound-source="<effect-kind>"]`.
Compare the outcome's purged, transfigured, fast, Nightmare, and copy UUID
attributes with the signed preparation and the persisted deck. Template 75
must remove only its disclosed entry. Template 77 must preserve pre-existing
Fast state and mint exactly two Nightmare entries. For template 78, choose two
nonadjacent previews and confirm that those two Enduring cards precede the two
Nightmares in persisted gain order. For template 80, choose one of the duplicate
base-card entries and confirm that only the chosen entry UUID is removed; the
other three originals become Attuned and each source maps to one distinct
Attuned copy.

Reload the room after each outcome and compare the same UUID sets, ordered
mappings, forms, and terminal state. The `exploration_choice_resolved` record
must contain the encounter/action UUIDs, effect kind, mechanic and policy,
selection revisions and signature, complete `compoundActionPreparation`,
selector traces and tie-breaks, validated UUID intent, ordered persisted
mutations, and terminal outcome. Finish each run with `window.__caps` empty.

Each new cooperative room owns the signed seed used to prepare random mechanic
outputs. Record the exact prepared UUIDs for that room and assert that the
choice outcome, persisted deck, and `exploration_choice_resolved` log agree;
fresh rooms opened from the same URL can select different eligible UUIDs.

For each URL, wait for `[data-exploration-channel-state="revealed"]`, activate
`[data-testid="cumulus-exploration-channel"]`, wait for
`[data-exploration-choices-state="revealed"]`, and use
`[data-testid="cumulus-exploration-choice-1"]`.

Template 48 discloses the fixed replacement UUID
`ffec9fdd-d948-4756-b7df-39b9e982613e` through
`[data-exploration-entity-label="card"][data-entity-id="ffec9fdd-d948-4756-b7df-39b9e982613e"]`.
Its choice contains no `[data-exploration-deck-entry-id]`, keeping the signed
random Character target concealed until resolution. The exact persisted result
appears at
`[data-exploration-outcome="card-replacements"][data-exploration-card-replacement-source="replace-random-with-card"][data-exploration-card-replacement-count="1"]`.
Record its `data-exploration-card-replacement-purged-entry-ids`,
`data-exploration-card-replacement-purged-card-ids`,
`data-exploration-card-replacement-gained-entry-ids`, and
`data-exploration-card-replacement-gained-card-ids` attributes. Assert that
each contains one UUID and that the gained card UUID equals the fixed
replacement UUID. The outcome becomes fully reviewed at
`[data-exploration-card-replacement-reviewed="true"]` and then returns to the
Dreamscape automatically.

Template 53 discloses exactly one inline card entity carrying both
`data-entity-id` and `data-exploration-deck-entry-id` before activation. The
outcome appears at
`[data-exploration-outcome="card-type-changes"][data-exploration-card-type-change-source="change-card-type-selected"][data-exploration-card-type-change-count="1"]`.
Assert that its entry/card UUID attributes equal the disclosed entity, its
`data-exploration-card-type-change-before-types` attribute is `Event`, its
`data-exploration-card-type-change-after-types` attribute is `Character`, and
the same deck entry remains present after the automatic change. The UUID
attributes are `data-exploration-card-type-change-entry-ids` and
`data-exploration-card-type-change-card-ids`.

Template 72 resolves to
`[data-exploration-outcome="card-acquisition"][data-exploration-reward-count="1"]`.
The sole
`[data-exploration-reward-object="card"][data-exploration-reward-id]` supplies
the exact persisted reward UUID; its descendant card has the same
`data-card-id` and `data-rarity="Legendary"`. The gained deck entry and
resolution log preserve that UUID.

The fixed-site redesigns prepare an append-only site in the current Dreamscape.
These URLs force the selected encounter and pin the room seed:

```text
# Template 41: append an unenhanced Duplication site
http://localhost:5174/?goto=exploration&card=1658d9a0-c3b0-4eb7-babc-4933acf362c4&seed=4101

# Template 42: append an unenhanced Shop site
http://localhost:5174/?goto=exploration&card=1b4d2adc-64ab-4020-bae6-b35321898bf0&seed=4201

# Template 43: append an unenhanced Dreamsign Bazaar site
http://localhost:5174/?goto=exploration&card=4cec92f2-9bac-4949-a602-cd0a44618aaf&seed=4301

# Template 44: append an unenhanced Transfiguration site
http://localhost:5174/?goto=exploration&card=2f5cc27f-db6e-4bc8-bfa2-eeacebae57f7&seed=4401

# Template 45: append an unenhanced Purge site
http://localhost:5174/?goto=exploration&card=ccbefadc-aab8-4f8c-a705-07bd70c91731&seed=4501
```

For browser QA, wait for
`[data-exploration-choices-state="revealed"]`, then activate the replacement
with `[data-testid="cumulus-exploration-choice-1"]` for templates 41, 44, and
45 or `[data-testid="cumulus-exploration-choice-0"]` for templates 42 and 43.
The persisted outcome appears at
`[data-exploration-outcome="site-insertion"][data-exploration-site-type="<SiteType>"]`.
After selecting the close control at
`[data-testid="cumulus-exploration-exit"]`, the Dreamscape contains the new
`[data-site-type="<SiteType>"]` node. In each selector, `<SiteType>` is exactly
`Duplication`, `Shop`, `DreamsignBazaar`, `Transfiguration`, or `Purge`.

The site-choice redesign prepares three distinct append-only destinations from
the live placeable-site pool:

```text
# Template 46: choose one of three prepared site types, append it, and route to it
http://localhost:5174/?goto=exploration&card=09332e5b-3b4e-458f-9df0-3fc0419f65c3&seed=4601
```

Wait for the revealed choices and activate
`[data-testid="cumulus-exploration-choice-1"]`. The follow-up appears at
`[data-exploration-followup="site-types"]` and contains
`[data-exploration-site-type-choices]`. It has exactly three distinct
`[data-exploration-site-type-choice="<SiteType>"]` options drawn from `Shop`,
`Purge`, `Transfiguration`, and `Duplication`. Each option contains a
nonterminal Cumulus node matching
`[data-site-node-presentation="choice"][data-site-type="<SiteType>"][data-interactive="true"]`.
Activating one option produces the site-insertion outcome for that exact type.
Closing the outcome returns to a Dreamscape with that site appended as its last
node; entering it follows the normal route for the chosen site type.

## Purchase-modifier Exploration encounters

The purchase-modifier encounters use `exploration-purchases`, which starts the
run at 101 Essence and places ordinary Shop and Dreamsign Bazaar nodes beside
the Exploration site. The player resolves the encounter, returns to the
Dreamscape, and enters those sibling sites through the same controls used in a
normal journey.

```text
# Template 56: every item in the next Shop is free, including rerolled inventory
http://localhost:5174/?goto=exploration-purchases&card=1b4d2adc-64ab-4020-bae6-b35321898bf0&seed=5601

# Template 82: lose half the current Essence, then receive three free purchases
http://localhost:5174/?goto=exploration-purchases&card=a7820b34-9fdc-46cc-8357-53c8caa056b1&seed=8201
```

For either URL, activate `[data-testid="cumulus-exploration-channel"]`, wait for
`[data-exploration-choices-state="revealed"]`, then activate
`[data-testid="cumulus-exploration-choice-1"]`.

For Template 56, assert the result at
`[data-exploration-outcome="shop-modifier"][data-exploration-shop-modifier="free-next-shop"]`.
Its `data-exploration-source-action-id` is
`0e0d5d1d-5c79-4352-b03a-2abe039680e5`. Wait for the outcome to complete and
return to the Dreamscape, then enter the
`[data-site-type="DreamsignBazaar"]` node first, and assert that
`[data-dreamsign-bazaar-gallery-region]` has no `data-shop-free-source`
attribute. Leave through `[data-testid="cumulus-dreamsign-bazaar-leave"]`, then
enter `[data-site-type="Shop"]`. The
`[data-card-shop-gallery-region][data-shop-free-source="next-shop"]` root and
the `[data-shop-free-purchase-status="next-shop"]` live status identify the
bound benefit. The status's `data-shop-free-source-action-id` preserves the same
action UUID. Activate `[data-testid="cumulus-card-shop-restock"]`; the paid
restock reduces Essence while the next-Shop source remains bound. Buying any
`[data-testid^="cumulus-card-shop-offer-"]` then leaves Essence unchanged and
uses the authoritative zero price on that rerolled item.

For Template 82, assert the result with the combined selector
`[data-exploration-outcome="shop-modifier"][data-exploration-shop-modifier="free-purchases"][data-exploration-free-purchase-count="3"]`.
The same element exposes `data-exploration-source-action-id` equal to
`c884d8d4-2f30-4dff-a59a-1823791c2189` and the exact Essence transition through
`data-exploration-essence-before="101"`,
`data-exploration-essence-spent="50"`, and
`data-exploration-essence-after="51"`. Wait for the automatic return and enter
Shop. Assert
`[data-card-shop-gallery-region][data-shop-free-purchases-remaining="3"]`, buy
one card offer, and assert that the attribute becomes `2` while Essence stays
51. Leave through `[data-testid="cumulus-card-shop-leave"]`, enter the
Dreamsign Bazaar, assert
`[data-dreamsign-bazaar-gallery-region][data-shop-free-purchases-remaining="2"]`,
and buy one `[data-testid^="cumulus-dreamsign-bazaar-offer-"]`. The remaining
count becomes `1` and Essence stays 51. Reload the current URL containing its
generated `game` parameter and assert the Bazaar root still reports `1`; that
reload resumes the room instead of rebuilding the fixture.

Across the two workflows, cover a desktop viewport and a narrow viewport, with
one pass using reduced motion. Before captures, assert the current URL and
viewport width. In every pass, verify the current gallery root, counter or
source attribute, Essence total, and `window.__caps` error buffer directly.

## Atlas layers

`?goto=atlasN` opens the Dream Atlas resting screen the UI labels **"Layer N"** —
the screen where the player is choosing among the column-N dreamscapes. The atlas
is a fixed 7-layer graph whose columns the UI numbers I–VII (1-indexed); column I
is the starter dreamscape the player begins inside and never rests on, so the
numbered scenes run **`atlas2` … `atlas7`** (`atlas7` is the boss-only frontier).
Because the columns are 1-indexed, "Layer N" is the 0-indexed frontier layer
`N - 1`, reached after completing `N - 1` dreamscapes (the "Battles won" counter
reads `N - 1`).

The state is built by replaying those real dreamscape completions through
`regenerateAtlasForProgress` — the same generate-then-`advanceAtlas` code path
the authoritative battle-victory reducer transition drives, and the same one
the in-atlas debug "regenerate" button uses. The run is then parked at the
post-victory resting state: `screen: atlas`, `currentDreamscape: null`, and
`completionLevel` matching the depth. Because each advance runs for real, the
reveal-two-layers-ahead rule
fires on every step, so the frontier always shows one layer ahead — the scene
never reproduces an impossible resting view where the next layer is still an
unseen dream. Node ids, dreamscape assignments, and the boss incarnation are
freshly generated each load (pair with `?seed=` for a fixed layout).

Plain `?goto=atlas` is the first real resting screen ("Layer II", reached after
completing the starter dreamscape) — the same screen as `atlas2` — and is the
natural entry point for boss-preview QA, since the boss node is revealed from that
depth onward.

`?goto=tutorial-atlas` opens that same first frontier as an authored tutorial
journey, including the delayed Mira guidance shown on the player's first Atlas
visit.

## Battle layers

`?goto=battleN` opens the Battle site inside the dreamscape on atlas **Layer N**,
for **`battle1` … `battle7`**. Like the `atlasN` scenes, the URL uses the UI's
one-indexed layer number while journey state stores the zero-indexed run depth:
`battle5` therefore enters a Layer V battle at `completionLevel: 4`.

Each scene builds its atlas by replaying the preceding real dreamscape
completions, enters an available dreamscape on the requested layer, marks its
non-Battle sites visited, and opens the Battle site. The route constructs the
opponent with the normal battle generator for that completion level, including
the layer-based deck tuning, Dream Avatar ability, Legendary access, and
Dreamsign schedule. This makes later scenes materially stronger; for example,
the Layer V opponent has an active ability and an active Dreamsign.

Every battle scene stops on the **Battle Start** screen that previews the
opposing Dream Avatar, ability, Dreamsigns, and signature cards. Select **Begin
Battle** to enter the playable board. Plain `?goto=battle` is the same Layer I
entry point as `battle1`.

`?goto=tutorial-battle1` and `?goto=tutorial-battle2` open the tutorial
journey's first and second Battle Start screens, including their delayed Mira
guidance.

`?goto=battle-playable` mounts the Layer I playable board directly with three
owned Dreamsigns for layout and interaction QA.

## Draft site

`?goto=draft` retypes a starter-dreamscape site to the `Draft` type and parks the
run on it. The QA foundation seeds a valid `draftState`, so on entry the draft
screen rolls its first offer and paints a real card pack over the starter
dreamscape, with the floating `Draft (n/total)` pick counter beneath it. The
Cumulus layout is a 2×2 pack on mobile and a four-card row on desktop. Picking a
card mints and paints the next offer and advances the counter; exhausting the
pack completes the site and returns to the dreamscape overview.

Pair this scene with `&deviceFrame=iphone16` to render the phone chrome for
framed mobile QA, e.g.:

```
http://localhost:5174/?goto=draft&deviceFrame=iphone16
```

## Standalone tutorial scenes

`?goto=tutorial-battle` opens the live tutorial battle directly, and
`?goto=tutorial-victory` opens its animated victory payoff. These routes mount
the standalone tutorial runtime rather than bootstrapping a `QA_SCENES` journey
snapshot. New Journey on the victory payoff resets the shared journey slice to
the fixed tutorial Dream Avatar selection and enters the journey runtime in the
same room.

## Registered scenes

The source of truth is `QA_SCENES` in `src/runtime/qa-scenes.ts`.

| `?goto=` id                     | Screen                                                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dream-avatar-select`            | Choose-your-Dream Avatar screen a run opens on (`journeyStart`), without the lobby                                                                                                                                 |
| `tutorial-dream-avatar-select`   | Tutorial Dream Avatar selection with only `bfc40414-5264-41bf-86e1-a0f41ee4f5b5` shown, centered beside its three authored Valor tides; choosing it starts a journey with their 150-card pool                    |
| `atlas`                         | Dream Atlas resting screen at the first frontier the UI labels "Layer II" (one dreamscape completed), with a generated boss node and Apollyon incarnation (atlas UI + boss-preview QA); same screen as `atlas2` |
| `tutorial-atlas`                | Tutorial journey's first Dream Atlas visit, including the delayed Mira guidance                                                                                                                                |
| `atlas2` … `atlas7`             | Dream Atlas resting screen the UI labels "Layer N", with the available frontier on column N (see "Atlas layers" below)                                                                                          |
| `battle`                        | Layer I Battle Start opponent preview; same scene depth as `battle1`                                                                                                                                            |
| `tutorial-battle1`              | Tutorial journey's Layer I Battle Start preview, including the delayed Mira guidance                                                                                                                           |
| `tutorial-battle2`              | Tutorial journey's Layer II Battle Start preview, including the delayed Mira guidance                                                                                                                          |
| `battle-playable`               | Layer I playable battle board with owned Dreamsigns                                                                                                                                                             |
| `battle1` … `battle7`           | Battle Start opponent preview for the keeper battle on atlas Layer N, with layer-tuned opponent strength (see "Battle layers")                                                                                  |
| `dreamscape`                    | Starter dreamscape overview with site nodes and the JourneyStatusBar                                                                                                                                              |
| `dreamscape-with-essence`       | Starter dreamscape overview with an Essence site ready to enter (site-entry animation QA)                                                                                                                       |
| `deckviewer`                    | Deck viewer overlay opened over the starter dreamscape (deck grid + press-and-hold zoom)                                                                                                                        |
| `poolviewer`                    | Pool Viewer overlay opened over the starter dreamscape (source/filter controls, card gallery, and responsive frame)                                                                                             |
| `startingdeck`                  | Starting-deck reveal popup over the starter dreamscape (frosted-glass chrome QA)                                                                                                                                |
| `draft`                         | Draft site — the Cumulus draft screen with a rolled first offer and the floating `Draft (n/total)` pick counter (mobile-gated; see "Draft site" below)                                                          |
| `transfiguration`               | Transfiguration site                                                                                                                                                                                            |
| `transfiguration-enhanced`      | Transfiguration site, enhanced                                                                                                                                                                                  |
| `duplication`                   | Duplication site                                                                                                                                                                                                |
| `duplication-enhanced`          | Duplication site, enhanced (whole deck offered)                                                                                                                                                                 |
| `purge`                         | Purge site                                                                                                                                                                                                      |
| `purge-enhanced`                | Purge site, enhanced (discounted removals)                                                                                                                                                                      |
| `shop`                          | Shop site                                                                                                                                                                                                       |
| `shop-enhanced`                 | Shop site, enhanced (free restock, signature-tide cards)                                                                                                                                                        |
| `dreamsignbazaar`               | Dreamsign Bazaar site                                                                                                                                                                                           |
| `dreamsignbazaar-enhanced`      | Dreamsign Bazaar site, enhanced (free restock)                                                                                                                                                                  |
| `augury`                        | Augury site                                                                                                                                                                                                    |
| `augury-enhanced`               | Augury site, enhanced flag (same UI as regular)                                                                                                                                                                |
| `reward`                        | Dreamscape overview with a Reward site ready for inline collection                                                                                                                                              |
| `reward-at-cap`                 | Dreamscape Reward with a full Dreamsign collection and a pending replacement dialog                                                                                                                             |
| `random-site`                   | A materialized enhanced destination hosted by Random Site's configured presenting guide                                                                                                                       |
| `random-site-home`              | Random Site's configured home behavior with its persisted destination choices                                                                                                                                |
| `random-site-atlas`             | The first Dream Atlas frontier containing the configured Random Site owner's dreamscape, badge, and reveal cards                                                                                             |
| `gamble`                        | Gamble site; the game is selected randomly or fixed with `?gambleGame=three-gate`, `?gambleGame=ladder-climb`, `?gambleGame=starway-stairs`, `?gambleGame=four-suit-reprise`, or `?gambleGame=blackjack`                              |
| `gamble-enhanced`               | Farpoint Gamble site with the selected game’s discounted cost rule                                                                                                                                              |
| `exploration`                   | Exploration card-channeling site                                                                                                                                                                               |
| `exploration-enhanced`          | Exploration card-channeling site, enhanced                                                                                                                                                                     |
| `exploration-duplicates`        | Exploration card-channeling site with two duplicated card UUIDs in the QA deck                                                                                                                                |
| `exploration-purchases`         | Exploration card-channeling site at 101 Essence with ordinary Shop and Dreamsign Bazaar siblings for purchase-modifier workflow QA                                                                           |
| `dreamsign-revelation`          | Dreamsign Revelation site                                                                                                                                                                                       |
| `dreamsign-revelation-enhanced` | Dreamsign Revelation site, enhanced (four choices)                                                                                                                                                              |
| `journeycomplete`                 | Journey victory end screen (completion stats + final-deck reveal)                                                                                                                                                 |
| `journeyfailed`                   | Journey defeat end screen (failure summary)                                                                                                                                                                       |

## Combining with other parameters

`?goto=` composes with the other runtime parameters documented in
`url_parameters.md` (read once at page load, not reactive). For example, pair it
with `?seed=` for a fixed RNG seed. Use `?goto=gamble&gambleGame=ladder-climb` for a
stable Ladder Climb QA entry point, or `?goto=gamble&gambleGame=starway-stairs`
for Starway Stairs. Use `?goto=gamble&gambleGame=four-suit-reprise` for a
stable Four-Suit Reprise entry point.
Use `?goto=gamble&gambleGame=blackjack` for a stable Blackjack entry point.

## Adding a scene

Register a `QaScene` in `QA_SCENES` (`src/runtime/qa-scenes.ts`). For a site
screen, use the `siteScene(id, label, siteType, isEnhanced?)` helper. The URL
handling, auto-create, and bootstrap mutation are generic and need no further
changes — a new scene id becomes reachable at `?goto=<id>` immediately. Add a row
to the table above so the option is documented.

## Devtool demos (`?demo=`)

`?demo=<name>` is a parallel hook to `?goto=`: instead of bootstrapping a full
journey room and parking it on a screen, it mounts a standalone demo component in
place of `<App>`, bypassing the whole journey workflow. The dispatch lives in
`src/main.tsx` (`demoParam === "<name>"`), so a demo needs no room, no
`JourneyState`, and no multiplayer gate.

`?demo=device-frame` mounts `DeviceFrameDemo`
(`src/cumulus/screens/devtools/DeviceFrameDemo.tsx`), the browser-QA page that
proves the device-frame safe-area injection end to end. It renders a title band
padded by `var(--safe-area-inset-top)` so the "Your Deck" title clears the
Dynamic Island, and a control parked to the right of the island from the
`--display-cutout-*` box, with dashed cyan guides tracing the injected safe-area
band and the cutout's bounding box — so a single screenshot shows the injected
metrics line up with the painted island. On a target with no cutout (for example
iPhone SE) the island guide and the island-relative control are omitted.

Capture it through the device-screenshot tool, which supplies the `deviceFrame`
metrics the demo reads:

```
node scripts/device-screenshots.mjs -d iphone-16 --query 'demo=device-frame'
```

`?demo=entity-reveals` mounts the deterministic entity-reveal conformance page.
It uses fixed UUID-backed fixtures and the public named Cumulus components for a
popup GameCard, press-in-place GameCard, strict InfoCard content, glossary term,
unavailable card, Atlas node, and battle card. Its semantic scenario controls
arrange top-edge, side-fallback, truncation, best-effort, reduced-motion, and
simulated-safe-area cases for browser QA while the coordinator continues to own
all placement and gesture mechanics.

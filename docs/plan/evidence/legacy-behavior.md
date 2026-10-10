# Legacy battle behavior (pre-deletion record)

This file records what the prototype battle sandbox code implemented for each
card it automated. It was captured at commit `8b1d9e824`
(`8b1d9e8243b0ed114d47872dc03c6d97b0e1f7c6`), the last commit that contains
that code on the journey path. Every source path below is relative to the
repository root at that OID and is readable with
`git show 8b1d9e824:<path>`. Line numbers are from that OID.

Phase 5 content batches read this file when they re-implement a card on the
rules engine (`src/engine/`). The behavior here is what the old code did, not
the engine's intended rules. The card catalogs (`src/content/cards/`,
`src/content/dreamwell/`) and `docs/rules.md` are authoritative for rules.
Rows are keyed by UUID; names are display aids only and are not unique.

Shared vocabulary for the tables:

- **Pick prompt**: a `pick-cards` prompt. It is mandatory: the resolver must
  choose `min(count, candidates)` cards. A pick with zero candidates resolves
  as an empty pick inside the opening event and the script continues
  (`src/rules/battle/driver.ts` `runQueue`).
- **Confirm**: a two-option choice, Yes (index 0) or Skip (index 1). Yes runs
  the nested `onYes` steps; Skip ends that branch.
- **Draw**: a `DRAW_CARD` edit. Drawing from an empty deck applies Fatigue
  instead: the opponent scores `2^fatigueCount` ⍟ and the count increments
  (`src/rules/battle/apply-debug-edit.ts` `drawCardToHand`).
- **Leftmost open back-rank slot**: `selectDefaultCharacterPlaySlot` in
  `src/battle/state/selectors.ts`.
- **Script-driven move into play**: a `MOVE_CARD_TO_ZONE` applied by an effect
  script. It charges no energy, does not exhaust the card, and fires the
  card's `materialized` trigger.
- `DWT` is `src/rules/battle/dreamwell-effects-table.ts`; `BCT` is
  `src/rules/battle/battle-card-effects-table.ts`.

## Dreamwell cards

Each row starts with the card's `energyAdded` and tier (`order`) from the
catalog. Every Dreamwell card was registered in `DWT`
(`DREAMWELL_EFFECT_SCRIPTS`), so `dreamwellAutomationStatus` reported `auto`
for all 33. "Self" is the side that revealed the card.

| UUID | Name (display aid) | Behavior the old code implemented | Source path(s) at 8b1d9e824 |
| --- | --- | --- | --- |
| `5ec17498-9028-4a01-80a0-67c91b03d505` | Meteor Meadow | +1 max ●, order 2. Self draws 1. | `DWT` L340-344; `src/content/dreamwell/meteor-meadow-5ec17498.ts` |
| `f9b479cf-02cb-40e1-bb64-70b29977bf15` | Skypath | +1 max ●, order 1. Opens a Foresee 1 prompt for self: reveals the top deck card to self (`REVEAL_DECK_TOP`), then the resolution keeps it on top or puts it into the void (`FORESEE` edit). | `DWT` L948-952; `src/rules/battle/effect-runner-core.ts`; `src/content/dreamwell/skypath-f9b479cf.ts` |
| `02e8ea92-1218-413c-9f0b-4c865a3921d3` | Autumn Glade | +1 max ●, order 1. Self gains 2 ⍟ (`ADJUST_SCORE`). Reaching the score target ends the battle immediately (`scoreTerminalResult`). | `DWT` L346-350; `src/content/dreamwell/autumn-glade-02e8ea92.ts` |
| `de98477c-e216-4618-bff1-0e24bd982fdb` | Twilight Radiance | +1 max ●, order 1. Self gains 1 current ● (`ADJUST_CURRENT_ENERGY`, not capped at max). | `DWT` L352-356; `src/content/dreamwell/twilight-radiance-de98477c.ts` |
| `ee1ef770-29ea-4a63-a1f9-7e97b5b8870d` | Astral Interface | +1 max ●, order 1. Self draws 1, then a pick prompt (key `discard-drawn-card`, count 1) over self's whole hand discards 1; the just-drawn card (last hand entry) is highlighted. | `DWT` L542-573; `src/content/dreamwell/astral-interface-ee1ef770.ts` |
| `cf0f0a05-2a94-407c-8c22-e41b925f9c03` | Glimmering Horizon | +1 max ●, order 2. Self draws `max(0, 2 - hand size)` cards. | `DWT` L399-405 (`drawUntilEdits` in `src/rules/battle/effect-step.ts`); `src/content/dreamwell/glimmering-horizon-cf0f0a05.ts` |
| `fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5` | Ruin Tree | +1 max ●, order 3. Confirm (key `confirm-play-void-character`). On Yes: pick prompt (key `choose-void-character`, count 1) over self's void characters with printed `energyCost <= 2`; the chosen card is a script-driven move into self's leftmost open back-rank slot (no cost, not exhausted, `materialized` fires). If no slot is open, nothing moves. | `DWT` L954-1001; `src/content/dreamwell/ruin-tree-fcce7aa2.ts` |
| `558a1f1b-7dc1-4d83-9f00-c6af2187a954` | Lily Lake | +1 max ●, order 3. Self immediately draws the next shared Dreamwell card (`DRAW_DREAMWELL_CARD` with `additional: true`). The extra card raises self's max ● by its `energyAdded` and refills current ● to the new max, becomes self's displayed Dreamwell card, advances the shared deck index, and queues its own script after this one. | `DWT` L200-216; `src/rules/battle/driver.ts` `applyEdits`; `src/rules/battle/apply-debug-edit.ts` `drawDreamwellCard`; `src/content/dreamwell/lily-lake-558a1f1b.ts` |
| `14dec460-3ec6-40c1-978f-67e70cb0b227` | Firmament Mirror | +1 max ●, order 2. Pick prompt (key `grant-reclaim`, with subtitle, count 1) over every card in self's void (any kind). The chosen card gets status `temporaryReclaimUntilEnding {activeSide, turnNumber, sourceId}`. While the active side and turn match, the card may be played from the void through the manual play path: it pays its energy cost, gets `reclaimed: true` (leaving play later banishes it instead of voiding it), and a character enters exhausted. Void-play timing: owner's Day, or for a fast card owner's Day/Night or opponent's Dusk (`voidPlaySourceIsLegal`). An event "played" this way stays in the void (the void-to-void move is a no-op) and its `played` trigger does not fire. The status is cleared at that turn's Ending. The semantic play path (`BATTLE_PLAY_CARD`) only plays from hand, so it cannot use the grant. | `DWT` L298-338; `src/rules/battle/temporary-effects.ts`; `src/rules/battle/basic-automation.ts` `planCardPlay`; `src/rules/battle/battle-events.ts` `voidPlaySourceIsLegal` L1425, `settleTemporaryDreamwellEffects` L2390; `src/content/dreamwell/firmament-mirror-14dec460.ts` |
| `03e4e701-4720-4278-8198-9b7e0514d4cf` | Shadow Passage | +1 max ●, order 1. Erode 3 on self: the top 3 deck cards move to self's void; each missing card applies Fatigue instead. | `DWT` L375-384; `src/rules/battle/apply-debug-edit.ts` `erodeDeck`; `src/content/dreamwell/shadow-passage-03e4e701.ts` |
| `662b7393-751c-4aa9-8150-5f20b4d176a4` | Summer Blossom | +2 max ●, order 2. No scripted effect (registered with `steps: []`, so no run is queued); only the reveal energy. | `DWT` L193-198; `src/content/dreamwell/summer-blossom-662b7393.ts` |
| `7171ff89-ebe4-42d0-8863-9b4b0531cad2` | The Voltsurge | +1 max ●, order 3. Player draws 2, then enemy draws 2 (fixed order regardless of who revealed it). | `DWT` L364-373; `src/content/dreamwell/the-voltsurge-7171ff89.ts` |
| `fa8704fe-759f-408d-992d-d8f9d5ffd760` | Sunset's Last Gaze | +1 max ●, order 3. Confirm (key `discard-and-draw`, count 2). On Yes: pick prompt (key `choose-discards`, count 2) over self's hand discards `min(2, hand size)` cards, then self draws 2 regardless of how many were discarded. Skip does nothing. | `DWT` L600-638; `src/content/dreamwell/sunset-s-last-gaze-fa8704fe.ts` |
| `2b23a60c-209c-4c75-b63c-b7f73b2e1a56` | Leaf Light Canopy | +1 max ●, order 3. Pick prompt (key `return-void-card`, count 1) over every card in self's void; the chosen card moves to self's hand. | `DWT` L640-668; `src/content/dreamwell/leaf-light-canopy-2b23a60c.ts` |
| `9954cede-8a16-4053-b6e9-da745f4540f5` | Silent Winter | +0 max ●, order 3. Pick prompt (key `banish-enemy-character`, count 1) over the opponent's characters in both ranks. The target gets status `temporaryBanishUntilEnding {activeSide, turnNumber, priorOwner, priorController, sourceId}` and moves to its owner's banished zone (no `dissolved` trigger; a figment stack loses its topmost member instead and that member does not return). At the Ending of the same turn the card returns to `priorController`'s leftmost open back-rank slot (fires `materialized`) and the status clears. If that back rank is full, the card stays banished with its status kept. | `DWT` L700-744; `src/rules/battle/battle-events.ts` `settleTemporaryDreamwellEffects` L2390 and its call in `applyBattleCommandStep` L964-982; `src/content/dreamwell/silent-winter-9954cede.ts` |
| `3a4293da-55a1-4094-898a-df402ffa1c92` | Shining Beacon | +0 max ●, order 3. Pick prompt (key `pick-card-for-hand`, count 1) over the top 2 cards of self's deck; the chosen card goes to hand and the other (if any) to the bottom of self's deck. With 1 card it is forced; with an empty deck nothing happens. | `DWT` L746-789; `src/content/dreamwell/shining-beacon-3a4293da.ts` |
| `d585b78a-dfe3-4e12-95ac-432c3c880540` | Prismatic Pastures | +0 max ●, order 4. Self gains 3 current ● (not capped). | `DWT` L358-362; `src/content/dreamwell/prismatic-pastures-d585b78a.ts` |
| `a3033051-8eb7-4fbf-93d6-f947ed68974d` | Celestial Gateway | +1 max ●, order 4. For player, then enemy: if that side has a character in its void and an open back-rank slot, one void character chosen uniformly with the event RNG makes a script-driven move into that side's leftmost open back-rank slot (no cost, not exhausted, `materialized` fires). A side with no void character or no open slot is skipped. No prompt. | `DWT` L511-536; `src/content/dreamwell/celestial-gateway-a3033051.ts` |
| `556057bb-b134-497e-86c2-c6f30049e9e3` | Luminous Enigma | +1 max ●, order 4. Confirm (key `confirm-void-to-deck`). On Yes: pick prompt (key `choose-void-for-deck`, count 1) over every card in self's void; the chosen card goes to the top of self's deck. | `DWT` L791-835; `src/content/dreamwell/luminous-enigma-556057bb.ts` |
| `20be0fdd-d691-40a9-b4f8-15689ea7ebaa` | The Bastion | +0 max ●, order 4. Confirm (key `confirm-abandon-and-draw`, count 2). On Yes: pick prompt (key `choose-character-to-abandon`, count 1) over self's characters in both ranks; the chosen one gets an `ABANDON` edit (to void, fires `abandoned`; a figment stack loses its topmost member). Then self draws 2. The draw still happens when self has no character to abandon. Skip does nothing. | `DWT` L837-873; `src/rules/battle/apply-debug-edit.ts` `abandonCard`; `src/content/dreamwell/the-bastion-20be0fdd.ts` |
| `a57f1276-3fb6-4527-b538-953fbace35cf` | Eternal Horizon | +0 max ●, order 4. Each of self's characters in both ranks gets `sparkDelta + 1` (permanent; no duration). | `DWT` L467-489; `src/content/dreamwell/eternal-horizon-a57f1276.ts` |
| `f61431f3-33bd-42ff-a229-b4013582e86e` | Ringvale | +1 max ●, order 2. Discover: when the prompt opens, one event-RNG draw seeds a local LCG that shuffles self's deck cards with printed `energyCost <= 2` (any card kind) and offers up to 3. Pick prompt (key `discover-card`, `maximum_cost: 2`, count 1). The chosen card moves to hand, then self's remaining deck is reordered by a deterministic shuffle seeded from an FNV hash of the offered ids and the choice. The fold rejects a choice that is no longer in the deck or no longer costs `<= 2`. | `DWT` L45-153, L218-246; `src/rules/battle/battle-events.ts` `DISCOVER_ANY_LOW_COST_SCRIPT_ID` L773 and `promptResolutionIsValid` L3497; `src/content/dreamwell/ringvale-f61431f3.ts` |
| `51caf26d-83bf-45a9-bc80-010d353277db` | Nomad's Verge | +1 max ●, order 1. Creates one Ethereal figment for self (`CREATE_FIGMENT`, subtype `Ethereal`, spark 1) in self's leftmost open back-rank slot; in the tutorial battle, the open back-rank slot nearest the center. It enters exhausted (Ethereal has no catalog keyword). Skipped when no slot is open. No Ethereal-specific behavior was implemented. In the tutorial, an enemy reveal of this card triggers the authored AI override that plays Twilight Troubadour. | `DWT` L439-465, `selectTutorialCenterBackRankSlot` L166; `src/battle/state/figment-catalog.ts`; `src/content/tutorial.ts` `aiActionOverrides`; `src/content/dreamwell/nomad-s-verge-51caf26d.ts` |
| `eae99eb2-0fa8-4d12-b7b2-3f5387cb6d3a` | Ember Cavern | +1 max ●, order 1. Reveals every card currently in the opponent's hand to self (`SET_SIDE_HAND_VISIBILITY`). Cards drawn later are not revealed, and the reveal never expires. | `DWT` L421-437; `src/rules/battle/apply-debug-edit.ts` `setSideHandVisibility`; `src/content/dreamwell/ember-cavern-eae99eb2.ts` |
| `a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf` | Broken Aqueduct | +2 max ●, order 3. The opponent's max ● increases by 1 (`ADJUST_MAX_ENERGY`); its current ● is unchanged until its next reveal refill. | `DWT` L386-397; `src/content/dreamwell/broken-aqueduct-a9c254c4.ts` |
| `2ad68489-044a-40d1-9be6-e62497a4e1fd` | Echoing Boughs | +1 max ●, order 3. Pick prompt (key `rematerialize-ally`, count 1) over self's characters in both ranks; the chosen card gets a `REMATERIALIZE` edit. That edit changes no state; it only queues the card's `rematerialized` trigger script. No production card registered a `rematerialized` trigger (and `materialized` is not re-run), so in practice the effect did nothing beyond the log. | `DWT` L275-297 (`ECHO_CASCADE_ID`); `src/rules/battle/apply-debug-edit.ts` `rematerializeCard`; `src/rules/battle/driver.ts` `scheduleEffectLifecycleEdge`; `src/content/dreamwell/echoing-boughs-2ad68489.ts` |
| `af2ef62f-d31b-4544-a2b0-f5aab03c2d7c` | Centennial Square | +0 max ●, order 4. Choice prompt (key `choose-benefit`, `amount: 2`): option `draw-card` = self draws 1; option `gain-energy` = self gains 2 current ●. | `DWT` L875-911; `src/content/dreamwell/centennial-square-af2ef62f.ts` |
| `91deefd2-0400-4c78-ab9f-f6db864ff7e2` | Ancient Mine | +1 max ●, order 1. Self gains 2 current ●, then a pick prompt (key `discard-card`, count 1) over self's hand discards 1 (skipped if the hand is empty). | `DWT` L575-598; `src/content/dreamwell/ancient-mine-91deefd2.ts` |
| `8f5f2e26-44b5-447b-90d0-eaf22ab29fed` | Azure Cascade | +0 max ●, order 3. Discover, as Ringvale but the filter is `battleCardKind === "character"` (any cost). Pick prompt (key `discover-character`, count 1); chosen card to hand, the remaining deck is reordered by the same deterministic hash shuffle. The fold rejects a choice that is no longer a character in the deck. | `DWT` L248-273; `src/rules/battle/battle-events.ts` `DISCOVER_CHARACTER_SCRIPT_IDS` L776 and `promptResolutionIsValid` L3497; `src/content/dreamwell/azure-cascade-8f5f2e26.ts` |
| `a0fbcbd9-96ee-4392-add7-e1d436f99553` | Rusted Edifice | +1 max ●, order 3. Pick prompt (key `return-event`, count 1) over event cards in self's void; the chosen card moves to self's hand. | `DWT` L670-698; `src/content/dreamwell/rusted-edifice-a0fbcbd9.ts` |
| `06e62e45-53f9-4264-9aa6-2575b445332a` | Overgrown Passage | +2 max ●, order 3. Player draws until its hand has at least 3 cards, then enemy does the same (both computed from the hand sizes before either draw). | `DWT` L407-419; `src/content/dreamwell/overgrown-passage-06e62e45.ts` |
| `120ec4c2-aa7b-48f4-be9f-f39820e565ca` | Sunset Pool | +1 max ●, order 3. Self draws 1; a second step then reads the last card in self's hand and, if it is a character, self gains 1 current ●. When the draw fails (empty deck, Fatigue) the check reads whatever card was already last in hand. | `DWT` L491-509; `src/content/dreamwell/sunset-pool-120ec4c2.ts` |
| `446095b1-ec4d-40d7-8eed-a8221d339ea2` | Fortune's Wheel | +0 max ●, order 4. Confirm (key `redraw-hand`). On Yes: self discards its whole hand (N cards), then draws N. Skip does nothing. | `DWT` L913-946; `src/content/dreamwell/fortune-s-wheel-446095b1.ts` |

The code comments in `DWT` call several cards by other names (for example
"The Brimming Well", "Wellspring Commons", "Stillwater Mirror", "Foxfire
Thicket", "Twin Moons", "Emberwake Flats", "Verdant Hollow", "The Crossroads",
and the constant `ECHO_CASCADE_ID`). The UUID in each entry is what the code
keyed on; the names above come from the catalog.

### Shared Dreamwell mechanics in the old code

- **Deck**: one shared deck for both sides. `buildDreamwellDeck` repeats
  cycles that each take `cardsPerRecurringOrder` shuffled cards from each
  order in `recurringOrders` (tunables from `OpponentsData.dreamwell`) until
  the deck reaches `minimumConstructedLength`
  (`src/battle/integration/create-battle-init.ts`). The tutorial uses a fixed
  `dreamwellDraws` prefix (`src/content/tutorial.ts`).
- **Reveal timing**: a side reveals one card per turn from turn number 2
  (`drawsDreamwellCardAtStartOfTurn`, `src/battle/state/turn-utils.ts`), during
  the `dreamwell` phase. `drawDreamwellCard` is idempotent per side and turn
  unless `additional` is set (`src/rules/battle/apply-debug-edit.ts`).
- **Energy**: `planDreamwellReveal` emits `SET_MAX_ENERGY` to
  `max + energyAdded` and `SET_CURRENT_ENERGY` to the new max (a full refill,
  even when `energyAdded` is 0) before the reveal edit
  (`src/rules/battle/basic-automation.ts`; `dreamwellEnergyEdits` in
  `src/battle/engine/energy.ts`). Max ● is uncapped there.
- **Script queueing**: `applyBattleCommandStep` queues the revealed card's
  script for the revealing side when the reveal edge lands in the `dreamwell`
  phase, the turn number is above 1, the battle is unresolved, and the script
  has steps (`src/rules/battle/battle-events.ts` L1001-1033). An `additional`
  draw inside a script queues its card's script from `applyEdits`
  (`src/rules/battle/driver.ts`).
- **Ordering against the turn draw**: a prompt parks the battle in the
  `dreamwell` phase. The turn's normal draw happens only when the flow leaves
  `dreamwell` (`planDreamwellExit`), so Dreamwell effects see the hand and deck
  before that draw. The first player's turn 1 skips the draw.
- **Driver**: scripts are step lists of `edits` and `prompt` steps
  (`src/rules/battle/effect-step.ts`), walked by a path cursor that descends
  into `confirm.onYes` (`src/rules/battle/driver.ts`), with prompt planning and
  resolution in `src/rules/battle/effect-runner-core.ts`. Zone moves made by
  script edits schedule `played`/`materialized`/`dissolved`/`abandoned`/
  `rematerialized` lifecycle runs. After every edit the score target is
  checked and can end the battle mid-script.
- **Prompt copy**: prompt keys map to player-facing copy in
  `DREAMWELL_AUTOMATION_PROMPTS`, keyed by Dreamwell UUID
  (`src/data/dreamwell-prompts.ts`). Confirm buttons use the built-in
  `confirm-yes`/`confirm-skip` copy.
- **Temporary effects**: Firmament Mirror's reclaim grant and Silent Winter's
  banish are serialized card statuses settled at the handoff out of the
  granting turn (`settleTemporaryDreamwellEffects`, in card-id order, with
  lifecycle edges scheduled for the return moves).
- **Who resolves prompts**: the human resolves them in the battle UI
  (`src/battle/components/PlayableBattleScreen.tsx`). The only automatic
  resolver is the tutorial controller's `deterministicPromptResolution`
  (lowest sorted candidate ids, choice/confirm option 0, Foresee keeps order)
  in `src/battle/tutorial-battle-controller.ts`. The old AI had no Dreamwell
  heuristics.
- **Tutorial presentation**: in the tutorial battle a reveal opens a
  `dreamwell-reveal` presentation before the script drains
  (`src/rules/battle/battle-events.ts` L1035-1072).

## Semantically automated cards

Sources: `BATTLE_TRIGGERED_EFFECTS` (lifecycle trigger scripts with
rules-text hashes) and `BATTLE_CARD_EFFECT_SCRIPTS` (Support) in `BCT`;
`src/battle/semantic-play-card-ids.json` (cards accepted by the semantic
`BATTLE_PLAY_CARD` path); card-specific branches in `BCT`
`planStaticContributionSettlement`, `src/battle/semantic-play.ts`,
`src/battle/starter-card-targets.ts`, and `src/rules/battle/battle-events.ts`.
`src/rules/battle/basic-automation.ts` has no card-specific branch.

Common rules for these rows:

- **Semantic play** (`battlePlayCardInternal`, `src/rules/battle/battle-events.ts`
  L1552): only for cards in `semantic-play-card-ids.json`; the card must be in
  its controller's hand, the controller active, phase Day, the card not fast,
  and current ● at least its cost; targets must pass
  `semanticPlayTargetsAreLegal` (no targets for every card except
  Flashpoint Detonation and Worlds Await). Cost is paid, a character goes to
  the requested empty own back-rank slot or the leftmost open one and is
  exhausted, an event goes to the void. Lifecycle triggers are queued with the
  chosen targets as bindings.
- **Triggers** are scheduled from observed zone edges: `played` (event leaving
  hand), `materialized` (into either rank from elsewhere), `dissolved` (from
  play to void by anything except `ABANDON`), `abandoned` (`ABANDON`), and
  `dawn` (each of the active side's in-play cards when Dawn is entered, once
  per controller turn). A card with a reclaimed status leaving play is
  banished, so it fires neither `dissolved` nor `abandoned`.
- **Support** (`planStaticContributionSettlement`, recomputed after every
  command and prompt resolution): a supporter in back-rank slot `Bi` adds its
  bonus to the `staticSparkBonus` of own front-rank characters in `F(i-1)` and
  `Fi` (`supportedDeploySlots`, `src/battle/engine/support.ts`) that pass its
  `applies` filter. Subtype filters compare `definition.subtype` exactly.
  Only the Support clause of each Support card was automated; the card's other
  text was not.
- **Old AI**: modules in `src/battle/ai/cards/` are keyed by card number
  (510-519), not UUID. Every character model is playable when affordable and
  is placed in the AI back-rank slot nearest the center.

| UUID | Name (display aid) | Behavior the old code implemented | Source path(s) at 8b1d9e824 | Old AI notes |
| --- | --- | --- | --- | --- |
| `5a980eff-6ec7-44d8-9977-b98e66bbc2c8` | Nocturne Strummer | Support: +2 to every supported front-rank ally. Triggered-table entry has no triggers (hash `a4a7189e`). Semantic play. | `BCT` L83-87 and L352-356; `src/battle/semantic-play-card-ids.json` | #510. `supportSpark` returns 2, fed into the AI's `buildSupportContribution` (the only support the AI forward model counts). |
| `647f5150-b2e0-424b-9480-27557642524e` | Ringwatcher | `materialized`: Foresee 1 prompt for the controller (top card revealed to the controller, kept on top or put into the void). Fires on any entry into play, including script-driven moves. Semantic play. | `BCT` L88-94; `src/battle/semantic-play-card-ids.json` | #511. Body only; the Foresee is not modeled. |
| `e83014d3-9d35-4e80-a1b3-9b25360ad2af` | Marked Direwolf | Vanilla; triggered-table entry with no triggers (hash `811c9dc5`, the empty text). Semantic play. | `BCT` L95-99; `src/battle/semantic-play-card-ids.json` | #512. Vanilla body. Also the stand-in card the AI adds to hand when it models Sign of Arrival. |
| `a28ad36d-fa74-4190-a463-7efd3a6233d0` | Runebound Champion | `dawn`: controller gains 1 ⍟ (can end the battle). Semantic play. | `BCT` L100-111; `src/battle/semantic-play-card-ids.json` | #513. Body only; the Dawn score is not modeled. |
| `a526fa7b-5cef-4da9-a3f2-27ee0bd9b481` | Final Witness | `dissolved` and `abandoned`: controller draws 1. Semantic play. | `BCT` L112-129; `src/battle/semantic-play-card-ids.json` | #514. Body only; the draw is not modeled. |
| `5ab11bef-5dcd-49f5-be49-ae2ccde76e70` | Rusted Colossus | While in a front-rank slot `Fj`, gets +2 `staticSparkBonus` for each occupied own back-rank slot among `Bj` and `B(j+1)` (`supportingReserveSlots`); the occupant need not have Support. Triggered-table entry has no triggers (hash `42ad9866`). Semantic play. | `BCT` L130-134 and `planStaticContributionSettlement` L497-518; `src/battle/semantic-play-card-ids.json` | #515, module `wildflower-colossus.ts`. Body only; its static is not modeled. Worlds Await's AI breaks spark ties toward #515. |
| `4408b942-09a0-4f4e-a403-10c708c6e3c5` | Flashpoint Detonation | Semantic play requires exactly one target: a character in either rank, controlled by the opponent, printed `energyCost <= 2`. `played`: if the target has `veil`, the veil is removed instead; otherwise the target moves to the void of the caster's opponent (fires its `dissolved`; a figment stack loses its topmost member; a reclaimed card is banished). With no legal target the play is rejected (the tutorial shows authored `card-no-valid-targets` guidance when one matches). | `BCT` L135-172; `src/battle/semantic-play.ts` L25-38; `src/battle/starter-card-targets.ts`; `src/battle/semantic-play-card-ids.json` | #516. Playable only when affordable and some enemy body costs `<= 2`. Target: among legal bodies prefer front-rank ones, then the highest effective spark. |
| `2162742c-09d0-4e62-ae49-0f8f79b45adc` | Glimpse of What Was | `played`: controller draws 1, then a Foresee 1 prompt. Semantic play. | `BCT` L173-185; `src/battle/semantic-play-card-ids.json` | #517. Models draw-top then Foresee: bins the top card to the bottom if its cost exceeds AI max ● + 1 or it duplicates a card number in hand (`foresee` in `helpers.ts`). |
| `910b4cf9-dec7-4e03-af4f-7d5ae342eeba` | Sign of Arrival | `played`: Discover a character. When the prompt opens, one event-RNG draw seeds an LCG that samples up to 3 distinct characters from the controller's deck. Pick prompt (built-in key `discover-character`, count 1); the chosen card moves to hand and the rest of the deck is shuffled with the event RNG. The fold rejects a choice that is no longer a character in the deck. Semantic play. | `BCT` L186-204, `sampleDiscoverCharacters` L534, `resolveDiscoverChoice` L558; `src/rules/battle/battle-events.ts` `DISCOVER_CHARACTER_SOURCE_CARD_ID` L780 and `promptResolutionIsValid` L3497; `src/battle/semantic-play-card-ids.json` | #518. Approximated as adding a synthetic Marked Direwolf (#512, 4●, 4✦) to the AI hand; `valueHint` 1. |
| `944e15d2-d680-4ebe-8d18-36826f4b1535` | Worlds Await | Semantic play requires exactly one target: a character in either rank controlled by the caster. `played`: target `sparkDelta + 3` (permanent; no duration). With no legal target the play is rejected (tutorial `card-no-valid-targets` guidance as for Flashpoint). | `BCT` L205-230; `src/battle/semantic-play.ts` L40-52; `src/battle/starter-card-targets.ts`; `src/battle/semantic-play-card-ids.json` | #519. Playable only when affordable and the AI has an ally. Target: highest base spark (`printed x figmentCount + sparkDelta`), front-rank allies first on ties, ties broken toward #515. |
| `229ab3a1-3720-41a2-924c-8fe112188f8e` | Twilight Troubadour | Vanilla (rarity Tutorial); triggered-table entry with no triggers (hash `811c9dc5`). Semantic play. The tutorial's only AI action override plays it for the enemy after the enemy reveals Nomad's Verge. | `BCT` L231-235; `src/battle/semantic-play-card-ids.json`; `src/content/tutorial.ts` `aiActionOverrides`; `src/battle/tutorial-ai-action-overrides.ts` | none (no card model; played through the tutorial override). |
| `4e3c04a9-1cdd-468a-b42a-40157ed9c9d6` | Eternal Stag | Support: +1 to supported allies whose subtype is `Spirit Animal` (hash `c72e97a0`). Its activated ability was not automated. Not a semantic-play card. | `BCT` L328-336 | none |
| `56411ed4-bda9-4fdf-82e5-b5492de67039` | Skyflame Commander | Support: + the number of Warrior characters the controller has in both ranks (a figment stack counts each member) to every supported ally (hash `84f5be41`). Not a semantic-play card. | `BCT` L337-344; `countAlliedWarriors` in `src/battle/state/figments.ts` | none |
| `1268a899-b209-46bb-bce4-6def1dcd0404` | Woodland Apparition | Support: +2 to every supported ally (hash `04484014`). Its Reclaim clause was not automated by a script. Not a semantic-play card. | `BCT` L345-350 | none |
| `6497d8b1-85b8-486d-99e2-5c141486d508` | Dragonward | Support: +3 to supported allies whose subtype is `Warrior` (hash `a2c043a8`). Its cost reduction was not automated. Not a semantic-play card. | `BCT` L357-365 | none |
| `8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd` | Ash Sower | Support: +3 to every supported ally (hash `b82fe41f`). Its activated ability was not automated. Not a semantic-play card. | `BCT` L366-371 | none |
| `c61c8b29-6911-4bbf-b1c4-0c18b22ed33f` | Battlefield Medic | Support: +2 to every supported ally (hash `b027ad8e`). Its activated ability was not automated. Not a semantic-play card. | `BCT` L372-377 | none |
| `c8579b20-95ff-4b1d-b4c6-6bd049fc4760` | Ghostlight Wolves | Support: +2 to supported allies whose subtype is `Spirit Animal` (hash `7415a86e`). Its activated ability was not automated. Not a semantic-play card. | `BCT` L378-386 | none |

`BCT` also registers three synthetic framework fixtures
(`00000000-0000-4000-8000-000000000101` to `...0103`) used only by reducer
tests; they are not catalog cards and have no rows here. The Legionnaire
figment identity `e757b306-5bab-4a5a-8493-28c0f3aa6440` in
`src/battle/state/figment-catalog.ts` is a figment, not a catalog card, and
has no card-specific behavior.

`collectAutomationHashDrift` in `BCT` compared each script's `textHash`
(`fnv1aHex` of the card's `renderedText`) with the live catalog text, so a
rules-text edit flagged its script as drifted.

## Counts

- Dreamwell rows: 33 (all 33 catalog cards; 32 with scripted steps, 1 with
  `steps: []`).
- Semantically automated card rows: 18.
  - `BATTLE_TRIGGERED_EFFECTS` in `BCT`: 11 cards (7 with at least one
    trigger, 4 with an empty trigger map).
  - `src/battle/semantic-play-card-ids.json`: 11 cards, the same 11.
  - `BATTLE_CARD_EFFECT_SCRIPTS` (Support) in `BCT`: 8 cards; 7 appear only
    here, and Nocturne Strummer is also in the two sets above.
  - Card-specific branches: 4 cards, all also in the sets above. These are
    Rusted Colossus (`planStaticContributionSettlement`), Flashpoint
    Detonation and Worlds Await (`semantic-play.ts`,
    `starter-card-targets.ts`), and Sign of Arrival (`battle-events.ts`
    Discover validation). The same `battle-events.ts` branch also covers the
    Dreamwell cards Ringvale and Azure Cascade, which are counted in the
    Dreamwell rows. `basic-automation.ts` has 0.
  - Union: 11 + 7 = 18.

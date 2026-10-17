# Phase 1: The First Dream (M1)

**Goal:** reach the first playable dream as fast as possible
([P7](decisions.md#p7-m1-is-a-thin-vertical-slice)).

1. The player picks an Avatar on the main menu's D97 entry.
2. They arrive in one medium dream, built from a Source of Tales map, and
   explore it on foot under a following camera.
3. They talk to its townsfolk, fight opt-in challengers for antes and
   bundles, shop, edit their deck and follow a quest.
4. They beat the Avatar guardian at the exit door and step through the dream
   veil to the end of the slice.

The run is saved robustly. Process stays light
([P9](decisions.md#p9-process-light-until-m1)): no per-bead review beads, and
one combined review/QA bead at the end.

**Read first:**

- this plan's [decisions](decisions.md), especially P4–P7, P10–P15, P17,
  P20 and P29;
- the [design overview](../README.md) and
  [Appendix B](../appendix-b-dreams.md) §B1, §B5, §B9–B12, §B15 and §B17;
- [Appendix A](../appendix-a-economy.md) §A2, §A4–A6, §A8–A9 and §A17;
- the [overworld visual guide](../overworld-visual-guide.md);
- `src/rules/fold-state.ts`, `src/rules/reducer.ts`,
  `src/eventlog/local-log.ts` and `src/rules/battle/journey-battle.ts`.

[Back to the plan](README.md)

## Task graph

Each task depends on the tasks listed after its arrow. Tasks without an arrow
start when Phase 0 closes.

- 1.1, 1.2 and 1.3 have no prerequisites.
- 1.4 ← 1.3
- 1.5 ← 1.1, 1.3
- 1.6 ← 1.5, 1.2
- 1.7 ← 1.6
- 1.8 ← 1.1
- 1.9 ← 1.1
- 1.10 ← 1.8, 1.6
- 1.11 ← 1.8, 1.5
- 1.12 ← 1.8, 1.6
- 1.13 ← 1.10
- 1.14 ← 1.4, 1.2
- 1.15 ← 1.14, 1.12
- 1.16 ← 1.7, 1.9, 1.11, 1.13, 1.15
- 1.17 ← 1.9 (serialization: both change how the log commits and opens)
- 1.18 ← 1.15
- 1.19 ← 1.16, 1.17, 1.18

**The widest point** runs eight beads at once: 1.4, 1.5, 1.8, 1.9, then 1.6,
1.11, 1.14 and 1.17. **The critical path** is
1.3 → 1.5 → 1.6 → 1.12 → 1.15 → 1.16.

**Known overlaps that need no edge:**

- 1.1, 1.8, 1.9, 1.10 and 1.12 each add independent cases to
  `src/rules/events.ts`, `src/rules/reducer.ts` and `src/session/actions.ts`,
  and branded IDs to `src/types/identifiers.ts`;
- 1.10 and 1.11 both draw from the bag through 1.8's API.

Owners resolve these textual conflicts with `tg --no-launch update`.

**The save schema during Phase 1.** Every bead extends schema v1's shape
freely and regenerates the v1 golden fixture. Bead 1.16 freezes v1. After
it, every persisted change ships a migration
([P5](decisions.md#p5-saves-are-versioned-snapshots)).

## Tasks

### 1.1 Mode and run skeleton (core)

Implement [P4](decisions.md#p4-one-fold-mode-at-genesis):

- `Genesis.mode`, defaulting to `journey` for stored games;
- the `d97` slice in `FoldState`;
- the `D97_` event namespace with its reducer routing in `src/rules/d97/`,
  and its action creators;
- the D97 main-menu entry (new run, continue);
- Avatar select through a D97 adapter over `JourneyStartScreen`;
- `D97_START_RUN`, which records the Avatar and run seed;
- a D97 screen router, with a placeholder overworld screen;
- a development entry for QA through the runtime QA scene mechanism.

Add the D97 identities this bead needs (`RunId` and the like) as branded
types. Log run creation.

**Acceptance:**

- A new D97 run starts from the main menu, survives a reload, and returns to
  the D97 screen.
- Journey games and their tests are unchanged.
- The actions coverage test covers the new events.
- `knip` is clean.

### 1.2 LPC asset library

Implement [P23](decisions.md#p23-asset-sourcing-and-licenses). Clone or
download into `~/Documents/lpc/`, pinning each commit or archive checksum:

- Source of Tales (all maps and tilesets);
- ElizaWy's LPC Revised;
- the Universal LPC Spritesheet Character Generator (sheets and
  `CREDITS.csv`);
- LPC Tile Atlas and Atlas2;
- LPC goes to space, and FraMa's sci-fi extensions;
- LPC Winter Tiles, Beach/Desert and the Adobe Town Set;
- bluecarrot16's Medieval Village and Victorian Town decorations;
- Big Island;
- Neverwell Moore.

Then:

- Convert magenta-key tilesets to alpha, inside the library.
- Write `src/content/d97/art-sources.ts`: one entry per source, with URL,
  pin, license, authors and local path.
- Teach `scripts/setup-assets.ts` a D97 art kind that links the library into
  gitignored `public/d97/`, and update `.gitignore`.
- Without the library, setup warns and the game uses placeholders.

**Acceptance:**

- Workspace preparation links the library.
- A checkout without it still builds and renders placeholders.
- No image is committed.
- The manifest lists every source.

### 1.3 Map runtime format (core)

Implement the map module of [P11](decisions.md#p11-tiled-first-maps-with-committed-recipes)
in `src/d97/map/` and `src/content/d97/maps/`:

- **A pure TS Tiled reader** (TMX and TMJ). It handles tile layers, embedded
  and external tilesets, object layers, oversized tiles and layer properties.
- **`defineDreamMap`.** It holds:
  - the source reference and its content hash;
  - the recipe operations (crop, erase region, stamp, paint terrain with
    auto-tiling, hide layer, mark above-player, block or open);
  - regions, landmarks and anchors (the Appendix B §B1 kinds, plus
    townsfolk; guardian anchors name the door they block).
- **The recipe compiler.** It builds the compiled map (layers, walkability
  grid, above-player mask, resolved anchors). It runs at workspace
  preparation and writes to gitignored `public/d97/maps/`.
- **A\* pathfinding** over the walkability grid.

**Acceptance:** `node` tests over a small synthetic Tiled fixture pin these
contracts:

- each recipe operation's effect on the grid;
- anchor resolution;
- deterministic compilation;
- a reported content-hash mismatch;
- pathfinding.

### 1.4 Map authoring tools

Implement [P12](decisions.md#p12-ai-legible-map-tooling) in `scripts/d97/`.
`npm run d97:map -- <inspect|preview|validate|stamps>` provides:

- **Previews.** PNG previews via `pngjs`, with no native dependencies:
  - the whole map, downscaled;
  - zoomed regions with a coordinate grid, region outlines, anchor letters
    and a legend.
- **Region summaries.** Per-region walkability and reachability, plus
  landmark and anchor tables.
- **Crossing time.** Along the main route at walking speed.
- **Validator rules.** As P12 lists them.
- **The stamp catalog format,** and `stamps extract --from <map> --rect …`,
  which writes a named stamp definition and its preview sheet.

Previews write to a gitignored directory. Add a D97 tooling section to
`README.md`.

**Acceptance:**

- Synthetic-fixture tests cover each validator rule and the crossing-time
  computation.
- The preview command writes images of the expected dimensions.

### 1.5 Overworld renderer (core)

Add `pixi.js` v8 and `@pixi/react`. Build `D97OverworldScreen`, with:

- **Map drawing.** Draws compiled map layers with off-screen culling, a
  y-sorted object layer, and an above-player layer.
- **The camera.** It follows the player at an integer zoom (2× on desktop;
  1× or 2× on phones, with at least 11 tiles across), and never shows a
  whole medium map.
- **Movement** per [P14](decisions.md#p14-controls): keyboard steps at 4
  tiles per second with collision, click or tap walking along A\* paths, and
  an interact key.
- **An interaction registry** keyed by anchor kind, which later beads fill.
- **Placeholders.** Flat terrain colors and capsule characters when art is
  missing.
- **The React HUD shell.** A chip with act and tier (never a dream name), an
  Essence readout, and a control bar with Deck, Quests and Menu.
- **The input-focus rule.**
- **`window.__d97`** ([P26](decisions.md#p26-qa-surface)).

Until bead 1.14 lands, develop against a small synthetic compiled map.

**Acceptance:**

- In the browser, keyboard and click walking work; collision holds; the
  camera clamps; and a 110×110 fixture never fits on screen.
- One desktop and one mobile capture.
- `__caps` is empty.

### 1.6 Character runtime

Implement [P15](decisions.md#p15-character-sprites-layered-at-runtime):

- the recipe type (`characterSprite`), and layer ordering by the
  generator's z-order;
- walk and idle animations in four directions;
- the shadow;
- facing the player within two tiles;
- boss scales;
- the player drawn as their Avatar, with the gold ring;
- head-icon badges (the visual guide's shapes and colors), with bob and
  overlap fading.

Add three test recipes for development.

**Acceptance:**

- Browser QA shows layered characters animating in four directions, with
  badges.
- A recipe naming a missing sheet falls back to a capsule with a logged
  warning.

### 1.7 Avatar sprite recipes (creative)

Write recipes for all 32 Avatars in `src/content/d97/characters/avatars/`,
in their home tileset's costume language from the visual guide. Give each a
distinct silhouette at 1×. Render a gitignored contact sheet for review.

**Acceptance:**

- Every Avatar has a recipe.
- The contact sheet shows 32 distinct silhouettes; record any near-pairs and
  how they were separated.

### 1.8 Collection, deck and reward bag v0 (core)

- **Owned copies.** Each has an owned-copy UUID, the card UUID,
  modifications and provenance (channel, battle count, price).
- **Collection rules.** An active deck and a reserve; a minimum deck of 25;
  a collection floor of 25.
- **The starting package** (Appendix A §A17, Standard).
- **Reward bag v0** ([P29](decisions.md#p29-m1-economy-subset)): draws
  without replacement, copy targets counted against every copy ever
  acquired, and every draw logged.
- **A D97 deck editor screen.** Built from Cumulus deck viewers and
  `CardBrowserPanel`, with equip and unequip as intents.

**Acceptance:** `node` tests over synthetic catalogs pin:

- copy targets;
- draws without replacement;
- the floor;
- the minimum deck size;
- equip and unequip.

Browser QA covers editing the deck.

### 1.9 Versioned saves (core)

Implement [P5](decisions.md#p5-saves-are-versioned-snapshots) for D97:

- **Persistence.** Snapshot schema v1 over the `d97` slice, persisted to
  IndexedDB after each applied event.
- **Within a build,** the log opens from the latest snapshot as its
  checkpoint.
- **Across builds,** the migrated snapshot opens as a fresh log base.
- **The migration runner,** with one fixture migration in tests.
- **The reconciliation framework,** with the card retirement table.
- **The battle-restart rule.**
- **D97 games bypass the content-config gate,** which journey games keep.
- **Logging** of migrations and reconciliations.
- **The v1 golden fixture.**

**Acceptance:** `node` tests pin:

- snapshot round-trip identity;
- a fixture migration;
- each reconciliation case;
- that a D97 game with a different content config opens.

Browser QA: create a run, change a tunable, rebuild, and reload into the
same run.

### 1.10 Encounters and battles (core)

- **Occupants.** Challenger and guardian occupants: generic characters with
  a deck source, and the Avatar guardian with its ability.
- **Tier knobs** for tiers 4 and 7, as tunables.
- **Opponent decks.** Built with `buildTideOpponentDeck` from
  `hash(runSeed : characterId)` and **stored at first preview**.
- **The preview panel** (Cumulus). It shows the signature cards, tier, score
  target, both head starts, both antes (rolled at first preview and stored)
  and the Essence purse extra, with Fight and Not now as intents. Choosing
  Fight with fewer than 25 active cards opens the deck editor.
- **The battle host.** The `d97` battle-host kind, with D97 begin and end
  cases.
- **Outcomes.** A win pays the ante, a bundle of `S = ⌊T/4⌋` rarity points
  from the bag, and the extra. A loss takes the anted copy (respecting the
  floor). A draw changes nothing.
- **Afterwards.** Mark the beaten state, return to the overworld at the
  anchor, and register the challenger and guardian interactions.
- **Logging** of previews, setups and results.

**Acceptance:**

- `node` tests pin antes fixed at first preview, bundle budgets, floor-safe
  losses, and the beaten state.
- A browser walkthrough plays one battle to a win and one to a loss, with
  `__caps` empty.

### 1.11 Shop

Every dream's shop, through a D97 adapter over `CardShopSiteScreen`:

- 4–6 bag cards, rolled at first open and stored;
- Appendix A §A4 quotes through the existing shop pricing, at price band 1;
- buy;
- sell owned copies (§A5 resale guard, collection floor);
- one paid restock per visit.

Register the shopkeeper interaction. Log the stock and every transaction.

**Acceptance:**

- `node` tests pin the resale guard and the floor refusal.
- Browser QA covers buying, selling and restocking.

### 1.12 Dialogue and quests (core)

Implement [P17](decisions.md#p17-dialogue-as-typed-ts-graphs):

- the dialogue graph schema;
- `npm run d97:dialogue -- validate`;
- the dialogue panel, over Cumulus `CharacterDialogue` and `SpeechBubble`;
- effects as intents, and flags in state.

Quest model v0 ([S33](../README.md#decision-record)):

- one active quest;
- the kinds defeat, lost object, errand within the dream, and delivery;
- the quest log panel;
- quest head icons (! and ?);
- object anchors visible only while their quest is active;
- rewards in Essence or a card choice from the bag;
- logs for offers, steps, completions and rewards.

Townsfolk barks use the same runtime ([P20](decisions.md#p20-ambient-townsfolk)).

**Acceptance:**

- Synthetic-fixture tests cover the validator rules, condition evaluation,
  each effect's intent, and each quest kind's flow.
- Browser QA plays a fixture quest from offer to reward.

### 1.13 Doors, waypoint and the end of the slice

- **The dream veil.** A swirl and sparkle filter, a glow and motes, in the
  act-exit red variant.
- **The guardian chokepoint.** The corridor stays blocked while the guardian
  is unbeaten, and walking into it opens the preview.
- **Waypoint activation,** logged.
- **Reload placement** at the last door or waypoint used.
- **Stepping through the exit** after the guardian falls opens a slice-end
  screen with the run summary, which carries no dream name.

**Acceptance:**

- Browser QA covers being blocked by the guardian, then beating it, then
  passing.
- The veil gets a desktop capture.
- A reload after activating the waypoint places the player there.

### 1.14 First dream: concept and map (creative)

1. **Write the dream brief** in `evidence/dreams/<dream-uuid>.md`:
   - a premise and mood;
   - a tone note for the locals (it stands in for the story bible until 2.4);
   - landmarks;
   - sketches of the shopkeeper, one or two quest givers, 3–8 townsfolk and
     five challenger personas;
   - quest hooks.
2. **Build the map module** from a crop of Source of Tales' Mountainwatch
   (or Goldenfields, if it suits the brief better), about 110×110. The recipe:
   - places the exit door frame and its chokepoint corridor, the waypoint,
     the shop front, five challenger anchors, one guardian anchor, the
     friendly anchors, one or two chests and the quest-object anchors;
   - names regions and landmarks;
   - marks the above-player layers.
3. **Run the map loop** ([workflow § Creative beads](workflow.md#creative-beads))
   until it is clean.

**Acceptance:**

- The validator is clean.
- The main route takes about 2 minutes at walking speed.
- The previews read well.
- The brief and the map agree on every landmark.

### 1.15 First dream: residents (creative)

Write, against the dream brief:

- **The characters.** For the shopkeeper, quest givers, townsfolk and five
  challenger personas: sprite recipes, short personalities, and dialogue
  trees (townsfolk barks included).
- **The guardian.** Choose its Avatar, falling back to another when the
  player chose that Avatar, and write its lines.
- **One or two quests,** as data.

Name characters and items; never name the dream
([P10](decisions.md#p10-dreams-are-unnamed)).

**Acceptance:**

- The dialogue and map validators are clean.
- A browser walkthrough meets every resident and completes each quest.
- No tileset name appears in any copy.

### 1.16 M1 review and QA

The combined review/QA bead for the milestone
([workflow § Review and QA beads](workflow.md#review-and-qa-beads)):

1. **A cold `warden` review,** run by this bead's session
   ([P32](decisions.md#p32-reviews-are-beads)), of the whole Phase 1 diff
   (beads 1.1–1.15 and their commits). It also judges the `core` seams against the later
   phases.
2. **A full playthrough** on desktop, on foot: Avatar select, every resident,
   every challenger, the shop, the deck editor, both quests, the guardian, and
   the exit. Then a mobile smoke check of walking, a dialogue, a battle and
   the shop.
3. **A cold visual review** with `visual-review`.
4. **Fixes** for the confirmed findings, in one commit. Larger findings get
   their own beads.
5. **Freeze save schema v1** and its golden fixture.

**Acceptance:**

- The review is resolved.
- The playthrough passes with `__caps` empty.
- Desktop, mobile and interaction captures are in `artifacts/qa/<bead-id>/`.
- The milestone is announced in the epic's notes with its `staging` OID, for
  the operator to play.

### 1.17 Co-op residue removal

Implement [P28](decisions.md#p28-co-op-residue-removal). Audit `src/`,
`scripts/`, the README and the lint rules for co-op and multiplayer residue,
and remove all of it:

- the `dreamtides-coop-v*` reducer-version family, with a compatible rename
  for stored journey games;
- the multiplayer commit and ensure paths;
- every part of the compare-and-swap policy and actor envelope that only
  guarded concurrent writers.

Keep the stale-intent protections a single local writer still needs
(`intentKey` dedupe), and record what was kept and why.

**Acceptance:**

- The audit list is in the bead notes.
- No co-op residue remains (`git grep` evidence in the notes).
- Journey and D97 tests pass, and stored journey games still open.
- `knip` is clean.

### 1.18 File Phase 2

Follow [workflow § Filing a phase](workflow.md#filing-a-phase) for
[Phase 2](phase-2-consolidation.md).

### 1.19 Phase 1 gate

1. Confirm 1.16's review is resolved and `release` contains every Phase 1
   commit.
2. Record the M1 build's `staging` OID in the epic notes, for the operator
   to play whenever they choose. The stream continues.
3. Close the epic.

## Exit gate

- M1 is playable end to end on desktop, and smoke-tested on mobile.
- Its save loads in later builds (the v1 golden fixture is frozen).
- The M1 review is resolved.
- Co-op residue is removed.
- Phase 2 is filed.

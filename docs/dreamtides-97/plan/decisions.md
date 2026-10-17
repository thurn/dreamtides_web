# Decisions

These decisions bind the D97 stream. The operator made them in the planning
interview of 2026-10-17. Where they differ from the design documents in
[`docs/dreamtides-97/`](../README.md), these decisions win until bead
[2.1](phase-2-consolidation.md#21-design-docs-alignment) aligns the documents.

Decision IDs use the prefix **P**. The main plan uses D and C, and the design
document uses S, R and Q.

[Back to the plan](README.md)

## Stream and workflow

### P1. Hive streams

D97 executors work only on D97 beads, through a new Hive feature called
**streams**:

- `hive executor start --project dreamtides_web --stream d97` binds a session
  to stream `d97`. The binding is fixed for the session, like its project.
- A D97 bead carries `hive_stream=d97` in its metadata, beside `hive_project`.
- A session bound to a stream sees, claims and is woken only for beads of that
  stream. A session started without `--stream` sees only beads without
  `hive_stream`, so main-plan beads need no relabeling.
- `await` counts beads **held** by either stream, so a D97 bead blocked by a
  held main-plan bead keeps its session waiting instead of reporting
  `ExecutorQueueDrained`.
- `hive executor ready --session <id> --json` gives the agent the
  stream-aware ready list, so the executor skill's own selection matches the
  hooks.

**Why:** a second Hive project on the same repository breaks Hive's dashboard
and Tollgate candidate tracking, and ends waits early on blockers held in the
other project. A label filter applied only by the agent would disagree with
`await` and the stop hook.

### P2. Self-contained plan docs

This plan lives in `docs/dreamtides-97/plan/`. Its workflow page is compact,
self-contained, and never links into `docs/plan/`, which the main plan deletes
at its end. Phase 0 makes the only edits D97 needs outside its own directory:

- `AGENTS.md` names both plans, their streams and their workflow pages, and
  points D97 sessions at this plan's evidence paths;
- the main plan's [D33](../../plan/decisions.md#d33-documentation-end-state)
  gains an exception that keeps `docs/dreamtides-97/` tracked through the
  main plan's documentation end state.

### P3. Bootstrap by the planning session

The planning session runs Phase 0 itself, after the operator approves this
plan. Executors start only once Phase 1 is filed and admitted.

### P8. Milestones never pause the stream

Milestones (M1–M5) are checkpoints for the operator, not stops. The stream
keeps filing and running work. The operator plays a milestone build whenever
they like. Feedback becomes `playtest` beads, filed by the operator or by
the session that hears it, which preempt ordinary ready work. A playtest bead
may amend a phase page and file follow-up beads.

### P9. Process light until M1

**Before M1:** each bead goes through the gate stage, and the release stage
files `ci-fix` beads. There is no friction ledger, retrospective, mason pass
or per-bead review bead. One combined review/QA bead
([1.16](phase-1-first-dream.md#116-m1-review-and-qa)) reviews and
plays the whole milestone and fixes what it finds.

**From Phase 2:**

- every code bead that changes behavior gets a paired **review/QA bead**
  ([workflow § Review and QA beads](workflow.md#review-and-qa-beads));
- creative beads get a batched QA bead for every two or three dreams;
- friction goes in close notes as tagged lines;
- every phase ends with a refactor-and-tooling pass and a retrospective
  ([P30](#p30-phase-end-introspection)).

**Why:** the operator wants the first playable map as soon as possible, then
a stream that keeps examining and improving itself.

### P32. Reviews are beads

In the D97 stream, code review happens only in review/QA beads
([workflow § Review and QA beads](workflow.md#review-and-qa-beads)). The
session that claims one, Claude Code or Codex, reviews the landed diff itself
with the `warden` skill, plays the change in the browser, and fixes what it
confirms in one commit. Its context is cold because it is a different bead
from the work it reviews. No D97 session dispatches a separate reviewer
subagent or reviewer CLI. This operator decision of 2026-10-17 supersedes the
general fresh-Codex-reviewer policy for D97 beads.

Before M1, the one combined bead 1.16 reviews the milestone
([P9](#p9-process-light-until-m1)).

### P21. Any host

Claude Code and Codex executors may claim any D97 bead, creative beads
included. Hive needs no host filter.

### P22. Other repositories

The D97 stream changes only this repository, except for these changes:

- **Hive streams.** Phase 0's change to `~/hive` is filed as a Hive-project
  bead under Hive's AGENTS.md, with promotion authority granted here. The same
  authority covers the matching updates to the executor skill and the shared
  waiting guidance.
- **The main plan's tooling-fix exception.** A Hive or Tollgate defect that
  blocks the D97 stream is fixed at its cause as its own bead in that
  repository, as main-plan D16 allows.

Never touch other Hive projects' beads or shared Hive configuration beyond
these changes.

### P24. Validation shared with the main plan

Both streams share Tollgate's gate stage (about 60 s), its asynchronous
release stage (`review:full` plus the fuzz smoke), and `max_release_lag = 5`.

- **A bead is done when its commit is on `staging`.**
- **A red release run** is fixed forward by a `ci-fix` bead. The first
  session in either stream to see it searches project `dreamtides_web` across
  both streams for an unfinished `ci-fix` bead keyed `release_step=<step>`.
  Only if none exists does it file one, in its own stream. That bead
  preempts all other ready work in its stream. Both streams' promotions pause
  together at the lag limit, so neither stream can ignore a red release.
- **D97 tests stay within the gate budget.** A D97 bead whose tests push the
  gate stage past 60 s is followed at once by an improvement bead.

### P30. Phase-end introspection

From Phase 2, every phase ends with three beads, in order:

1. **Refactor and tooling pass.** A `mason` audit of the phase's code, plus a
   review of the friction tags in the phase's close notes. It files bounded
   refactoring and tooling beads, and every bead it files lands within the
   phase.
2. **Retrospective.** A read-only `sage` pass over the close notes, Tollgate
   history, gate and release times, review dispositions and playtest beads.
   It files improvement beads and writes
   `evidence/retrospectives/<bead-id>.md`.
3. **Gate.** The review is resolved, `release` contains the phase, the
   milestone playthrough passes, the milestone build's OID is recorded for
   the operator, and the next phase is filed.

Phase 6, the last phase, ends with the refactor pass, a gate review and the
gate. It has no retrospective; `report.md` records what the stream learned.

A friction tag that recurs in three beads within a phase files an
improvement bead at once, without waiting for the phase end. Improvement
beads preserve behavior.

## Architecture

### P4. One fold, mode at genesis

D97 runs in the same fold, reducer and event log as the journey:

- `Genesis` gains `mode: "journey" | "d97"`, which defaults to `journey` for
  stored games.
- `FoldState` gains a `d97` slice beside `journey`, null in journey games.
- D97 events use a `D97_` prefix in `EventPayloads`. Their cases live in
  `src/rules/d97/`, and `actions.ts` gains their creators.
- The battle host's `BattleMode` gains a `d97` kind. D97 battles use
  `createEngineBattleInit` and `buildTideOpponentDeck` with D97 inputs. D97
  adds its own begin and end battle cases, because the journey's assume an
  Atlas node and a site.
- The front door's main menu gains a D97 entry: new run, continue.
- D97 run logic that is not a reducer case lives in `src/d97/`. D97 catalogs
  (dreams, maps, characters, dialogue, quests, tide sets, tunables) live in
  `src/content/d97/`.

### P5. Saves are versioned snapshots

A D97 run must survive every later build: tuning, content, rules and code
changes. So:

- **The durable save is a snapshot.** The D97 run state is plain JSON-safe
  data with a `schemaVersion`. It is persisted after every applied event.
- **Migrations.** `src/d97/save/migrations/` holds ordered pure functions,
  each taking one schema version to the next. Every change to the persisted
  shape ships one migration and one golden save fixture of the previous
  version, and the fixture must load.
- **Within a build,** intents still fold through the reducer: the log opens
  with the latest snapshot as its checkpoint. **Across builds,** the game
  opens the migrated snapshot as a fresh log base. It never re-folds old
  events under new rules.
- **Outcomes, not seeds, are state.** Act assembly, anchor occupants, rolled
  antes, shop stock, bag contents and every other generated result are
  written into state when first produced. They are never re-derived from the
  run seed on load, so a catalog or algorithm change never reshuffles an
  existing run. Old log segments stay readable for logging because events
  record their resolved outcomes.
- **Reconciliation on load.** Every catalog reference in a snapshot is a
  UUID. A load-time pass resolves each reference against the current catalog:
  - retired cards map to replacements through a committed retirement table,
    or are compensated in Essence;
  - an occupant whose anchor was removed moves to a free anchor of the same
    kind;
  - a quest whose definition was removed is abandoned;
  - new tunables apply going forward.

  Every reconciliation is logged.
- **Battles in progress** belong to their build. If the build changed, a
  battle in progress restarts from its recorded setup, with the same antes and
  no penalty.
- **No content gate.** D97 games are never gated out by the content-config
  check that journey games use. The build ID is recorded for diagnostics only.
- **Journey saves are unchanged** (journey keeps its content-config gate).

**Why:** a 30-hour campaign cannot be invalidated by a balance patch, and the
stream never stops ([P8](#p8-milestones-never-pause-the-stream)), so the
operator's M1 save must load in every later build.

### P6. Shared code without journey changes

D97 reuses pure logic and Cumulus screens directly. Where a helper is bound to
journey state, D97 extracts a mode-neutral core and leaves a journey wrapper.
That extraction must change no journey behavior, journey UI or journey test
contract. Journey adapters stay as they are, and D97 writes its own adapters
for shared screens.

### P28. Co-op residue removal

The co-op mode is gone, but its residue remains. Examples:

- the reducer version family `dreamtides-coop-v*`;
- the "multiplayer" commit and ensure paths in
  `src/battle/integration/create-battle-init.ts`;
- the reducer's compare-and-swap policy and actor envelope, which were built
  for concurrent writers.

One Phase 1 bead audits and removes all of it. It is not on the M1 path, and
it runs after the snapshot bead, because both change how the log commits and
opens.

## The first dream

### P7. M1 is a thin vertical slice

M1 includes:

- Avatar select (any of the 32 Avatars) and a new run;
- one medium dream built from an LPC map, explored on foot with a following
  camera;
- 4–5 opt-in challengers that fight real engine battles, and one Avatar
  guardian at the exit door;
- antes and a small victory bundle drawn from the reward bag;
- one shop that buys and sells;
- a collection, reserve and deck editor;
- the shopkeeper, 1–2 quest givers and 3–8 townsfolk, each with dialogue
  trees, plus one or two quests;
- a waypoint and the exit door's dream veil;
- a robust save.

M1 leaves out acts, other dreams, the Atlas, fast travel, amulets, Dream
Guides, sages, Dreamsign slots, keys and difficulty levels.

### P29. M1 economy subset

- **Reward bag v0** uses the existing card pools. It is the tides4 pool the
  journey's draft would deal the chosen Avatar (its starter tide plus up to
  three of its facets, with at most 2 copies of each card), dealt from the run
  seed and stored in state at run start. Its dealt counts are the copy
  targets. Phase 3 curates the D97 pools: for each Avatar it picks one
  high-quality tides4 output and pins it.
- **Tiers:** challengers fight at tier 4 and the guardian at tier 7, with the
  Appendix B §B9 knobs for those rows. Score targets follow Appendix B §B3.
- **Antes** (Appendix A §A9), **victory bundles** (§A8, Essence purses only as
  extras), **starting package** (§A17, Standard only), **shop stock, prices
  and selling** (§A4–A6), **collection floor** (25).

Every number is a tunable in `src/content/d97/`.

### P10. Dreams are unnamed

Dreams have no names: not in the game, the Atlas, door labels or sage hints.

- Tileset names ("Tumbleleaf Village", "Frostforge" and so on) are internal
  labels for art sets, and never appear in game.
- Doors are blind. A traversed door shows no destination label. At most it
  shows a small thumbnail of the destination's art.
- The Atlas identifies dreams by a tileset thumbnail, act, tier, links and
  markers.
- A sage's hint marks the destination on the Atlas instead of naming it.

Characters, quests and items have names. Dreams do not.

### P11. Tiled-first maps with committed recipes

Maps are built in this order of preference:

1. **Crops of existing LPC Tiled maps.** Source of Tales' 200×200
   Mountainwatch and Goldenfields maps, its cave and interior maps, Big
   Island, and Neverwell Moore.
2. **Reseasons and edits** of those crops.
3. **New maps composed by agents** from LPC stamps, for themes no existing
   map covers.

A committed **map module** (TS) holds:

- the source reference: library path and content hash;
- an **edit recipe** of typed operations (crop, erase a region, place a
  stamp, paint terrain with auto-tiling, hide a layer, override walkability);
- region notes, landmarks and anchors.

The recipe compiler materializes the edited map and its walkability grid at
workspace preparation, like linked art. Neither source maps nor edited maps
are committed.

The renderer draws Tiled layers. Layers above the player (treetops, roofs) are
marked in the module. The visual guide's backdrop and shape-built paths remain
available as recipe operations, not separate formats.

### P12. AI-legible map tooling

Agents do all map design and editing, so every map format and tool must be
legible to a model:

- **No hand-edited grids.** Edits are recipe operations with coordinates and
  named stamps, never rows of characters.
- **Named stamps.** A catalog of LPC chunks (houses, tree clusters, door
  frames, waypoint plinths and so on), each with a name, footprint, anchor
  points, an above-player mask and a preview sheet.
- **Regions and landmarks.** Each map names its areas (for example "mill
  pond", rectangle 40,30–58,44) so recipes, anchors and briefs can refer to
  places by name.
- **The inspector** (`npm run d97:map -- <command>`) does five things:
  - prints per-region walkability and reachability summaries;
  - lists landmark and anchor coordinates;
  - checks crossing time between regions at walking speed;
  - renders PNG previews (the whole map, plus zoomed regions with a
    coordinate grid, region outlines and anchor letters) to a gitignored
    directory;
  - prints validator findings by coordinate.

  The agent reads the previews back as images.
- **The validator** checks, among other things, that:
  - anchors stand on walkable cells;
  - every anchor is reachable from the entries;
  - a guarded door is unreachable while its guardian stands;
  - doors keep their spacing;
  - a medium map's main route meets the crossing-time target.

### P13. Map sizes and walking speed

| Size | About | Main-route crossing at walking speed |
| --- | --- | --- |
| Small | 60×60 tiles | about 1 minute |
| Medium | 110×110 tiles | about 2 minutes |
| Large | 150×150 tiles | about 3 minutes |

Walking speed is 4 tiles per second. The camera never shows the whole of a
medium map: at 2× on desktop it shows about 30×17 tiles. Speed and sizes are
tunables, adjusted after playtests.

### P14. Controls

- **Desktop:**
  - WASD or the arrow keys walk tile by tile at walking speed;
  - clicking ground or an object walks there along an A* path;
  - E or Space interacts with the faced object;
  - clicking an object walks to it and interacts.
- **Mobile:** tap to walk or interact.
- **While a React panel is open,** the canvas ignores input.

M1 QA covers desktop fully and does one mobile smoke check. Mobile polish
comes in Phase 6.

### P15. Character sprites layered at runtime

Characters are recipes over the Universal LPC Spritesheet Character Generator
sheets. The renderer stacks a recipe's layer sheets as sprites that share one
animation frame. It does not pre-compose sheets at workspace preparation, as
the visual guide proposed. Recipes name existing color variants, so nothing
needs recoloring.

**Why:** runtime layering needs no image-processing step at workspace
preparation and no committed composites, and a recipe edit shows up on the
next reload.

### P23. Asset sourcing and licenses

An early bead fetches the art into `~/Documents/lpc/`, outside the
repository. This plan grants download authority for:

- the sources named in
  [Phase 1.2](phase-1-first-dream.md#12-lpc-asset-library);
- later LPC or LPC-compatible packs from opengameart.org, the
  LiberatedPixelCup GitHub organization, and the GitHub repositories of LPC
  community games and artists.

- **Any license is acceptable,** NC and ND included, because D97 is a
  non-commercial prototype. Every source's license and authors are recorded
  in a committed text manifest, `src/content/d97/art-sources.ts`.
- **Conversions** (such as magenta-key transparency to alpha) write into the
  local library, never into the repository.
- `scripts/setup-assets.ts` links the library into gitignored `public/`.
  Missing art falls back to flat placeholder tiles and capsule characters.
- A credits screen generated from the manifest lands before the Phase 3
  gate.

## Writing

### P16. Narrative

- **Story bible.** After M1, one bead writes the story bible
  ([2.4](phase-2-consolidation.md#24-story-bible-creative)). It covers:
  - the premise of the dreaming world;
  - tone;
  - voice guides for the Dream Guides, the incarnations and Apollyon;
  - naming rules for characters and items;
  - recurring motifs.

  It lives in `docs/dreamtides-97/story-bible.md`. Every later creative bead
  writes against it.
- **A light through-line.** Recurring characters (the Dream Guides, the
  incarnations, Apollyon) have dialogue that reacts to act progress and
  earlier meetings. Dreams themselves stay act-agnostic, as assembly
  requires.
- **M1** writes only map 1's locals, from a short tone note in its dream
  brief.

### P17. Dialogue as typed TS graphs

Each character's dialogue is a typed TS module in `src/content/d97/`:

- **Nodes** have UUIDs, lines (content copy), player choices, and
  **conditions** on quest state, flags, act, beaten anchors and collection
  traits.
- **Effects** are a typed union (offer a quest, advance or complete one, give
  or take an item, open the shop or a service, set a flag, start a
  challenge). Each effect becomes an intent event.
- **Position is view state.** Which node is showing is view-local. Choices
  with effects are logged intents, and flags live in the D97 state.
- **A validator script** checks node reachability, dangling references,
  effects that are legal for their anchor kind, and condition types.

### P18. Dream authoring beads

Each catalog dream is two beads, then batched QA:

1. **Concept and map.** Writes the dream brief
   (`src/content/d97/dreams/<dream-uuid>.md`, beside the dream module:
   premise, mood, landmarks, residents
   and personas sketched, quest hooks), then builds the map module to fit it,
   with the inspector and validator clean.
2. **Residents.** Character design (personalities and sprite recipes for
   residents, townsfolk and challenger personas), dialogue trees and the
   dream's 1–3 quests as data.
3. **Batched QA,** every two or three dreams: a browser walkthrough of each
   dream, a writing review against the story bible, and fixes.

Concept-and-map beads for different dreams run in parallel.

### P19. Rooms after M1

A dream may own **rooms**: small interior maps entered through ordinary
building doors, not dream doors. A room has no veil. It belongs to its dream,
shares its waypoint and tier, and can hold friendly NPCs, chests, quest
objects and the shop. Rooms arrive in Phase 2. In M1, building doors are
scenery.

### P20. Ambient townsfolk

Every dream has 3–8 **townsfolk** from M1 on. Each has a sprite recipe, a
short personality, and a small dialogue tree of barks and lore, some of it
reacting to quest or act state. Townsfolk offer no services and carry no head
icon. They fill large maps, carry the story bible's through-line and hint at
quests.

## Tests and QA

### P25. Tests

- **Pure logic is tested in `node`:** the reducer cases, snapshot migration,
  reconciliation, map compilation, pathfinding, validators, the bag, and
  economy rolls.
- **No canvas tests.** Pixi rendering is covered by browser QA, never by
  `jsdom` tests.
- **Golden save fixtures** are synthetic and small. Each one pins that its
  schema version loads.
- **Milestone save fixtures** are the one exception. Each milestone's QA or
  gate bead plays its build and commits the run's exported snapshot JSON to
  `src/d97/save/fixtures/milestones/m<n>.json`. A test loads every milestone
  fixture through migration and reconciliation against the current catalog,
  and asserts only that it opens into a playable run. That is a property
  every catalog must keep, so it is not gated on mutable data. A failure
  means a migration or reconciliation is missing, never that the fixture
  needs regenerating.
- **Never assert UI strings,** dialogue copy, production map layouts or
  mutable catalog contents. Map and dialogue validators run in tests over
  synthetic fixtures, and as CLI checks over the real catalog.

### P26. QA surface

In development builds the overworld exposes `window.__d97`. It offers:

- a state dump;
- the current dream and the player's tile;
- `walkTo(anchorId)`, which walks like a click;
- `interact()`;
- teleport-to-anchor.

Teleport is a QA convenience that never writes an event. Browser QA asserts
state through it and through the DOM, and keeps `window.__caps` empty.

### P31. One key dream at a time

Only one key dream can be open at a time, as the design overview says.
Appendix C §C6 agrees.

### P27. Design documents are the spec

The design overview and Appendices A–E specify the game, and the visual guide
specifies its look. A conflict between them and these decisions is resolved
by the decisions. Bead 2.1 then updates the documents. A conflict found later
is recorded in the finding bead's notes and resolved in that bead's documents
change.

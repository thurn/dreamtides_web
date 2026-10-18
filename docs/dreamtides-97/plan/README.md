# Dreamtides 97: Delivery Plan

Executor sessions in the **`d97` stream** build Dreamtides 97 ("D97"), the
long-form overworld campaign mode specified in the
[design overview](../README.md) and its appendices. They are top-level Claude
Code or Codex sessions, each implementing one bead at a time. D97 shares the
repository, the battle engine, the content catalogs and Cumulus with the
journey mode.

The D97 stream runs alongside the main delivery plan in
[`docs/plan/`](../../plan/README.md), whose executors keep the default stream.
The two streams share one Hive project (`dreamtides_web`), one Tollgate queue
and one `staging` branch. Neither stream claims the other's beads.

The plan runs without operator review. The operator's decisions are recorded
in [decisions](decisions.md) (P1–P33). Where this plan and the design
documents differ, the decisions win, and the docs-alignment bead
([2.1](phase-2-consolidation.md#21-design-docs-alignment)) brings the design
documents into line.

**This page is the re-entry point.** After any context compaction, resume, or
restart, do these steps in order:

1. Read this page.
2. Follow [workflow → Re-entry](workflow.md#re-entry).
3. Read only the page for the current phase.

**Reviews are beads.** Code review happens only in review/QA beads
([P32](decisions.md#p32-reviews-are-beads)). The session that claims one, on
either host, runs the `warden` skill over the reviewed bead's landed diff
itself, plays the change, and fixes what it confirms. No session dispatches a
separate reviewer.

## Outcomes

When the stream ends:

- **D97 is playable end to end.** The player can play:
  - Avatar selection and difficulty;
  - five assembled acts of authored dreams, then Limbo and Apollyon;
  - the endgame of keys and key dreams;

  all in the browser, desktop and mobile, against the engine's AI.
- **The world is authored, and it has a voice.** These are written by agents
  against one story bible ([P16](decisions.md#p16-narrative)):
  - a catalog of about 40 compact dreams, with maps. Each opens on a town
    where the player arrives and finds the dream's services, with wide paths
    out to its challenges ([P13](decisions.md#p13-map-sizes-and-walking-speed),
    [P33](decisions.md#p33-towns-and-walkable-paths));
  - residents, personas and ambient townsfolk;
  - dialogue trees and quests;
  - a light through-line carried by recurring characters.
- **Saves survive updates.** A 30-hour run loads in every later build through
  versioned snapshots and migrations
  ([P5](decisions.md#p5-saves-are-versioned-snapshots)).
- **The economy is calibrated.** A headless run simulator measures the
  Appendix E targets, and the catalog tunables are adjusted until they are met
  or the gap is documented.
- **The code is shared and lean.** D97 lives in the same fold and engine as
  the journey ([P4](decisions.md#p4-one-fold-mode-at-genesis)). It reuses the
  pure logic and the Cumulus screens, and leaves the journey's behavior
  unchanged. Co-op residue is gone ([1.17](phase-1-first-dream.md#117-co-op-residue-removal)).

## Baseline at plan time

Measured on 2026-10-17 at `staging` `e784c4511`.

| Fact | Value |
| --- | --- |
| Main plan | Phases 2–4 gates closed; Phase 5 content open (487 entities pending, which play text-less per D36); Phases 6–7 in progress |
| Battles | The engine runs every battle; the journey sandbox and old AI are gone |
| Game state | One `FoldState` (`src/rules/fold-state.ts`) with an always-present `journey`; `Genesis` has no mode; content hashes are pinned at genesis, and a build with different content is gated out of an existing game (`src/App.tsx`) |
| Event log | Game-agnostic `src/eventlog/`; a log can open from a fold checkpoint; the reducer applies compare-and-swap rules from the co-op era |
| Routing | `root-router.tsx` has one route, `journey`; `FrontDoorRouter` → `ScreenRouter` on `journey.screen.type` |
| Battle hosting | `BEGIN_BATTLE` / `END_BATTLE` assume an Atlas node and a site (`src/rules/battle/journey-battle.ts`) |
| Reusable logic | `buildTideOpponentDeck`, `createEngineBattleInit`, shop generator and pricing, transfiguration, gamble, dreamsign pool, tide affinity, reward selection |
| Reusable UI | Cumulus site screens (shop, transfiguration, duplication, bazaar, revelation, gamble, augury, exploration, random site), `JourneyStartScreen` (Avatar select), deck viewers, `CharacterDialogue`, `SpeechBubble`, `AtlasNode`/`AtlasEdge` |
| Missing for D97 | Collection and reserve model, deck editor, NPC, dialogue and quest model, PixiJS, LPC art, D97 identities |
| Validation | Gate stage about 19 s median (budget ≤60 s); release stage about 96 s (`review:full` plus the fuzz smoke) |

## Non-goals

- **The isometric 3D target.** The prototype is top-down LPC pixel art.
- **Audio.**
- **Deploys, hosting, multiplayer, localization.** These are unchanged from
  the main plan.
- **Journey changes.** Journey gameplay, UI and saves are unchanged
  ([P6](decisions.md#p6-shared-code-without-journey-changes)). This includes the content-config gate.
- **Card design and rules changes.** Card data stays immutable (main-plan
  D11), and D97 needs no engine rule changes (Appendix B §B10).

## Phase map

Work runs in dependency order. Each phase page has a task graph and an
**earliest start**. A later phase's tasks start as soon as their prerequisites
land, so phases overlap. Gates close in order.

Each phase is filed by a `filing` bead of the phase before it, timed to that
phase's earliest start. Phase 4 holds two: one files Phase 5 once multi-act
assembly and bag layers land, and one files Phase 6 once assembly and the
economy land.

| # | Phase | Page | Earliest start | Exit gate (summary) |
| --- | --- | --- | --- | --- |
| 0 | Bootstrap | [phase-0-bootstrap.md](phase-0-bootstrap.md) | Closed by the planning session | Hive streams live; AGENTS.md and D33 updated; Phase 1 filed and admitted |
| 1 | First dream (**M1**) | [phase-1-first-dream.md](phase-1-first-dream.md) | now (epic `hv-rtga`) | One medium dream playable from Avatar select to the guarded exit, saved robustly; M1 review/QA landed; co-op residue removed |
| 2 | Consolidation | [phase-2-consolidation.md](phase-2-consolidation.md) | M1 QA bead | Design docs aligned; story bible; map tooling hardened; rooms; mason refactors; first retrospective |
| 3 | Act 1 (**M2**) | [phase-3-act-one.md](phase-3-act-one.md) | 2.2 and 2.4 | M1 playtest revisions landed; a full assembled Act 1 of about 8 compact catalog dreams, each opening on a town, with doors, waypoints, Atlas, guides, sages, chests, amulets, Dreamsign slots and the incarnation |
| 4 | Campaign (**M3**) | [phase-4-campaign.md](phase-4-campaign.md) | Phase 3 gate | Acts 2–5, Limbo and Apollyon; bag layers, refills, Avatar quests and switching; difficulty; catalog at about 40 dreams |
| 5 | Endgame (**M4**) | [phase-5-endgame.md](phase-5-endgame.md) | Phase 4 multi-act assembly and bag-layer beads | Keys, key dreams, prizes, Legendary Dreamsigns, Perfected cards |
| 6 | Calibration and polish (**M5**) | [phase-6-calibration.md](phase-6-calibration.md) | Simulator: Phase 4 assembly and economy beads; polish: Phase 4 gate | Run simulator; Appendix E targets met or documented; mobile polish; final acceptance |

**Milestones never pause the stream**
([P8](decisions.md#p8-milestones-never-pause-the-stream)). The operator plays
whenever they like. Their feedback arrives as `playtest` beads, which preempt
other ready work.

**Process grows after M1** ([P9](decisions.md#p9-process-light-until-m1)).
Phase 1 runs with the gate stage, release-stage `ci-fix` beads and one
combined review/QA bead at the milestone. From Phase 2 on:

- each code bead gets a paired review/QA bead;
- creative beads get batched QA beads;
- each phase ends with a refactor-and-tooling pass and a retrospective
  ([P30](decisions.md#p30-phase-end-introspection)). Phase 6 ends with a
  refactor pass and a gate review; `report.md` takes the retrospective's
  place.

**Phase pages are refined lazily.** Each phase's filing bead first updates
its phase page from what the earlier phases taught, then files the beads
([workflow § Filing a phase](workflow.md#filing-a-phase)). Pages for
Phases 3–6 are outlines until then.

## M1 playtest revisions

The operator played M1 at `staging` `e48d73b92` and set three changes. Their
playtest bead, `hv-j1n2.65`, records the feedback verbatim. The changes bind
every dream, the first dream included, and they come before the Phase 3
catalog dreams are built:

- **Dreams are compact.** Every size class is at most a quarter of the first
  dream's 110×110 area. A medium dream is about 50×50 tiles. Reach targets
  are maxima, not minimums
  ([P13](decisions.md#p13-map-sizes-and-walking-speed)).
- **Paths are wide and easy to find.** Routes to every anchor are at least 2
  tiles wide, and the main routes out of town at least 3. Detours are
  bounded, and walkable ground looks walkable. The validator and inspector
  enforce this ([P33](decisions.md#p33-towns-and-walkable-paths)).
- **Every dream starts in a town.** The player arrives at the town door. The
  waypoint, the shop, the quest givers and the placed services stand in a
  friendly cluster around it. Challenges lie beyond, so the player never has
  to backtrack for services
  ([P33](decisions.md#p33-towns-and-walkable-paths)).

The work runs as `playtest` beads in the Phase 3 epic, ahead of other
ready work ([Phase 3 § Playtest revisions](phase-3-act-one.md#playtest-revisions)):

| Bead | Work | Waits for |
| --- | --- | --- |
| PT.1 `hv-j1n2.66` (core) | Map tunables, validator and inspector for compact sizes, reach maxima, path widths, detours and towns | This plan revision |
| PT.1a `hv-j1n2.67` | Review and QA of PT.1 | PT.1 |
| PT.2 `hv-j1n2.68` (creative) | The first dream rebuilt at no more than 56×56 around a starting town; new runs spawn at the town door | PT.1 |
| PT.2a `hv-j1n2.69` | Review and QA of the rebuilt first dream, on foot | PT.2 |
| PT.3 `hv-j1n2.70` | Design documents aligned with P13 and P33 | This plan revision |

Catalog dream map beads (3.19) wait for PT.1. The dream catalog schema (3.1)
waits for PT.2.

## Operating model

- **One Hive project, two streams.** D97 beads carry
  `hive_project=dreamtides_web` and `hive_stream=d97`. Main-plan beads carry no
  stream. A session started with `--stream d97` sees only D97 beads; a session
  started without a stream sees only unstreamed beads
  ([P1](decisions.md#p1-hive-streams)).
- **Executor sessions.** Any number of Claude Code or Codex sessions in the
  `d97` stream. Each claims one ready bead, implements it itself or through
  one implementation subagent, lands it on `staging`, and claims the next. Any
  host may claim any bead, creative beads included
  ([P21](decisions.md#p21-any-host)).
- **Concurrency is in the bead graph.** Semantic dependency edges hold real
  prerequisites. Serialization edges order only incompatible changes to the
  same behavior. Ordinary merge conflicts are resolved with
  `tg --no-launch update` ([workflow § Serialization](workflow.md#serialization)).
- **Delivery.** Each bead is one Conventional Commit in a Tollgate worktree,
  submitted with `tg candidate` and authorized with `tg approve --wait`. This
  plan grants promotion authority for in-scope D97 work.
- **Validation.** The gate stage runs on every candidate, within a 60 s
  budget (about 19 s median at plan time). The full suite runs later in the
  release stage. A red release run files a
  `ci-fix` bead, which preempts everything
  ([workflow § Validation](workflow.md#validation)).

## Starting and resuming the stream

The planning session ran Phase 0
([P3](decisions.md#p3-bootstrap-by-the-planning-session)); its record is in
the Phase 1 epic's notes (`hv-rtga`). The operator starts D97 executor
sessions in `~/dreamtides_web`, as many as they choose, with:

```text
/executor dreamtides_web --stream d97 — continuous mode is explicitly
authorized for stream d97 of project dreamtides_web. Execute
docs/dreamtides-97/plan/README.md as one of its executor sessions, without
pausing for approval. Promotion of in-scope D97 plan work is authorized.
```

(In Codex, invoke the `executor` skill with the same text.)

- **Waiting.** A session with nothing ready waits with `hive executor await`,
  as in the main plan. Waits count beads held in either stream, so a D97 bead
  blocked by a main-plan bead keeps its session waiting rather than drained.
- **Scaling down.** To drain a session, tell it to stop after its current bead.
- **Abandoned sessions** are handled as in
  [workflow § Re-entry](workflow.md#re-entry).

## Global invariants

These carry over from [AGENTS.md](../../../AGENTS.md):

- **Identify content by UUID, never by name.** Card names are not unique, and
  D97 dreams have no names at all
  ([P10](decisions.md#p10-dreams-are-unnamed)).
- **Use branded identity types,** from `src/types/identifiers.ts`, for every
  D97 identity.
- **Never commit image files.** This covers LPC art, composited sheets, map
  renders, previews and QA captures. Committed art data is text only: recipes,
  manifests and map modules.
- **Log new features** well enough to reconstruct a production run, with
  UUIDs and never names (Appendix B §B17, main-plan D40).
- **Tunables live in the D97 catalog modules,** never as literals in logic.
- **Player-facing copy lives in UI and content modules.** Dialogue text is
  content; rules code never builds display strings.
- **Docs describe the current system.** Never write "no longer" or "removed"
  phrasing.
- **Log pre-existing issues** in
  `docs/dreamtides-97/plan/evidence/pre-existing/<bead-id>.md`, in the same
  commit.
- **Leave the primary checkout alone.** All work happens in Tollgate
  worktrees. The exception is QA captures, which go in its gitignored
  `artifacts/qa/<bead-id>/`.
- **Never shell out to another agent.** No `codex exec`, `claude -p` or any
  other agent CLI from the shell. Reviews are beads
  ([P32](decisions.md#p32-reviews-are-beads)).
- **Never deploy.** Other repositories are touched only as
  [P22](decisions.md#p22-other-repositories) allows.
- **Never break a save.** Every change to persisted D97 state ships a
  migration and a golden fixture ([P5](decisions.md#p5-saves-are-versioned-snapshots)).
  Each milestone also commits a real save from its build as a milestone
  fixture ([P25](decisions.md#p25-tests)).

## Evidence

These records are run-scoped and live under `docs/dreamtides-97/plan/`.
Dream briefs are content, not evidence: each lives beside its dream module
as `src/content/d97/dreams/<dream-uuid>.md`
([P18](decisions.md#p18-dream-authoring-beads)).

| Record | Path | Written by |
| --- | --- | --- |
| Pre-existing issues | `evidence/pre-existing/<bead-id>.md` | Any bead |
| Retrospectives | `evidence/retrospectives/<bead-id>.md` | Phase-end retrospective beads |
| Calibration reports | `evidence/calibration/<bead-id>.md` | Phase 6 |
| Final report | `report.md` | The Phase 6 gate |

**Friction** is recorded in each bead's close notes as tagged lines, not in a
ledger file ([workflow § Introspection](workflow.md#introspection)). Bead
notes are the progress ledger. Phase pages are never edited to record status,
only refined at filing time.

The Phase 6 gate deletes `docs/dreamtides-97/plan/` except `report.md`.

## Done criteria

The stream is complete when all of these hold:

1. Every D97 phase gate bead is closed with `hive_resolution=completed`, and
   `release` contains every D97 commit.
2. A new run can be played from Avatar select through Apollyon's defeat and
   into the endgame, on desktop and mobile, with an empty `window.__caps`.
   Every dream is compact and opens on its town, and every map meets
   P33's path rules in the validator.
3. The run simulator's happy-path and full-clear policies meet the
   Appendix E acceptance targets, or `report.md` records each miss with its
   cause and the tunable that would close it.
4. A save written at each milestone (M1–M4) loads, migrated, in the final
   build. Each milestone's real save is committed as a milestone fixture
   ([P25](decisions.md#p25-tests)), and a test loads every one.
5. The design documents describe the delivered game.

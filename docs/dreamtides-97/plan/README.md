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
in [decisions](decisions.md) (P1–P32). Where this plan and the design
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
  - a catalog of about 40 dreams, with maps;
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

| # | Phase | Page | Earliest start | Exit gate (summary) |
| --- | --- | --- | --- | --- |
| 0 | Bootstrap | [phase-0-bootstrap.md](phase-0-bootstrap.md) | now (run by the planning session) | Hive streams live; AGENTS.md and D33 updated; Phase 1 filed and admitted |
| 1 | First dream (**M1**) | [phase-1-first-dream.md](phase-1-first-dream.md) | after Phase 0 | One medium dream playable from Avatar select to the guarded exit, saved robustly; M1 review/QA landed; co-op residue removed |
| 2 | Consolidation | [phase-2-consolidation.md](phase-2-consolidation.md) | M1 QA bead | Design docs aligned; story bible; map tooling hardened; rooms; mason refactors; first retrospective |
| 3 | Act 1 (**M2**) | [phase-3-act-one.md](phase-3-act-one.md) | 2.2 and 2.4 | A full assembled Act 1 of about 8 catalog dreams, with doors, waypoints, Atlas, guides, sages, chests, amulets, Dreamsign slots and the incarnation |
| 4 | Campaign (**M3**) | [phase-4-campaign.md](phase-4-campaign.md) | Phase 3 gate | Acts 2–5, Limbo and Apollyon; bag layers, refills, Avatar quests and switching; difficulty; catalog at about 40 dreams |
| 5 | Endgame (**M4**) | [phase-5-endgame.md](phase-5-endgame.md) | Phase 4 assembly beads | Keys, key dreams, prizes, Legendary Dreamsigns, Perfected cards |
| 6 | Calibration and polish (**M5**) | [phase-6-calibration.md](phase-6-calibration.md) | Phase 4 gate | Run simulator; Appendix E targets met or documented; mobile polish; final acceptance |

**Milestones never pause the stream**
([P8](decisions.md#p8-milestones-never-pause-the-stream)). The operator plays
whenever they like. Their feedback arrives as `playtest` beads, which preempt
other ready work.

**Process grows after M1** ([P9](decisions.md#p9-process-light-until-m1)).
Phase 1 runs with the gate stage, release-stage `ci-fix` beads and one
combined review/QA bead at the milestone. From Phase 2 on:

- each code bead gets a paired review/QA bead;
- creative beads get batched QA beads;
- each phase ends with a refactor-and-tooling pass and a retrospective.

**Phase pages are refined lazily.** Each phase's filing bead first updates
its phase page from what the earlier phases taught, then files the beads
([workflow § Filing a phase](workflow.md#filing-a-phase)). Pages for
Phases 3–6 are outlines until then.

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
- **Validation.** The gate stage of about 60 s runs on every candidate. The
  full suite runs later in the release stage. A red release run files a
  `ci-fix` bead, which preempts everything
  ([workflow § Validation](workflow.md#validation)).

## Starting and resuming the stream

Phase 0 is run by the planning session after the operator approves this plan
([P3](decisions.md#p3-bootstrap-by-the-planning-session)). When it closes,
the operator starts D97 executor sessions in `~/dreamtides_web` with:

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

## Evidence

Everything here is run-scoped and lives under `docs/dreamtides-97/plan/`.

| Record | Path | Written by |
| --- | --- | --- |
| Pre-existing issues | `evidence/pre-existing/<bead-id>.md` | Any bead |
| Dream briefs | `evidence/dreams/<dream-uuid>.md` | Concept-and-map beads |
| Retrospectives | `evidence/retrospectives/<bead-id>.md` | Phase-end retrospective beads |
| Calibration reports | `evidence/calibration/<bead-id>.md` | Phase 6 |
| Final report | `report.md` | The Phase 6 gate |

**Friction** is recorded in each bead's close notes as tagged lines, not in a
ledger file ([workflow § Introspection](workflow.md#introspection)). Bead
notes are the progress ledger. Phase pages are never edited to record status,
only refined at filing time.

The Phase 6 gate deletes `docs/dreamtides-97/plan/` except `report.md` and
the dream briefs. The briefs move beside their dream modules if a later
decision keeps them.

## Done criteria

The stream is complete when all of these hold:

1. Every D97 phase gate bead is closed with `hive_resolution=completed`, and
   `release` contains every D97 commit.
2. A new run can be played from Avatar select through Apollyon's defeat and
   into the endgame, on desktop and mobile, with an empty `window.__caps`.
3. The run simulator's happy-path and full-clear policies meet the
   Appendix E acceptance targets, or `report.md` records each miss with its
   cause and the tunable that would close it.
4. A save written at each milestone (M1–M4) loads, migrated, in the final
   build. The golden fixtures pin this.
5. The design documents describe the delivered game.

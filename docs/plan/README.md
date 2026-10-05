# Dreamtides Web: End-to-End Delivery Plan

One orchestrating Claude Code session, running unattended with implementation
subagents in parallel lanes, turns this fork of the journey prototype into the
complete Dreamtides web game:

- A full rules engine that automates every card, dreamsign, avatar, and
  Dreamwell card.
- The existing journey and UI running on top of that engine.
- A competent AI opponent, built last.

The plan executes without operator review. Every decision the operator made
before launch is recorded in [decisions](decisions.md). Every decision the
agent makes during the run is recorded in the ledgers listed
[below](#evidence-and-ledgers).

**This page is the re-entry point.** After any context compaction, resume, or
restart, do these steps in order:

1. Read this page.
2. Follow [workflow → Re-entry](workflow.md#re-entry-after-compaction-or-restart).
3. Read only the page for the current phase.

## Outcomes

When the run ends:

- **Battles run on the engine.** Every battle is played by the engine through
  the existing battle UI. Every player input, whatever raised it, goes through
  one prompt protocol
  ([D31](decisions.md#d31-prompt-architecture-replay-suspended-steps)).
- **All content works as printed.** That means:
  - all 521 cards and their 244 amplified variants, plus Contemplation
    ([C1](decisions.md#c1-contemplation));
  - 153 dreamsigns, with battle and journey effects;
  - 32 avatars;
  - 33 Dreamwell cards;
  - the figment catalog;
  - Nightmare;
  - all nine transfigurations;
  - exploration deck-entry modifications and next-battle effects
    ([D39](decisions.md#d39-deck-entry-modifications-and-next-battle-effects)).

  "As printed" means as defined by `docs/rules.md` and the operator's
  [card text clarifications](decisions.md#card-text-clarifications).
- **The tutorial runs on the engine,** keeping all of its guidance.
- **Apollyon has mechanics.** All ten incarnations get provisional, documented
  mechanics.
- **The AI is competent and fair.** The enemy AI plays any deck, observes the
  [D23](decisions.md#d23-ai-thinking-budget) budgets, and is improved by
  tournaments until it plateaus
  ([D25](decisions.md#d25-ai-phase-stop-rule)). The work is best effort, with
  no time box.
- **The codebase is aggressively lean:**
  - solo and local-first;
  - English-only;
  - data in typed TypeScript modules;
  - no Rust, Firebase, RON, editors, or co-op;
  - three docs ([D33](decisions.md#d33-documentation-end-state));
  - a small, fast test suite ([D19](decisions.md#d19-test-pruning)).
- **The delivery loop is fast and measured.** A gate stage of about 60 s
  promotes to `staging`. The full suite runs asynchronously as Tollgate's
  release stage ([D44](decisions.md#d44-staged-validation)). Tollgate restarts
  in seconds ([Track T](phase-t-tollgate.md)).

## Baseline at fork

Measured on 2026-10-03, from `quest_prototype` master `16b08220d`. History
was rewritten for the public repository
([D2](decisions.md#d2-public-repository-and-no-deploys)).

| Fact | Value |
| --- | --- |
| Source (non-test TS/TSX) | ~207k lines (`src/cumulus` 77k incl. a 14k-line docs site, `src/editor` 22k, `src/rules` 18k, `src/screens` 17k, `src/battle` 17k, `src/coop` 12k) |
| Tests | 497 files, ~172k lines |
| Tooling | 201 scripts (~51k lines); 45 custom ESLint rules; a 26.6k-line Rust RON compiler (`tools/game-data`); the Trox localization pipeline (Rust CLI, 4 locales) |
| Docs and skills | 175 tracked files under `docs/`; 23 project skills (~5k lines); `dda/` |
| Full gate in the fork (2 test workers) | deps 7.0 s, trox 47.4 s, `review:full` 228.4 s (pre-flight run) |
| Battle | Manual sandbox: structural automation via `BattleDebugEdit`; about 11 cards semantically automated; the AI only proposes moves and knows only the 10 Starter cards |
| Content | 376 characters and 145 events (36 Fast, 36 Interrupt); 244 amplified texts; 153 dreamsigns, journey-map effects unimplemented; 32 avatars; 33 Dreamwell cards; 35 RON catalogs |
| Energy | Dreamwell-driven from 0; `STANDARD_ENERGY_RAMP` is dead code |
| Apollyon | 10 flavor-only incarnations; `bosses.md` lists 20 unrelated forms |
| Reference engine | `~/dreamtides` (Rust): older "Judgment" ruleset, text parser, and UCT AI. Use it as precedent only where rules text is unchanged |

## Non-goals

- **Meta-progression.** It is the first follow-up project.
- **Deploys and hosting.**
- **Multiplayer.**
- **Localization** (D35).
- **Card design or balance changes.** Card data is immutable; see
  [D11](decisions.md#d11-card-data-is-immutable).
- **UI redesign.** Look and flows are preserved; see
  [D30](decisions.md#d30-ui-preservation).

## Phase map

Work runs in **dependency order** ([D26](decisions.md#d26-dependency-ordered-execution)).
Each phase page has a task graph and an **earliest start**. A later phase's
tasks start as soon as their prerequisites have landed, so phases overlap.
Phase gates still close in order. There are no time boxes anywhere; the AI
improvement loop ends on its plateau stop rule.

| # | Phase | Page | Earliest start | Exit gate (summary) |
| --- | --- | --- | --- | --- |
| 1 | Workflow introspection | [phase-1-workflow.md](phase-1-workflow.md) | (complete) | Baselines and budgets recorded; context diet and measured speedups landed; surviving tests triaged |
| 2 | Aggressive cleanup | [phase-2-cleanup.md](phase-2-cleanup.md) | (in progress) | Three docs and one skill; English-only; TS data modules; no Rust, RON, Firebase, editors, co-op, or analysis tooling; scripts and lint rules culled; the test cut meets the D19 budgets; local-first log; mason refactors; re-measured |
| T | Tollgate | [phase-t-tollgate.md](phase-t-tollgate.md) | now | Fast restarts; staged validation live for this repository; skills and Hive consistent |
| 3 | Rules engine core | [phase-3-engine.md](phase-3-engine.md) | now (3.1); 3.2 after the Phase 2 lint, script, and battle-test cuts | Headless deterministic engine; prompt protocol proven by property tests; stack, triggers, layers, zones, DSL, loops, views; soak clean |
| 4 | Battle UI on the engine | [phase-4-battle-ui.md](phase-4-battle-ui.md) | 4.0 after the Phase 2 gate; 4.1 after 3.4 | Engine battles in the existing UI against placeholder bots; one `PromptHost` for every prompt; journey sandbox and old AI removed; card-lab and sweep ready |
| 5 | Content | [phase-5-content.md](phase-5-content.md) | 5.1 after 3.4; 5.6 after 5.1; card batches after the Phase 3 gate and 4.6 | Every entity is implemented, audited, swept, and judged; journey dreamsign effects, transfigurations, and Apollyon done; engine mason pass |
| 6 | Tutorial on the engine | [phase-6-tutorial.md](phase-6-tutorial.md) | 6.0 after the Phase 2 gate; 6.1 after the Phase 4 gate and the first card batch | Tutorial battle and journey guidance work end to end; tutorial sandbox deleted |
| 7 | AI (last) | [phase-7-ai.md](phase-7-ai.md) | 7.1 after 4.5; 7.2 after the Phase 5 gate | Every AI build task done; champion plateaus for three iterations; final acceptance; report; docs end state |

Every phase ends with a **mason pass** just before its gate. Every bead it
files is implemented within that phase
([D37](decisions.md#d37-mason-pass-every-phase)), so nothing is deferred past
the run.

**Tests are deleted early** ([D19](decisions.md#d19-test-pruning)). Tests of
code that a later phase replaces are deleted when the replacing work starts,
not at the end. Phase 2 cuts the suite to the D19 budgets before the engine
work starts.

Workflow and architecture friction is fixed while the run is underway
([D42](decisions.md#d42-continuous-introspection)). Every bead records its
friction. A cause that recurs, or a budget that keeps being exceeded, files an
improvement bead that runs next. Retrospectives run after every 10th bead of a
phase and at every gate.

The run ends when the Phase 7 epic closes.

Shared design references:

- [engine-design.md](engine-design.md): engine architecture, **decisions and
  prompts**, the ability DSL and content modules, loops, views, and the policy
  interface.
- [workflow.md](workflow.md): beads, delivery, reviews, QA, ledgers,
  resources, recovery, and re-entry.

## Operating model

**One orchestrating session; implementation subagents in parallel lanes**
([D43](decisions.md#d43-orchestrated-parallel-execution)).

- **Beads.** Each unit of work is one native Beads bead in the Hive store,
  with `hive_project=dreamtides_web`. Beads form a dependency graph, not a
  chain. Each bead declares the areas it may change.
- **The orchestrator** follows the Hive executor role in explicitly
  authorized continuous mode, restricted to project `dreamtides_web`. It owns
  every Beads call, every Tollgate queue action, worktree creation, reviews,
  retrospectives, and ledgers.
- **Lanes.** Up to two `dreamtides_web` implementation subagents and one
  Track T subagent run at once, on beads with disjoint areas.
- **Delivery.** Each bead is one Conventional Commit in a Tollgate worktree.
  The orchestrator submits it with `tg candidate <oid>` and authorizes it with
  `tg approve <id>`, never waiting on the gate. This plan grants promotion
  authority for in-scope work.
- **Other helpers:**
  - the independent reviewer (the Codex CLI), run asynchronously;
  - read-only subagents for mason audits, retrospectives, QA, and the
    fallback cold review;
  - background processes the session owns, such as dev servers, fuzz soaks,
    and tournaments.

## Starting and resuming the run

Pre-flight is complete:

- The fork is created and its history scrubbed of secrets.
- The remote is `git@github.com:thurn/dreamtides_web.git`.
- The repository is registered with Tollgate. Its trusted policy is the
  local, untracked `.tollgate/config.toml`, running `dependencies → trox →
  review` at 2 test workers, with remote sync to `origin/master` and local
  `master` sync (`sync_user_master`). Phase 2 removes the trox step.
- Project `dreamtides_web` is registered in `~/brain/hive.json`. That change
  is committed in `~/brain`, unpushed.
- The Codex reviewer was verified: `gpt-5.6-sol`, read-only sandbox enforced.

Phase 1 (epic `hv-b8ef`) is closed. The 2026-10-05 replanning session
re-filed the open work as dependency graphs:

- **Phase 2:** epic `hv-47xj`. Its remaining tasks and the new test-cut tasks
  follow the [Phase 2 task graph](phase-2-cleanup.md#task-graph).
- **Phase 3:** filed early, so 3.1 can start at once.
- **Track T:** filed, starting with the Tollgate startup fixes.

The bead IDs for each section are on those pages. Later phases are filed when
their earliest start approaches, per
[workflow](workflow.md#filing-a-phase).

The operator manages keep-alive and launches a single session in
`~/dreamtides_web` with:

```text
/executor dreamtides_web — continuous mode is explicitly authorized for project
dreamtides_web. Execute docs/plan/README.md end to end, phase by phase, without
pausing for approval. Promotion of in-scope plan work is authorized.
```

If the operator ever restarts the run in a **new** session, the old session's
claimed bead blocks the new actor. Before relaunching:

1. Release that session's bead assignments.
2. Leave its worktrees alone. The new session restarts those beads from fresh
   worktrees; see
   [workflow](workflow.md#re-entry-after-compaction-or-restart).

A session that started under the sequential model adopts this model at its
next re-entry. Its claimed bead finishes as a single lane.

## Global invariants

These carry over from [AGENTS.md](../../AGENTS.md) and bind every phase:

- **Identify content by UUID, never by name.** Names are not unique. Resolve
  names only at display time.
- **Never commit image files.** Screenshots go to the gitignored
  `artifacts/qa/` directory and are referenced by filename only.
- **Log new features.** Every new feature logs enough to reconstruct what the
  algorithm did in a given game. Logs go to `logs/journey-log.jsonl` in
  development and to per-game IndexedDB storage with JSONL export in every
  build ([D40](decisions.md#d40-production-log-capture)).
- **Write tests carefully.** Tests are deterministic, use synthetic fixtures,
  and pin observable contracts. They never assert UI strings, timing,
  statistics, or mutable production data. The coverage gate is the sanctioned
  data↔engine exception.
- **Tunables live in the TS data modules** (D32), never as literals in logic.
- **Copy lives in the UI copy module** (D35). The engine never builds display
  strings.
- **Docs describe the current state,** with no "no longer" or "removed"
  phrasing. After Phase 2 the docs are only those of D33.
- **Log pre-existing issues.** Record them in `./pre-existing-issues.txt`
  within the same commit.
- **Leave the primary checkout alone.** Never edit `~/dreamtides_web`
  directly; all work happens in Tollgate worktrees. The exception is the local
  Tollgate policy, under the Phase 1.2 rule. Tollgate fast-forwards its
  `master` after each promotion (`sync_user_master`). Never push worktree
  branches.
- **Never deploy.** Touch other repositories only as
  [D16](decisions.md#d16-pre-flight-and-the-agents-footprint) allows for
  Track T. Never touch other Hive projects' beads or shared Hive
  configuration.

## Evidence and ledgers

All of these are run-scoped and live under `docs/plan/`.

Parallel lanes write evidence one file per bead or per entry, so lanes never
conflict ([workflow § Evidence files](workflow.md#evidence-files)).

| Record | Path | Written by |
| --- | --- | --- |
| Measured baselines and budgets | `docs/plan/evidence/metrics.md`, folded at each gate from `measurements/<bead-id>.md` | Phases 1–2, then every gate |
| Friction ledger | `docs/plan/evidence/friction/<bead-id>.json` (Phase 1–2 history in `friction.jsonl`) | Every bead |
| Test triage ledger | `docs/plan/evidence/test-triage.jsonl` (Phase 1) and `test-triage/<bead-id>.jsonl` (Phase 2 test cut) | Phases 1–2 |
| Legacy battle behavior | `docs/plan/evidence/legacy-behavior.md` | Phase 4.7, read in Phase 5 |
| Content inventory | `docs/plan/evidence/content-inventory.json` | Phase 5 (generated by script) |
| Card QA ledger | `docs/plan/evidence/qa-ledger/<bead-id>.jsonl` | Phases 4–7 |
| Rules decisions | `docs/plan/evidence/rules-decisions/RD-<bead-id>-<n>.md`, plus normative text in `docs/rules.md` | Any phase |
| Card issues | `docs/plan/evidence/card-issues/<uuid>--<bead-id>.md` | Phase 5 onward |
| Tournament reports | `docs/plan/evidence/ai/*.md` | Phase 7 |
| Final report | `docs/plan/report.md` | End of Phase 7 |

Bead notes are the progress ledger. These documents are never edited to record
status.

The final bead deletes `docs/plan/` except `report.md`. The report folds in
the summaries of the ledgers, the rules decisions, and the card issues.

## Done criteria (whole run)

The run is complete when all of the following hold:

1. Every phase gate bead and the Track T gate bead are closed with
   `hive_resolution=completed`, and `release == staging == origin/master`.
2. The coverage gate passes. No entity is `pending`, and every `verifiedText`
   hash matches.
3. A fuzz soak of 10,000 seeded full battles passes with zero invariant
   violations or replay divergences. It uses full-pool random decks, random
   transfigurations, random deck-entry modifications, and random policies,
   with ≥10% of games in interactive replay mode.
4. The QA ledger has a sweep verdict for every card in base and amplified form.
   It also covers the transfiguration sample from
   [Phase 5.7](phase-5-content.md#57-transfigurations) and the deck-modification
   sample from [Phase 5.7b](phase-5-content.md#57b-deck-entry-modifications),
   plus judged verdicts per [D21](decisions.md#d21-browser-qa-coverage).
   Every `fail` has been fixed and re-verified.
5. The AI phase stop rule is satisfied; see
   [D25](decisions.md#d25-ai-phase-stop-rule).
6. Final acceptance passes on desktop and mobile:
   - full journeys with real battles, covering both the victory path (against
     Greedy) and the defeat path (against the champion); see
     [D41](decisions.md#d41-final-acceptance-opponents);
   - the tutorial;
   - ~10 full games against the champion, with a blunder report.
7. The D33 end state holds. The tracked docs are `README.md`,
   `docs/rules.md`, `docs/design.md`, `AGENTS.md`/`CLAUDE.md`, and the
   `cumulus` skill, plus `docs/plan/report.md` for the operator to read.

# Dreamtides Web: End-to-End Delivery Plan

One Claude Code session, running unattended for a week or more, turns this
fork of the journey prototype into the complete Dreamtides web game:

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
  the existing battle UI. No rule is resolved by hand.
- **All content works as printed.** That means all 521 cards and their 244
  amplified variants, 153 dreamsigns (battle and journey effects), 32 avatars,
  33 Dreamwell cards, the figment catalog, Nightmare, and all eight
  transfigurations. "As printed" means as defined by
  [battle_rules.md](../battle_rules/battle_rules.md).
- **Play is solo and local-first.** The intent log and the pure fold persist in
  the browser. Firebase is not used at runtime.
- **The tutorial runs on the engine**, keeping all of its guidance.
- **Apollyon has mechanics.** All ten incarnations get provisional, documented
  mechanics.
- **The AI is competent and fair.** The enemy AI plays any deck, observes the
  budgets in [decisions D23](decisions.md#d23-ai-thinking-budget), and is proven
  by tournaments.
- **The codebase is clean and fast to work in.** Prototype-era systems are
  removed, and the agent's edit → validate → promote loop has measured, fast
  feedback.

## Baseline at fork

Measured on 2026-10-03, from `quest_prototype` master `16b08220d`. History
was rewritten for the public repository; see
[D2](decisions.md#d2-public-repository-and-no-deploys).

| Fact | Value |
| --- | --- |
| Source (non-test TS/TSX) | ~207k lines (`src/cumulus` 77k, `src/editor` 22k, `src/rules` 18k, `src/screens` 17k, `src/battle` 17k, `src/coop` 12k) |
| Tests | 497 files, ~172k lines |
| Scripts | 201 files, ~51k lines; 45 custom ESLint rules |
| Full gate (`npm run review:full` in Tollgate) | median 150 s, p90 181 s at 4 workers; plus ~10 s deps and ~26 s trox |
| Battle | Manual sandbox: structural automation via `BattleDebugEdit`; about 11 cards semantically automated; the AI only proposes moves and knows only the 10 Starter cards |
| Content | 376 characters and 145 events (36 Fast, 36 Interrupt); 244 amplified texts; 153 dreamsigns, many with journey-map effects that have no implementation; 32 avatars; 33 Dreamwell cards |
| Energy | Dreamwell-driven: both sides start at 0 and draws start in round 2; `STANDARD_ENERGY_RAMP` in `src/battle/engine/energy.ts` is dead code |
| Apollyon | `data/apollyon_incarnations.ron` holds 10 flavor-only "Aspects"; [bosses.md](../journeys/bosses.md) lists 20 unrelated forms |
| Reference engine | `~/dreamtides` (Rust): older "Judgment" ruleset, text parser, and UCT AI. Use it as precedent only where rules text is unchanged |

## Non-goals

- **Meta-progression.** It is the first follow-up project after this run.
- **Deploys.** This covers Firebase Hosting, Storage uploads, and public builds.
- **Multiplayer.** Neither co-op nor human-vs-human.
- **Card design or balance changes.** Card text, costs, and spark are
  immutable; see [D11](decisions.md#d11-card-data-is-immutable).
- **UI redesign.** Look and flows are preserved; see
  [D30](decisions.md#d30-ui-preservation).

## Phase map

Phases run **strictly in order**. A phase starts only after the previous
phase's gate bead is closed. There are no time boxes, except that the AI
improvement loop has its own stop rule.

| # | Phase | Page | Exit gate (summary) |
| --- | --- | --- | --- |
| 1 | Workflow introspection | [phase-1-workflow.md](phase-1-workflow.md) | Baselines recorded; context diet and CI speedups landed; surviving tests triaged; budgets monitored |
| 2 | Fork identity and legacy removal | [phase-2-cleanup.md](phase-2-cleanup.md) | Local-first log; co-op, Firebase runtime, editors, Tabula, Unity, and analysis tooling deleted; docs and skills pruned; mason refactors landed; re-measured |
| 3 | Rules engine core | [phase-3-engine.md](phase-3-engine.md) | Headless deterministic engine with stack, triggers, continuous effects, zones, DSL, loops, and views; fuzz soak clean |
| 4 | Battle UI on the engine | [phase-4-battle-ui.md](phase-4-battle-ui.md) | Journeys play full engine battles in the existing UI against placeholder bots; sandbox and old AI removed; card-lab and sweep tool ready |
| 5 | Content | [phase-5-content.md](phase-5-content.md) | Every entity is implemented, audited, swept, and judged per policy; journey dreamsign effects, transfigurations, and Apollyon done; engine mason pass landed |
| 6 | Tutorial on the engine | [phase-6-tutorial.md](phase-6-tutorial.md) | Tutorial battle and journey guidance work end to end |
| 7 | AI (last) | [phase-7-ai.md](phase-7-ai.md) | Champion clears the bar and plateaus, or the 3-day box expires; final acceptance and report |

Shared design references:

- [engine-design.md](engine-design.md): engine architecture, ability DSL,
  prompts, loops, views, and the policy interface.
- [workflow.md](workflow.md): beads, delivery, reviews, QA, ledgers,
  resources, recovery, and re-entry.

## Operating model in one paragraph

**One Claude Code session executes everything sequentially.**

- Each unit of work is one native Beads bead in the Hive store, with
  `hive_project=dreamtides_web`.
- Each bead is delivered by the `wt` workflow: a Tollgate worktree, one
  Conventional Commit, `tg candidate HEAD`, and then
  `tg approve <id> --wait`. This plan grants promotion authority for in-scope
  work.
- The session follows the Hive executor role in explicitly authorized
  continuous mode, restricted to project `dreamtides_web`.
- Implementation is never delegated. The only permitted helpers are:
  - the independent reviewer, which is the Codex CLI;
  - its fallback cold-review subagent;
  - background processes the session itself owns, such as dev servers, fuzz
    soaks, and tournaments.

## Starting the run

Pre-flight is complete:

- The fork is created and its history scrubbed of secrets.
- The remote is `git@github.com:thurn/dreamtides_web.git`.
- The repository is registered with Tollgate. Its trusted policy is the
  local, untracked `.tollgate/config.toml`, running `dependencies → trox →
  review` at 2 test workers, with remote sync to `origin/master`.
- Project `dreamtides_web` is registered in `~/brain/hive.json`. That change
  is committed in `~/brain`, unpushed.

Phase 1's beads are already filed: epic `hv-b8ef`, with tasks `hv-b8ef.1`–`.5`
chained in order. Later phases are filed at their start, per
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

1. Release that bead's assignment.
2. Leave its worktree alone. The new session restarts the bead from `release`;
   see [workflow](workflow.md#re-entry-after-compaction-or-restart).

## Global invariants

These carry over from [AGENTS.md](../../AGENTS.md) and bind every phase:

- **Identify content by UUID, never by name.** Names are not unique. Resolve
  names only at display time.
- **Never commit image files.** Screenshots go to the gitignored
  `artifacts/qa/` directory and are referenced by filename only.
- **Log new features.** Every new feature logs enough to reconstruct what the
  algorithm did in a given game. Logs go to `logs/journey-log.jsonl`.
- **Write tests carefully.** Tests are deterministic, use synthetic fixtures,
  and pin observable contracts. They never assert UI strings, timing,
  statistics, or mutable production data.
- **Describe documentation in the current state.** Write what exists; never
  write "no longer" or "removed" phrasing in maintained docs.
- **Use RON for tunables.** Gameplay and UI tunables live in RON whenever
  reasonable (the journeys "Golden Rule"). Card abilities live in the TS DSL;
  see [D5](decisions.md#d5-ability-representation).
- **Log pre-existing issues.** Record them in `./pre-existing-issues.txt`
  within the same commit.
- **Leave the primary checkout alone.** Never edit the primary checkout
  `~/dreamtides_web` directly; all work happens in Tollgate worktrees. Never
  push worktree branches.
- **Never deploy.** Never touch other repositories, other Hive projects'
  beads, or shared Hive configuration.

## Evidence and ledgers

| Record | Path | Written by |
| --- | --- | --- |
| Measured baselines and budgets | `docs/plan/evidence/metrics.md` | Phases 1–2, then every phase gate |
| Test triage ledger | `docs/plan/evidence/test-triage.jsonl` | Phases 1–2 |
| Content inventory | `docs/plan/evidence/content-inventory.json` | Phase 5 (generated by script) |
| Card QA ledger (sweep and judged verdicts) | `docs/plan/evidence/qa-ledger.jsonl` | Phases 4–7 |
| Rules decisions | `docs/rules_decisions.md`, plus normative text in `docs/battle_rules/battle_rules.md` | Any phase |
| Card issues | `docs/card_issues.md` | Phase 5 onward |
| Apollyon designs (provisional) | `docs/journeys/bosses.md` | Phase 5 |
| Tournament reports | `docs/plan/evidence/ai/*.md` | Phase 7 |
| Final report | `docs/plan/report.md` | End of Phase 7 |

Bead notes are the progress ledger. These documents are never edited to record
status.

## Done criteria (whole run)

The run is complete when all of the following hold:

1. Every phase gate bead is closed with `hive_resolution=completed`.
2. The coverage gate passes: every card, dreamsign, avatar, and Dreamwell UUID
   in the catalogs has an engine definition, and every definition's text hash
   matches.
3. A fuzz soak of 10,000 seeded full battles, using random decks from the whole
   pool and random policies, reports zero invariant violations.
4. The QA ledger has a sweep verdict for every card in base and amplified form.
   It also covers the transfiguration sample defined in
   [Phase 5.7](phase-5-content.md#57-transfigurations), plus judged verdicts per
   [D21](decisions.md#d21-browser-qa-coverage). Every `fail` has been fixed and
   re-verified.
5. The AI phase stop rule is satisfied; see
   [D25](decisions.md#d25-ai-phase-stop-rule).
6. Final acceptance passes on desktop and mobile:
   - full journeys, covering both the victory and the defeat path;
   - the tutorial;
   - ~10 full games against the champion, with a blunder report.
7. `docs/plan/report.md` is written and promoted.

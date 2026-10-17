# Plan

This repository runs two delivery plans side by side, each executed
unattended by peer executor sessions, Claude Code or Codex. Both share Hive
project `dreamtides_web`, one Tollgate queue and one `staging` branch. They
are split into Hive streams:

- **The main plan**, in the default stream:
  [docs/plan/README.md](docs/plan/README.md). Its decisions in
  [docs/plan/decisions.md](docs/plan/decisions.md) are binding, and
  [docs/plan/workflow.md](docs/plan/workflow.md) defines how work is filed,
  serialized, claimed, implemented, delivered, reviewed and QA'd. Its sessions
  start without `--stream` and see only beads without `hive_stream`.
- **Dreamtides 97**, in stream `d97`:
  [docs/dreamtides-97/plan/README.md](docs/dreamtides-97/plan/README.md), with
  its own binding decisions and workflow beside it. Its sessions start with
  `--stream d97` and see only beads with `hive_stream=d97`.

A session follows the plan of its stream and never claims the other stream's
beads. Where this file cites a `docs/plan/` workflow section, the
pre-existing-issues path or decision D16, a D97 session uses the D97 plan's
workflow, `docs/dreamtides-97/plan/evidence/pre-existing/<bead-id>.md` and
decision P22 instead. D97 code review happens only in D97's review/QA beads,
whose session reviews with `warden` itself (D97 decision P32); the review
bullet under Delivery applies to the main plan.

Each executor session claims and lands one bead at a time. An implementation
subagent works only in the worktree and areas its session gives it, makes one
commit, and never runs `bd`, `tg candidate`, `tg approve`, `tg update`, or
`tg worktree`; its session does, for its own beads only, and alone rebases
their worktrees with `tg --no-launch update` (docs/plan/workflow.md
§ Updating a worktree).

# Delivery

- Use the `wt` skill (`~/.llms/skills/wt/SKILL.md`, not project-local) for
  all work unless explicitly asked to work "on master". Never edit the primary
  checkout directly; all work happens in Tollgate worktrees. Gitignored QA
  captures under its `artifacts/qa/` are written there directly. Repairs to an
  unlanded candidate stay in the same worktree; new work gets a new bead.
- Do not create new branches unless explicitly requested. Worktree branches
  are local-only and are never pushed.
- When work is complete, create one detailed local Conventional Commit. In
  the plan run, a subagent stops there and its session submits it with
  `tg candidate <oid>`. The plan grants promotion authority for
  in-scope plan work and in-scope CI repairs: authorize the exact candidate
  with `tg approve <candidate-id> --wait` without asking, and wait for it to
  land before claiming the next bead. Each session runs one bead and one
  implementation subagent at a time; sessions run side by side as far as the
  bead graph's serialization edges allow (docs/plan/workflow.md). Tollgate
  owns regeneration, certified promotion, and the leased remote push.
- Serialization aims to limit costly merge conflicts, not prevent every merge
  conflict. Keep independent work runnable, including bounded changes in
  different functions or independent cases of a shared file. Add ordering for
  a real implementation prerequisite or incompatible changes to the same
  behavior; a shared filename or possible textual conflict alone is insufficient.
  Record the precise overlap. Owners resolve ordinary integration conflicts
  with `tg --no-launch update` and validate the combined behavior. Preserve
  semantic prerequisites and final acceptance joins. Project-specific rules in
  docs/plan/workflow.md govern this tradeoff over generic skill guidance.
- Tollgate's local gate is the only CI. Never add GitHub Actions workflows.
- All code reviews use fresh read-only Codex subagents with no prior context,
  regardless of which model implemented the change. Spawn each reviewer with
  `fork_turns: "none"`, supplying only its review brief and exact source inputs.
  This permanent user policy takes precedence over review routing in shared
  skills. Request review at every plan phase gate and for every bead the phase
  pages mark core-review; see the Reviews section of `docs/plan/workflow.md`.
  This explicitly authorizes more than one review per session.
- Never deploy, upload assets, or run `npm run deploy`. Touch other
  repositories only as decision D16 allows: for Track T, and under its
  tooling-fix exception, where a Hive or Tollgate defect blocking the run is
  fixed at its cause as its own bead under that repository's AGENTS.md, with
  D45's promotion authority. Never touch other Hive projects' beads or shared
  Hive configuration.
- Do not print a summary of changes.

# Invariants

- **Content is identified by UUID, never by name.** Card names ARE NOT
  UNIQUE. A map or set keyed by card name, or comparing card names for
  equality, is ALWAYS A BUG; eradicate it when spotted. Resolve names only
  immediately before display in the UI.
- **Identities use branded types** from the `parse*`/brand helpers in
  `src/types/identifiers.ts` and `src/types/card-identity.ts`, never raw
  `string`; `dreamtides/no-raw-string-identity` enforces this.
- **Never commit image files.** QA screenshots go to the primary checkout's
  gitignored `/Users/dthurn/dreamtides_web/artifacts/qa/<bead-id>/` (see
  `docs/plan/workflow.md` § Screenshots) and are referenced by filename only.
- **Log new features** well enough to reconstruct what an algorithm did in a
  given production game. Logs go to `logs/journey-log.jsonl` in development
  and to per-game IndexedDB storage with JSONL export in every build (D40);
  read them for all production game design debugging. Logs carry UUIDs, never
  names.
- **Tunables live in the data catalogs**, never as literals in logic.
- **Player-facing copy lives in UI modules.** Rules code never builds display
  strings.
- **Pre-existing issues** you encounter go in your bead's own file,
  `docs/plan/evidence/pre-existing/<bead-id>.md` (D97 stream:
  `docs/dreamtides-97/plan/evidence/pre-existing/<bead-id>.md`), included in
  the same commit.
- **Never shell out to another agent.** No `codex exec`, `claude -p` or any
  other agent CLI from the shell, for reviews or anything else. Use the host's
  own subagents, or a bead.
- **Documentation describes the current system.** Never describe what the
  system *no longer* does: phrasings like "X no longer exists", "there is no
  longer a Y", "we removed Z", or "unlike before" are not acceptable.

# Tests

- Write deterministic tests against stable observable contracts using
  synthetic fixtures.
- Never gate CI on mutable production data, copy, default algorithm choices,
  private implementation details, statistical or timing thresholds,
  load-sensitive behavior, or commands that reference deleted tests. The
  content coverage gate (`docs/plan/engine-design.md`) is the one sanctioned
  data-to-engine exception.
- Do not write tests which assert on specific UI strings.

# Architecture pointers

- Battle rules: `docs/rules.md`. Game and journey design: `docs/design.md`.
  Running, testing, browser QA, architecture, and data layout: `README.md`.
- Content catalogs live in `src/content/`: cards in `src/content/cards/`,
  Avatars in `src/content/avatars/`. Card, Dreamsign, Avatar, and affiliation
  selection derives from these catalogs; `src/content/tides.ts` defines the
  shared affinity space.
- Draft questions concern the "tides4" draft pool algorithm unless stated
  otherwise; its sources are `src/content/tides.ts` and the tide pools
  embedded in the Avatar modules.
- Game state is a fold of the event log. React `useState`/`useRef` never
  gates game flow; anything the game must agree on is an event in the log.
  Clients write intent events only, via `src/session/actions.ts`.
- Linked art and typed token mirrors are disposable workspace
  materializations refreshed by `scripts/prepare-workspace.mjs`.
  Do not edit or commit generated outputs.
- UI work uses the `cumulus` skill.

# Verification

Run commands from the repository root; run `npm install` first in a fresh
worktree.

- While iterating: `npm test -- src/path/to/affected.test.ts`.
- Before committing: `npm run review` and `npm run knip`. Delete the exports
  and files your own change leaves unused.
- `npm run review:full` (what Tollgate's release stage runs; its gate stage
  runs `npm run review:gate`) only for changes to test
  infrastructure, repository-wide configuration, or cross-cutting
  architecture.

Choose QA in proportion to the change:

- Data, documentation, and internal refactors: focused checks, then
  `npm run review`. No browser QA unless runtime behavior or presentation
  changes.
- Stateful UI, routing, drag/drop, and overlays: browser QA of the changed
  player workflow, asserting state, interaction results, DOM geometry, and an
  empty `window.__caps` error buffer.
- Visual or responsive changes: add one desktop capture, one mobile capture,
  and one changed interaction state.
- New screens, major redesigns, and renderer work: a wider state and viewport
  matrix plus one final cold visual review.

Browser QA follows the README's Browser QA section: the Playwright MCP
service, your own server on port 5174 or higher (never 5173), and killing only
your own server's process tree.

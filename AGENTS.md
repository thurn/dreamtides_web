# Plan

This repository is executing [docs/plan/README.md](docs/plan/README.md)
unattended. The decisions in [docs/plan/decisions.md](docs/plan/decisions.md)
are binding, and [docs/plan/workflow.md](docs/plan/workflow.md) defines how
work is filed, delivered, reviewed and QA'd. Hive project id:
`dreamtides_web`.

# Delivery

- Use the `wt` skill (`~/.llms/skills/wt/SKILL.md`, not project-local) for
  all work unless explicitly asked to work "on master". Never edit the primary
  checkout directly; all work happens in Tollgate worktrees. Follow-up work
  stays in the same worktree until promotion.
- Do not create new branches unless explicitly requested. Worktree branches
  are local-only and are never pushed.
- When work is complete, create one detailed local Conventional Commit and
  submit it with `tg candidate HEAD`. The plan grants promotion authority for
  in-scope plan work and in-scope CI repairs: authorize the exact candidate
  with `tg approve <candidate-id> --wait` without asking. Tollgate owns
  regeneration, certified promotion, and the leased remote push.
- Tollgate's local gate is the only CI. Never add GitHub Actions workflows.
- Request independent review (the `independent-review` skill, run through the
  Codex CLI) at every plan phase gate and for every bead the phase pages mark
  core-review; see the Reviews section of `docs/plan/workflow.md`. This
  explicitly authorizes more than one review per session.
- Never deploy, upload assets, or run `npm run deploy`. Never touch other
  repositories, other Hive projects' beads, or shared Hive configuration.
- Do not print a summary of changes.

# Invariants

- **Content is identified by UUID, never by name.** Card names ARE NOT
  UNIQUE. A map or set keyed by card name, or comparing card names for
  equality, is ALWAYS A BUG; eradicate it when spotted. Resolve names only
  immediately before display in the UI.
- **Never commit image files.** QA screenshots go to the gitignored
  `artifacts/qa/<bead-id>/` and are referenced by filename only.
- **Log new features** well enough to reconstruct what an algorithm did in a
  given production game. Logs go to `logs/journey-log.jsonl` in development
  and to per-game IndexedDB storage with JSONL export in every build (D40);
  read them for all production game design debugging. Logs carry UUIDs, never
  names.
- **Tunables live in the data catalogs**, never as literals in logic.
- **Player-facing copy lives in UI modules.** Rules code never builds display
  strings.
- **Pre-existing issues** you encounter go in `./pre-existing-issues.txt`,
  included in the same commit.
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

- Battle rules: `docs/battle_rules/battle_rules.md`.
- Card data: `data/cards.ron`; avatars: `data/avatars.ron`. Card, Dreamsign,
  Avatar, and affiliation selection derives from the canonical RON catalogs;
  `data/tides.ron` defines the shared affinity space.
- Draft questions concern the "tides4" draft pool algorithm unless stated
  otherwise; its sources are `data/tides.ron` and the tide pools embedded in
  `data/avatars.ron`.
- Coop game state is a fold of the room event log. React `useState`/`useRef`
  never gates game flow; anything both players must agree on is an event in
  the log. Clients write intent events only, via `src/coop/actions.ts`.
- Generated compatibility data, runtime catalogs, typed token mirrors, Cumulus
  metadata, and localization adapters are disposable workspace
  materializations refreshed by `scripts/prepare-workspace.mjs`. Do not edit
  or commit generated outputs.

# Verification

Run commands from the repository root; run `npm install` first in a fresh
worktree.

- While iterating: `npm test -- src/path/to/affected.test.ts`.
- Before committing: `npm run review` (diff-aware generated-data validation,
  lint, typecheck, and related tests).
- `npm run review:full` (what the gate runs), `npm run lint:full` and
  `npm run test:full` only for changes to test infrastructure,
  repository-wide configuration, or cross-cutting architecture.

Choose QA in proportion to the change:

- Data, documentation, and internal refactors: focused checks, then
  `npm run review`. No browser QA unless runtime behavior or presentation
  changes.
- Stateful UI, routing, drag/drop, coop, and overlays: browser QA of the
  changed player workflow, asserting state, interaction results, DOM geometry,
  and an empty `window.__caps` error buffer.
- Visual or responsive changes: add one desktop capture, one mobile capture,
  and one changed interaction state.
- New screens, major redesigns, and renderer work: a wider state and viewport
  matrix plus one final cold visual review.

Browser QA uses the globally configured Playwright MCP service against a QA
Vite server on port 5174 or higher (`npm run dev -- --port 5174`), never 5173.
Never launch browsers directly. `?goto=<scene>` boots straight onto a screen.
Kill only your own server's PID; a broad `pkill -f vite` kills the
developer's server. Session, scene, and teardown detail:
`docs/journey_prototype/qa_tooling.md` and
`docs/journey_prototype/qa_scenes.md`.

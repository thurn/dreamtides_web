# Decisions

These decisions were made with the operator in the planning interview on
2026-10-03, revised the same day, refined in two readiness reviews on
2026-10-04, and amended in a replanning session on 2026-10-05 (D16–D19 and
D26 amended; D43–D45 added). They are binding for the run. In the
[rules ambiguity ladder](#d10-rules-ambiguity-ladder) they outrank every other
precedent.

Each entry gives the decision, the reason, and its consequences. Further
sections:

- [Planner defaults](#planner-defaults) are choices the planner made with
  conventional answers. The agent may refine them through the ladder and must
  record any change.
- [Established facts](#established-facts) are behaviors the code already
  settles.
- [Card text clarifications](#card-text-clarifications) are the operator's
  readings of card, dreamsign, avatar, and Dreamwell text that the rules and
  the code do not settle.

**Rules document path.** The rules doc is `docs/rules.md`. Phase 2.1 moves it
there from `docs/battle_rules/battle_rules.md`. Phase 1 uses the old path.

## Project shape

### D1. Hard fork, no sync

`~/dreamtides_web` is a clone of `quest_prototype` master with full history.
Nothing flows between the two repositories during the run.

- **Why:** The agent must be free to restructure schemas, data, and code
  without merge pressure. The operator keeps `quest_prototype` for their own
  tinkering.
- **Consequences:**
  - This repository's content data is canonical for dreamtides_web.
  - Never read from or write to `~/quest_prototype`.

### D2. Public repository and no deploys

Tollgate pushes certified `release` to the public
`git@github.com:thurn/dreamtides_web.git` master.

Nothing is deployed during the run. Firebase is deleted from the project
entirely in Phase 2: Hosting config, Storage uploads, the deploy script, and
the SDK. A production build is a static `dist/`. Card art comes from
`VITE_ASSET_BASE_URL`, or from local symlinks in dev.

The repository has no GitHub Actions workflows. Tollgate's local gate is the
only CI.

Before the first push, the planning session scrubbed history with
`git filter-repo`. It replaced the hard-coded Discord webhook URL and every
`.env.production` value with placeholders.

- **Why:** The repository is public.
- **Consequences:**
  - Never commit secrets, `.env*` values, credentials, or images.
  - The operator chooses a host and configures it before any future deploy.

### D3. Local-first solo play

Keep the event-sourced architecture: player intents are folded by a pure
reducer, and time and randomness enter through the event context. Replace the
Firebase RTDB room transport with a local persisted log in IndexedDB.

Delete all of these:

- co-op;
- presence and identicons;
- Take Control and hosted-playtest controller semantics;
- optimistic echo, reconciliation, compaction, and room-generation recovery;
- the Firebase emulator;
- the JDK dependency.

The **why:**

- Production battles are against the AI.
- One local writer needs none of the conflict machinery.
- Determinism, replay, and fold-based testing are kept.

### D40. Production log capture

The Firebase room-log sink is how production games keep their logs today, and
D2 and D3 delete it. Its replacement is local:

- **Every build** persists each game's log entries in IndexedDB next to its
  `LocalLog`. Storage is capped; the oldest games' logs are evicted first.
- **An "Export log" control** in the error fallback and the game menu
  downloads the current game's log as JSONL, in the
  `logs/journey-log.jsonl` line format.
- **Development builds** keep the `/api/log` → `logs/journey-log.jsonl` file
  sink.

**Why:** a player can hand over one file that explains a production game,
with no server.

### D4. Debug tooling

Players take only legal engine actions and answer only engine prompts.

QA tools are re-implemented as **engine debug actions** that keep invariants,
behind `?debug=1` in development builds:

- add a card by UUID to a zone;
- set energy or score;
- force the next draw;
- reveal hidden zones;
- undo to an earlier intent.

The free-form sandbox is deleted: the debug rail, zone dragging, status and
counter edits, and the `BattleDebugEdit` path.

### D5. Ability representation

Abilities are **typed, declarative TypeScript data**:

- triggers;
- costs;
- effects;
- targets;
- conditions;
- durations.

One interpreter executes them. Each entity's abilities are **co-located with
its catalog entry** in the TypeScript content modules ([D32](#d32-typescript-data-modules)).
The entry carries its printed text, amplified text, and a
`verifiedText` hash of the text the abilities were checked against.

- **The printed English text is canonical.** The abilities are its
  TypeScript implementation, and the two are kept in sync by hand.
- A CI gate fails when the text changes without re-verification.
- There is no ability-to-English renderer. Displayed rules text, including
  transfigured text, always comes from the catalog text and the existing
  transfiguration text transforms, never from the abilities.

**Why:**

- It is the fastest form for the agent to iterate on.
- It is fully type-checked.
- Transfigurations become structural transforms of the AST.

**Rejected:** a text parser, which is brittle with free-form English.

### D6. Apollyon is designed by the agent, flagged provisional

For each of the 10 incarnations, author:

- an avatar-strength **Aspect ability** in the DSL;
- a **curated boss deck** around its deck archetype, using the opponent
  generator with archetype bias;
- **1–2 dreamsigns**.

Describe the implemented incarnations, marked provisional, in
`docs/design.md`. Sanity-check them with AI-vs-AI results.

### D7. Meta-progression is out of scope

No achievement or unlock system. Meta-progression is the first follow-up
project. `docs/design.md` keeps a short "Future: meta-progression" section
that preserves the sketch's intent.

### D8. Aggressive cleanup

**Keep only what builds, runs, tests, plays, or QAs the game.** Delete
everything else, including:

- **The in-app editors and their routes:** `/cards`, `/editor`,
  `/dreamsigns`, `/glossary`, `/exploration`, `/avatars`, `/tides`,
  `/dreamscapes`, `/figments`, `/dreamwell`. Also the image viewer
  (`/images`, `/images/favorites`), `/offers`, and the Cumulus docs site
  (`/cumulus`: `src/cumulus/docs/`, ~14k lines, with its metadata and docs
  generators and `react-docgen-typescript`).
- **Other projects in the tree:** Tabula, and the Unity Cumulus projects
  (`cumulus/` at the root).
- **The data pipeline:** the RON pipeline, including the 26.6k-line Rust
  `tools/game-data` compiler, the TOML compatibility layer, the RON
  formatter, and generated localization sources ([D32](#d32-typescript-data-modules)).
- **Firebase:** everything ([D2](#d2-public-repository-and-no-deploys)).
- **Co-op and room machinery:** all of it ([D3](#d3-local-first-solo-play)).
- **Analysis tooling:** the draft and pool analysis scripts, metrics,
  `first-pick-cache`, the alternate draft algorithms (keep only tides4), and
  the experiment scripts.
- **Scripts:** every script not reachable from an essential npm script. The
  essential scripts are dev, build, test, review, lint, typecheck,
  setup-assets, plus the run's new fuzz, tournament, sweep, and
  inventory tools. The target is ~200 → ~25 files.
- **Custom ESLint rules:** cut 45 → about 8. Keep only rules guarding real bug
  classes, such as name-keyed card logic and Cumulus spacing tokens.
- **Localization:** all of it ([D35](#d35-english-only)).
- **Docs and skills:** everything beyond the [D33](#d33-documentation-end-state)
  end state.
- **Other leftovers:** tracked junk (`saved-journeys/` unless a QA scene uses
  it, `.superpowers/`, stale artifacts) and the dev-only Cumulus devtools
  screens.

Keep these:

- the Cumulus components and tokens the game uses (`knip` prunes unused
  ones);
- whatever tides4 needs to build and run.

### D9. Tutorial is ported to the engine

All tutorial content and behavior stay:

- the standalone `/tutorial` scripted battle;
- the Mira guidance;
- the tutorial journey's first-visit and first-occurrence guidance.

The scripted battle becomes engine actions plus authored AI overrides that
resolve through normal engine play. Tutorial data becomes a TS content module.

### D38. Tutorial-journey battle guidance during Phases 4–5

Phase 4 moves journey battles onto the engine. Mira's in-battle guidance in
tutorial-journey battles may regress until Phase 6. Phase 4 ports it only
where that is cheap, and its gate notes list exactly what broke. That list is
explicit Phase 6.2 scope. The standalone `/tutorial` battle stays on its
frozen sandbox path until Phase 6 (Phase 4.7).

### D31. Prompt architecture: replay-suspended steps

Rules code is plain, synchronous TypeScript. `ctx.choose(prompt)` returns the
answer, with the "blocking" programming model of thread-based engines such
as Jinteki's. This holds for every source of input: card effects, triggers,
replacement effects, costs, play-time choices, and rules-mandated choices.

Suspension is implemented by deterministic replay, not threads:

- **Interactive play.** A missing answer throws `Suspend`. The fold persists
  `{stepStart, answers}` as plain data. Each new answer re-runs the current
  step from its start, fast-forwarding through earlier prompts. A prompt
  fingerprint check turns any nondeterminism into a loud failure.
- **AI search, fuzzing, and tests.** Answers are provided inline, so execution
  never suspends.

Full design: [engine-design § Decisions and prompts](engine-design.md#decisions-and-prompts).

**Why:**

- Save and reload work anywhere, including mid-prompt.
- The AI branches cheaply.
- No threads, headers, or function coloring are needed.
- The approach matches React Suspense's throw-and-retry.

**Rejected:**

- A truly blocking Web Worker using `Atomics.wait`. It needs cross-origin
  isolation, and it still needs replay for saves and AI.
- Generators. Their coloring spreads, and a silent missing `yield*` drops
  effects.
- Explicit continuation stacks. Hand-written resumable state machines are the
  classic source of prompt bugs.

### D32. TypeScript data modules

Every catalog becomes a typed TypeScript module under `src/content/`, for
example `export const CARDS = [...] satisfies readonly CardDefinition[]`. The
catalogs are cards, dreamsigns, avatars, Dreamwell, figments, tides, atlas,
dreamscapes, guides, sites, opponents, economy, tutorial, battle tunables,
the AI configuration, and Apollyon.

- **Text** is plain English strings ([D35](#d35-english-only)).
- **Comments** from the RON files are carried over.
- **`tsc` validates all data.** Runtime fetches of `/card-data.json` and
  similar files become imports.

The operator said JSON is fine. TS modules were chosen instead because:

- JSON would drop the explanatory comments;
- JSON gives only runtime validation;
- abilities can sit next to their entity's text.

**Golden Rule, restated:** gameplay and UI tunables live in these data
modules. They do not live as literals in logic.

### D33. Documentation end state

At the end of the run, the project's documentation is exactly:

- **`README.md`:** what the game is, how to run, test, and QA it, an
  architecture overview, the data layout, and the conventions.
- **`docs/rules.md`:** the authoritative battle rules, including every
  normative rules decision.
- **`docs/design.md`:** the game and journey design, including sites,
  economy, transfigurations, Nightmare, Apollyon (provisional), and the future
  meta-progression sketch.

Agent guidance is `AGENTS.md` plus at most one compact project skill,
`cumulus`, which must be self-contained. Everything else under `docs/`,
`dda/`, and `.llms/skills/` is deleted in Phase 2.

`docs/plan/` is run-scoped. The final bead deletes it, except for
`docs/plan/report.md`, which the operator deletes after reading.

### D35. English-only

dreamtides_web has no localization. Phase 2 deletes all of the following:

- the Trox pipeline: CLI, the Tollgate trox step, extraction,
  bundles, and the `ar`/`es`/`ja`/`ru` profiles;
- `trox.ron`, `localization/`, `.trox-revision`, and `vendor/trox-runtime`;
- the localization skill;
- the localization lint rules and audits.

`tx()`, `txa()`, and `LocalizedString` are codemodded into plain English
strings and string-returning functions.

**Separation stays.** Player-facing copy still lives in UI modules: one
module of prompt and log templates keyed by prompt `kind` and `role` and by
event kind. The engine never builds display strings.

**Why:** the run gets a smaller surface and a faster gate, with no Rust
toolchain.

## Rules

### D10. Rules ambiguity ladder

When `docs/rules.md` is silent or ambiguous, decide in this order:

1. An explicit decision in this file (D-entries, then C-entries, then
   P-entries).
2. Existing prototype behavior, where the prototype implements an actual rule.
   Sandbox shortcuts don't count; see P10.
3. `~/dreamtides` Rust engine behavior, where the relevant rules text is
   unchanged from `~/dreamtides/docs/battle_rules/battle_rules.md`. This step
   is read-only.
4. The Magic: The Gathering Comprehensive Rules analog, adapted to Dreamtides.
5. The simplest reading consistent with every affected card text.

Then do both of the following:

- Write the outcome into `docs/rules.md` as normative, current-state text.
- Write an RD file under `docs/plan/evidence/rules-decisions/` that cites:
  - the ladder step;
  - the section;
  - the affected UUIDs;
  - the rationale.

The format is in [workflow](workflow.md#rules-ambiguity-protocol).

### D11. Card data is immutable

Never change ability text, amplified text, cost, spark, subtype, or rarity of
any card, dreamsign, avatar, or Dreamwell card. Ambiguous or seemingly broken
text is handled as follows:

- Implement it through the ladder.
- Log it under `docs/plan/evidence/card-issues/`.

Balance observations go into the AI reports, never into the data. Converting
RON to TypeScript (D32) must preserve every value exactly. Apollyon content
(D6) is new data, not an edit.

### D12. Infinite combos are intentional

Do not cap, fizzle, or log combos as defects.

- **Optional loops.** The engine offers **Repeat ×N** and **Repeat until
  victory** when an action sequence returns to an equivalent state with a
  monotonic gain. The AI uses the same shortcut.
- **Mandatory unbreakable cycles** end the battle in a **draw**. This is the
  analog of MTG rule 104.4b.

Design: [engine-design § Loops](engine-design.md#loops).

### D13. Stack and priority

Use the Rust-engine model:

- Playing or activating gives the **opponent** priority.
- A player responds only to the opponent's items.
- **A single pass resolves the top item.**
- After resolution, the resolved item's controller receives priority if the
  stack is non-empty.
- Priority can't be held.

Worked example:

1. I play A. You respond with B. I respond with C.
2. You pass, so C resolves.
3. I get priority with B on top. I may play another Interrupt or pass.
4. If I pass, B resolves and you get priority over A.

### D14. Trigger timing and order

- Triggers queue during an effect and resolve right after that effect
  finishes, before priority passes.
- They resolve FIFO by triggering event. Newly fired triggers are appended.
- Simultaneous triggers resolve in a fixed order: the active player's first.
  Within a player, the order is avatar → dreamsigns → characters (back rank
  B0→B9, then front rank F0→F8).
- No ordering prompts.

### D15. Copies of cards on the stack

A copy is a created card placed above the original, so it resolves first. It
is **not "played"**:

- It fires no play triggers.
- It doesn't count toward play counts.
- It grants no new priority window.

Other properties:

- Prevent effects can target it.
- Its controller may choose new targets and modes.
- X and paid additional costs carry over.
- It ceases to exist on resolution or prevention.

### D36. Pending entities play text-less

Until Phase 5 authors an entity, it is `pending` and the engine treats it as
text-less:

- A pending character plays with its printed cost, spark, and subtype and has
  no abilities.
- A pending event resolves with no effect.
- A pending dreamsign, avatar, or Dreamwell card has no battle effect. A
  Dreamwell card still adds its `energy_added`.
- Each pending play or draw emits a `pendingAbility` engine event, logged with
  the UUID. Development builds show a small "pending" marker on the card.

This keeps journeys, the fuzzer, and the Phase 4 gate playable on full-pool
decks before Phase 5.

### D39. Deck-entry modifications and next-battle effects

Exploration encounters change the player's deck and the next battle. Both are
in scope, and the engine plays them exactly as the journey records them.

**Deck-entry modifications** are stored on each `DeckEntry`
(`src/types/journey.ts`) and resolved today by `resolveDeckEntryCard` in
`src/card-type-change.ts`:

- `sparkBonus`: permanent additive spark (IncreaseSparkAll,
  PurgeRandomSubtypeAndIncreaseSpark);
- `keywordModification.energyCostReduction` (ReduceCostAllAndGainNightmares);
- `keywordModification.fast` (MakeFastAll, MakePredicateFastAndGainNightmares);
- `keywordModification.reclaim` and `setReclaim`: a granted or overridden
  Reclaim cost (PurgeDuplicatesAndGrantReclaim);
- `typeChange`: a new subtype (ChangeSubtypeSelected, ChangeSubtypeAll) or a
  new card type (ChangeCardTypeSelected, which can turn an Event into a
  Character).

In the engine they are part of a card instance's `variant`, next to the
amplified flag and the transfigurations. They apply in layer 1 (copiable
values) **after** the transfiguration transforms, in the prototype's order:
transfiguration, then type and keyword changes, then the spark bonus. A card
whose type changes keeps its printed abilities. Where the prototype does not
settle a question, such as the spark of an Event turned into a Character,
decide through the [ladder](#d10-rules-ambiguity-ladder) and record an RD
entry. Displayed text keeps coming from the existing text transforms.

**Next-battle effects** (NextBattleOpeningHand, NextBattleStartingEnergy,
NextBattleSmallerHandAndCostDiscount) and every other journey-to-battle input
are typed `BattleInit` fields, consumed once by the battle they apply to.

- **Why:** These effects appear in roughly 500 exploration actions. Leaving
  them implicit would force the agent to invent their engine semantics in the
  middle of Phase 4 or 5.
- **Consequences:**
  - Phase 4.1 builds the typed `BattleInit` fields and the variant plumbing.
  - Phase 5.7b proves every modification kind with contract tests, the
    fuzzer, and a sweep sample.
  - Determinization (D22) treats the player's deck modifications as part of
    the known decklist.

## Workflow

### D16. Pre-flight and the agent's footprint

The planning session performed setup:

- the fork and history scrub;
- remote `origin`;
- Tollgate registration and the trusted policy;
- the `~/brain/hive.json` entry;
- the Phase 1 beads.

During the run the agent changes nothing outside these places:

- `~/dreamtides_web`, its Tollgate worktrees, and its local Tollgate policy;
- `~/tollgate` and its Tollgate worktrees, for [Track T](phase-t-tollgate.md)
  beads only ([D45](#d45-tollgate-track));
- for Track T bead T8 only: the `wt` and `wt-sequence` skills under
  `~/.llms/skills/`, and the skills and source under `~/hive`, each changed
  through that repository's own workflow;
- its own beads;
- gitignored local state.

Two runtime exceptions:

- The agent may restart the Hive Dolt server when it is down, exactly as
  [workflow](workflow.md#failure-and-recovery) describes.
- The agent restarts the Tollgate app as Tollgate's own self-install rule
  requires after a Track T promotion (D45).

### D17. Machine resources

The machine is shared with other agents. Keep sustained load at about 6 cores:

- **Vitest:** `JOURNEY_TEST_WORKERS=2`, locally and in Tollgate.
- **Implementation lanes:** at most two `dreamtides_web` implementation
  subagents and one Track T implementation subagent at a time
  ([D43](#d43-orchestrated-parallel-execution)).
- **Heavy commands.** Heavy means a local `npm run review:full`, a fuzz run
  of 200 or more games, `cargo test --workspace`, and a Tollgate release
  build. Beads that need one carry the label `heavy`. At most one `heavy`
  `dreamtides_web` bead runs at a time, and Tollgate's own validation is the
  other heavy slot. The Track T lane runs its cargo checks alongside, with
  `CARGO_BUILD_JOBS=4`.
- **Tollgate:** `max_buildsets = 2` for this repository, so one gate run and
  one release run can overlap.
- **Interactive browser QA** through the Playwright MCP tools runs in one
  subagent at a time (label `browser`), because subagents may share the
  orchestrator's MCP connection. Script-driven sweeps open their own MCP
  client and may run in parallel on separate ports.
- **Fuzz soaks and tournaments:**
  - batches of at most 30 minutes;
  - 4 worker processes while no `heavy` bead is running, otherwise 2;
  - they may overlap Tollgate validation and implementation lanes.
- **Memory pressure:** when `memory_pressure` reports warn or critical, finish
  the current work and drop to one implementation lane until it clears.

### D37. Mason pass every phase

Every phase ends with a `mason` audit immediately before its gate, scoped to
the code that phase created or touched. **Every** bead it files is implemented
in the same phase; nothing is deferred to a later phase or past the run.
Mason beads touch disjoint files, so they fill both implementation lanes.
Procedure: [workflow § Mason passes](workflow.md#mason-passes).

### D42. Continuous introspection

When workflow problems or bad architecture keep slowing the run, fix them
then, not at the end of the phase.

- **Evidence:** every bead records its friction, timings, and test delta in a
  ledger.
- **Triggers:** a friction cause recurring in 3 beads, or a budget exceeded by
  more than 50% on 3 consecutive beads, files an improvement bead that runs
  next.
- **Retrospectives:** after every 10th bead of a phase and at every gate.
- **Gate speed:** an improvement bead may change the local Tollgate policy in
  any phase.

Improvement beads preserve behavior and never change rules, card behavior,
player-visible UI, or these decisions. Procedure:
[workflow § Introspection](workflow.md#introspection).

**Why:** the plan is long and unattended. A cost paid on every bead compounds
across ~200 beads, and the mason pass at the end of a phase arrives too late
for a phase as long as Phase 5.

### D43. Orchestrated parallel execution

The run uses one **orchestrating** Claude Code session. Implementation is
delegated to Agent-tool subagents running in parallel lanes.

- **The orchestrator owns all shared state:**
  - every Beads call (claim, notes, close, filing);
  - every Tollgate queue action (`candidate`, `approve`, `cancel`, `retry`);
  - creating and removing worktrees;
  - reviews, retrospectives, ledgers, and the session title.
- **An implementation subagent implements exactly one bead.**
  - It works in a worktree the orchestrator created and handed to it.
  - It validates the bead and makes exactly one commit.
  - It commits the bead's friction file and returns the commit OID and a
    report.
  - It never calls `bd`, never submits or approves candidates, never creates,
    removes, or pushes branches or worktrees, and never edits outside its
    worktree.
- **Lanes:** at most two `dreamtides_web` implementation subagents plus one
  Track T subagent at a time (D17).
- **No overlapping areas.** Every bead's description has an `Areas:` line
  listing the directories and files it may change.
  - A bead **holds its areas from dispatch until it lands** or is cancelled,
    including while its candidate validates or is repaired. Two beads hold
    areas at the same time only if those areas are disjoint.
  - These are each a single area: `package.json` with `package-lock.json`,
    `eslint.config.js`, `vitest.config.ts`, the local Tollgate policy, and the
    plan pages with `metrics.md`.
  - Per-bead evidence files never conflict
    ([workflow § Evidence files](workflow.md#evidence-files)).
- **Claims.** The orchestrator claims each bead it dispatches. It may hold one
  claimed bead per lane that is still being implemented, plus any number
  whose candidates are awaiting landing. This overrides the Hive executor's
  one-unfinished-assignment convention for this run.
- **The orchestrator may implement a bead itself** when coherence matters more
  than parallelism, for example Phase 3.2–3.4. That bead occupies a lane.
- **Read-only and QA helpers** are also subagents: mason audits, sage
  retrospectives, browser QA and screenshots, judged card QA, and the
  fallback cold review. They count against the D17 heavy-command and port
  limits, not against the implementation lanes.
- **Never wait idle on the gate.** The orchestrator approves a candidate and
  dispatches the next ready bead at once. A lane is free once its subagent
  has returned. The orchestrator checks candidate outcomes at each dispatch
  boundary.

**Why:** measured on Phases 1–2, a bead took about 25 minutes, and a third of
that was the session waiting on the gate. With about 200 beads left, serial
execution would take over 80 hours.

### D44. Staged validation

Validation has two stages, as specified in
`~/tollgate/docs/technical-design.md` (§6.2–6.3 repository model and
workflow, §10.9 release advance and push, §12.7 release runs):

- **Gate stage.** It is fast, at most about 60 s. It blocks promotion to the
  Tollgate-owned `staging` ref. New worktrees branch from `staging`, and
  user-owned local `master` follows `staging`.
- **Release stage.** It runs `npm run review:full` and the fuzz smoke. It runs
  asynchronously on the newest `staging` tip. A pass advances `release` and
  remote `master` to that exact OID.

Consequences:

- **A bead is done when its commit is on `staging`.** It never waits for the
  release stage.
- **A red release run is fixed by a follow-up commit,** never by a revert. The
  orchestrator files a `ci-fix` bead at once, and it preempts all other ready
  work. The dreamtides policy sets `max_release_lag = 5`.
- **Phase gates, the Track T gate, and the end of the run** require `release`
  to equal `staging`.
- **This repository runs in staged mode** (task T9). Its gate stage runs
  `dependencies` and `npm run review:gate`; its release stage runs
  `npm run review:full` and `fuzz:engine -- --games 200`. The orchestrator
  never waits on either stage (D43).

**Why:** only 1 of 19 Phase 1–2 gates failed. Blocking every bead on the full
suite bought almost nothing.

### D45. Tollgate track

Track T improves Tollgate itself, in `~/tollgate`, alongside the phases. It
does three things:

- fixes the startup outage of 2026-10-05;
- delivers staged validation (D44);
- adopts it in this repository.

Rules:

- **Standing authority.** The operator grants standing promotion authority
  for Track T beads. This overrides, for these beads only, the explicit
  approval that Tollgate's AGENTS.md otherwise requires.
- **Tollgate's own workflow applies** inside `~/tollgate`: its `wt` flow, its
  gate, and its self-install rule. After each promotion, build from the
  promoted `release` OID in a detached worktree, install, restart, and run
  `tg --no-launch doctor`.
- **The orchestrator performs each self-install,** never a subagent. A Track
  T bead lands when its promotion is installed and `doctor` is healthy.
- **Restarts interrupt every repository's validations.** Install only when no
  `dreamtides_web` validation is running, and record each restart in the bead
  notes.
- **The authority covers T8's changes** to the `wt` skills in the home
  repository and to Hive's skills and source, through Hive's own flow. Those
  are project code, not shared Hive configuration.
- **The startup fixes (T1a, T1b) promote first.** No other Tollgate bead
  promotes before them.
- **Tollgate's staged-release design is binding** for Track T. It lives in
  `~/tollgate/docs/technical-design.md`: invariants R1–R5 (§5), release
  advance and push (§10.9), the schema and its defaults (§11.2), and release
  runs (§12.7). This repository's policy sets `max_release_lag = 5`.

**Why:** on 2026-10-05 a docs-only Tollgate self-install restart left Tollgate
unavailable to every repository for about 100 minutes. Startup pruned about
23,000 expired battlement artifacts one at a time, with a quadratic lookup,
before it opened its socket.

### D18. Review cadence

The independent review is a fresh `gpt-5.6-sol` reviewer, run via the Codex
CLI. The setup was verified on 2026-10-03: read-only sandbox enforced, the
model honored, about 20 s for a trivial review. It runs:

- at every phase gate and the Track T gate;
- for every bead marked **core-review** on the phase and track pages.

This explicitly authorizes more than the skill's default of one review per
session. There is no per-bead warden review.

**Core-review is asynchronous.** The review runs in the background against
the bead's exact commit, while the candidate validates and the next bead
starts. Confirmed findings become a follow-up bead, which runs next in that
bead's area. A gate review blocks its gate bead until its findings are
resolved.

When Codex hits a usage limit, record review debt and continue; see
[workflow](workflow.md#reviews).

### D19. Test pruning

**The test suite is a cost paid on every bead. Delete aggressively.**

Keep a test only if it pins a contract that later work still needs, and
nothing cheaper would catch its regression: typecheck, a smoke test,
screenshot QA, the fuzzer, or the sweep. Delete:

- **Tests of removed systems,** in the same commit as the system.
- **Tests of code a later phase replaces,** at the start of the replacing
  work. Do not keep them until the end. When a later task ports a contract
  from deleted tests, it reads them from git at the OID recorded in the
  deleting bead's notes.
- **Tests of private helpers, UI copy, presentation tokens, and
  near-duplicates.**
- **Exhaustive screen and view-model tests.** A screen keeps one render smoke
  test plus its interaction and geometry contracts. A view model keeps the
  derived-state contracts that adapters and screens rely on, not every field.

**Size rules:**

- **Test files over ~500 lines are split or cut.** The bead notes record why
  any survives.
- **Prefer fewer files.** Module import dominates suite time, and each file
  pays it again.

**Budgets.** Every phase gate measures these. The Phase 2 test-cut beads must
reach them:

- full suite at most 60 s, at 2 workers and low host load;
- at most 220 test files;
- at most 80 `jsdom` test files.

**New tests (Phases 3–7):**

- Engine and content tests run in the `node` environment, never `jsdom`.
- Scenario specs live in one file per content batch, never one file per card.
- Breadth comes from the fuzzer, the coverage gate, and the sweep, not from
  per-card tests.
- Every bead's friction file records its test delta.
- A phase retrospective that finds the suite over budget files a test-cut
  bead that runs next.

### D20. Card test strategy

Layered:

- **Primitives:** thorough tests once for each DSL primitive.
- **Scenario specs:** only for cards whose behavior exceeds the composition of
  their primitives (est. 25–35%).
- **Every card, variant, and transfiguration:** covered by the seeded
  invariant fuzzer, the coverage gate, the `verifiedText` gate, and the
  card-lab sweep.

### D21. Browser QA coverage

Per content batch:

1. A **scripted Playwright sweep** plays every card through the real UI, in
   the card-lab scene.
2. The agent **judges** by hand every card that introduces a new prompt type,
   status, or visual effect, plus a 10% random sample.

Every phase gate from Phase 4 on ends with full journey playthroughs on
desktop and mobile. Verdicts go to the QA ledger.

### D41. Final acceptance opponents

The Phase 7 final acceptance plays its **victory** journey, every battle real
through Apollyon, with `?ai=greedy`. The **defeat** journey and the ~10
standalone games use the champion. No debug actions resolve battles in
either acceptance journey.

**Why:** the agent must reach the end of the run even when the champion is
stronger than it is. The victory path proves the full journey and Apollyon
flow; the champion games prove the AI.

### D26. Dependency-ordered execution

Beads run in dependency order, not in one chain. Lanes run beads in parallel
whenever their prerequisites have landed and their areas are disjoint (D43).

**Phases overlap.** A later phase's task may start as soon as its
prerequisites have landed. Each phase page states its earliest start and its
task graph. Phase gates still close strictly in order: a phase's gate bead
depends on the previous phase's gate bead.

There are no wall-clock boxes anywhere in the run. The AI improvement loop has
its own plateau stop rule (D25).

### D28. Plan format

This index, a decisions page, two design and process pages, one page per
phase, and one page for Track T. Progress lives in bead notes.

### D29. Keep-alive and signals

The operator owns keeping the session alive. The plan defines idempotent
re-entry only. The run sends no notifications; the operator reads bead notes
and the session title.

### D30. UI preservation

Player-visible appearance and flows stay as they are. Prove it with
before/after screenshots of touched screens at one desktop and one mobile
size.

Battle UI changes are limited to what the engine requires:

- legal-action highlights;
- the prompt host;
- response windows;
- the loop shortcut;
- status indicators.

They are built from existing Cumulus components. Co-op-only UI is removed.

## AI

### D22. AI hidden information

The AI knows:

- the board;
- both voids;
- revealed cards;
- hand sizes;
- the player's journey **decklist**.

It does not know hand contents or deck order. Search samples determinizations.

### D23. AI thinking budget

The AI runs in a Web Worker. Budgets:

- **Turn planning:** ~1.5 s.
- **Responses, Dusk, and prompt answers:** ~0.5 s.
- **Forced decisions:** instant.

Search is anytime. Tournament budgets are counted in iterations. Live play
adds wall-clock caps, calibrated for a mid-range laptop.

### D24. AI difficulty

Full strength in every battle. The difficulty curve stays in opponent deck
generation. A per-layer AI preset in the data modules defaults to full
strength. There is no difficulty tuning.

### D25. AI phase stop rule

The AI phase is best effort. It has no wall-clock box and no numeric
strength bar.

- **Promotion.** A candidate becomes champion only if it beats the champion
  with a 95% CI lower bound above 50% over at least 400 paired games.
- **Stop.** The improvement loop ends after **three consecutive iterations
  produce no new champion.**
- **Every build task completes.** Tasks 7.1–7.6 each finish against their own
  acceptance criteria; none is skipped for time.
- **Frozen references.** `greedy@7.2` and `expert@7.3` are immutable snapshots
  recorded when those tasks close. Every champion is reported against both,
  with a Wilson 95% CI. They are reference points, not a bar.

### D27. Expert bot knowledge

The Expert values actions and states from AST-derived features, plus
hand-written phase strategy. Per-card overrides exist only for observed
misplays.

## Planner defaults

These choices have conventional answers. Rules-related changes go through the
ladder and are logged.

- **P1. Response windows.** A player receives a response window only while
  holding a legal response. Otherwise the engine auto-passes. The human
  always gets their Dusk window and their own Day and Night phases.
- **P2. Undo.** Confirmed by the operator. Players have no undo: they may
  cancel their own play or activation before its commit point, and nothing
  after. Undo exists only as a `?debug=1` engine action. The prototype's
  battle undo/redo controls are removed in Phase 4.
- **P3. Mulligans.** There are no mulligans.
- **P4. Avatars and dreamsigns are not characters.** They can't be targeted
  as characters and get no spark or Support. Each avatar has an exhausted
  status for its ☾ costs, cleared at Ending.
- **P5. Victory checks.** A state-based check runs after every step.
  - Reaching `scoreToWin` wins.
  - Both players reaching it simultaneously is a draw.
  - Passing the turn limit is a draw.
- **P6. Hand limit.** The discarding player chooses which cards to discard,
  through a prompt.
- **P7. Dev-only surfaces.** The debug panel, card-lab, and `?goto` scenes are
  compiled only into development builds.
- **P8. Journey dreamsign effects.** They use a typed journey-modifier
  registry keyed by dreamsign UUID, consumed by the journey rules. It is
  separate from the battle DSL.
- **P9. Engine tunables.** They live in the battle data module: loop limits,
  auto-answer rules, presentation dwell, and AI presets.
- **P10. Prototype precedent.** Prototype behavior counts as precedent only
  where it implements a rule, not where it is a sandbox simplification.
- **P11. Turn counting.** "Turn" in the turn limit counts rounds.

## Established facts

- **F1. Energy.** Max energy rises only from Dreamwell draws (`energy_added`)
  and effects, starting at 0, with draws from round 2. `STANDARD_ENERGY_RAMP`
  is dead code.
- **F2. Drawn battles.** In a journey, a drawn battle is handled exactly like a
  defeat (`applyDefeat`).
- **F3. "Banish until end of turn."** The card returns during Ending to its
  prior controller's leftmost open back-rank slot. If the rank is full, it
  stays banished. Returning to play is a materialize.
- **F4. Battle setup.**
  - score targets `[10, 25]` by completion level;
  - turn limit 50;
  - hand limit 10;
  - energy cap 10;
  - the player starts;
  - the player skips the opening draw.

  Today these live in `data/battle.ron`; after Phase 2, in the battle data
  module.
- **F5. Empowered rounds down.** Empowered sets the cost to
  `floor(cost / 2)`: 4→2, 3→1, 2→1, 1→0. That is the shipped behavior in
  `src/transfiguration/transfiguration-logic.ts`; `journeys.md`'s examples
  contradict each other and are wrong.
- **F6. Nine transfigurations.** Empowered, Amplified, Kindled, Inspired,
  Enduring, Hastened, Resonant, Attuned, and Perfected. Hastened applies to an
  event that is not Fast and makes it Fast. Perfected applies every other one
  the card is eligible for.

## Card text clarifications

The operator settled these in a card-text audit on 2026-10-04. Each one is
binding like a D-entry. Phase 3.1 writes the general rules among them (C5,
C7–C10, C13–C15, C17) into `docs/rules.md` with RD entries. The content batch that implements each affected
entity cites its C-entry in its notes. Typos stay in the data (D11); each is
logged under `docs/plan/evidence/card-issues/` with its suggested fix.

### C1. Contemplation

Card `09e17f29-8ee1-477f-8175-ff37eb1f254a` ("create 'Contemplation' in your
hand") names a card that does not exist. **Contemplation** is a **2● Standard
event: "Draw a card."**

- Phase 5 adds it as new catalog data with rarity `Special`, like Nightmare
  (`b0a2c3d4-e5f6-4789-8abc-0def12345678`). It gets a new UUID, belongs to no
  tide, and never appears in drafts, shops, rewards, or opponent decks. Adding
  it is not an edit to existing card data.
- It is only ever created, so it ceases to exist when it leaves play (rules §
  Created Cards).

### C2. Radiant figments are Ethereal

Dreamsign `4a91c56c-d828-482a-a46c-1299d69fa011` ("materialize a 2✦ radiant
figment") names a figment type that does not exist. Read it as **a 2✦ Ethereal
figment.** Log it as a card issue: suggested fix "ethereal figment".

### C3. "Ethereal copy" means ephemeral

Dreamsign `7ec00da2-2b2d-4613-9a2a-8611d38199ca` ("Add an ethereal copy of the
first event you played last turn to your hand") means **an ephemeral created
copy**: it is banished at end of turn if still in hand, and it ceases to exist
when it leaves play. Log it as a card issue: suggested fix "ephemeral copy".

### C4. "Your deck" on a dreamsign means the journey deck

Dreamsigns `00cc7e7f-4245-4447-b9dc-f647dc6241a2` ("Characters in your deck with
cost ≤2● have +1✦") and `47081bde-f35d-4b5c-ba17-53e5dbf5b419` ("Characters in
your deck with cost ≥4● have awakened") apply to **every card that came from the
player's journey deck** and matches, wherever it is during the battle. The cost
check uses the card's cost after its variant (transfigurations and D39 deck
mods). Created cards and figments never qualify. The same reading applies to any
other dreamsign whose battle text says "your deck" in a static condition.

### C5. Figment copies copy copiable values

"Figment copy" appears on card `ccff822e-e2ae-4d38-9720-6df289dbe4cd`, dreamsign
`2ebf0bbb-440c-4dba-8e48-228daadc0a1e`, and avatar
`bf72adff-7d74-4be8-9b93-1db7ba13a1db`. A figment copy:

- copies the source's **copiable values** after variant transforms: subtype,
  abilities, cost, and base spark;
- never copies gained spark, counters, or statuses;
- is a figment: it counts for figment synergies, and it ceases to exist when it
  leaves play;
- has its base spark set to 0 when the text says "0✦ figment copy";
- merges only with figment copies of the same card UUID;
- with "until end of turn", ceases to exist during that turn's Ending.

### C6. Copies may always re-target (D15 stands)

[D15](#d15-copies-of-cards-on-the-stack) holds: every copy's controller may
choose new targets and modes. Card `fb967cc1-4199-4a08-8070-724e07cebea5`'s
amplified clause "You may choose new targets for the copies" is therefore
redundant. Implement it as a no-op and log it as a card issue.

### C7. Paying to end an effect is a Fast special action

"…until the opponent pays N●" (card `9e9efbc0-d438-48a9-9551-85c93fb33f3e`)
gives the affected character's controller an **end-effect special action**: pay
N● to end that effect immediately.

- It is available wherever that player could play a Fast card (❖), and never as
  an Interrupt response.
- It does not use the stack and cannot be responded to.
- The engine offers it as a top-level action (`payToEnd`), so it goes through
  legality and the policy interface like any other action.

### C8. Extra turns are full turns outside the round count

Card `a911ef71-799c-4240-ad13-8fabd3caeafa` ("Take an extra turn after this
one"):

- An extra turn runs all eight phases, including the Dreamwell draw and the
  Draw.
- It is one of that player's turns for "next turn", "last turn", "this turn",
  "once per turn", and "until your next turn".
- It does **not** advance the round counter, so it does not count toward the
  turn limit (P11).
- Several pending extra turns are taken last-in, first-out (MTG 500.7).

### C9. "Supporting it" counts any character behind it

Card `5ab11bef-5dcd-49f5-be49-ae2ccde76e70` ("+2✦ for each character supporting
it") counts every character in a back-rank position that supports this
character's front-rank position, with or without the Support keyword. That is
0–2 characters, and zero while this character is in the back rank.

### C10. "When you challenge with N" fires at challenger designation

Card `f07dfe42-566c-4e91-a250-9e2781e9d06f` ("When you challenge with two or
more warriors") and dreamsign `5a22f358-bc84-44b1-a201-5f9f57940c51` ("When you
challenge with 2 or more characters") fire **once, at the end of Day, when
challengers are designated.** They count the designated challengers that match.
Later Night changes never re-fire them.

### C11. "The card pool" is the run's draft pool

Dreamsign `1a524712-ef7e-43d9-bd79-5dea5250bf08` ("Add a random ≤2● cost event
from the card pool to your hand"):

- The pool is the run's tides4 draft pool, passed to the battle in `BattleInit`.
  For an opponent's dreamsign, it is that opponent's pool as produced by the
  opponent generator.
- The pick is uniform, on RNG stream `random:dreamsign`.
- The added card is a **created** card.

### C12. The type-remap dreamsign rewrites selectors and figments

Dreamsign `3d86f8ce-42ac-43dc-96d5-121e6d1a6167` ("pick a character type. All
cards in your deck that mention character types in their text now refer to that
character type"):

- It is a journey-level remap stored with the run (P8), applied to every card in
  the journey deck, **including cards added later**.
- Every character-type reference in a selector or condition becomes the chosen
  type: "warriors you control", "draw a warrior", "a survivor in your void".
- Figments the card creates also change type **when the chosen type is a figment
  type**. They keep the printed spark ("1✦ warrior figment" becomes "1✦ survivor
  figment"). Otherwise the figment type is unchanged.
- The card's own subtype is unchanged.
- Displayed text uses a word-substitution text transform. The type is chosen
  with the existing pick UI.

### C13. Figments cost 0●

A figment's cost is 0● for cost selectors ("≤2● cost character") and for "its
cost" or "that character's cost". A figment copy (C5) has the copied cost.

### C14. Victory points never go below 0

An effect that makes a player lose ⍟ stops at 0. Example: card
`7697da0e-d759-4c75-8c9c-477e9058b035`, "the opponent loses an equivalent
quantity of ⍟".

### C15. "You win the game" is a state-based win

Card `6e2188f8-580e-4a66-a3e3-267d509de903` ("If you have no cards in your deck,
you win the game") is checked by the state-based victory check (P5) after every
step while the card is in play. Its controller wins the battle. If the opponent
reaches the score target in the same check, the battle is a draw.

### C16. Avatar and Dreamwell readings

- Avatar `1cc5a88a-134f-42f7-a0ae-95ace44b3745` ("If you have 5●"): 5 or more
  current ●.
- Dreamwell `a3033051-8eb7-4fbf-93d6-f947ed68974d` ("Return a random character
  from each player's void to play"): each character returns under its owner's
  control.
- Dreamwell `558a1f1b-7dc1-4d83-9f00-c6af2187a954` ("Draw an additional
  Dreamwell card"): the additional card grants its `energy_added` and resolves
  its ability.

### C17. Targeting and additional spark

- **"Cannot be targeted by effects"** (cards
  `516dbd2d-dae4-4873-937e-adfeeee4444d`,
  `2708c635-9332-4cfb-b43d-889ba2e329b6`,
  `bd43b120-2503-406c-8b72-ea3dc55198a0`) covers every effect, including its
  controller's own.
- **"When a character you control gains ✦, it gains 1 additional ✦"** (card
  `26a05558-4692-43d2-ae6c-a6eb385a6d22`, dreamsign
  `1a21186c-cafd-4e0f-9304-1ac0ef55340a`) applies to each "gains +N✦" event,
  permanent or with a duration; the additional ✦ has the same duration. It never
  applies to spark a character *has* (statics, Support, anthems). The additional
  gain does not retrigger it. Several sources stack, each adding 1.

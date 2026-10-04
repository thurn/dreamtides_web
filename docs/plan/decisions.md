# Decisions

These decisions were made with the operator in the planning interview on
2026-10-03, revised the same day, and refined in a readiness review on
2026-10-04. They are binding for the run. In the
[rules ambiguity ladder](#d10-rules-ambiguity-ladder) they outrank every other
precedent.

Each entry gives the decision, the reason, and its consequences. Further
sections:

- [Planner defaults](#planner-defaults) are choices the planner made with
  conventional answers. The agent may refine them through the ladder and must
  record any change.
- [Established facts](#established-facts) are behaviors the code already
  settles.

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

1. An explicit decision in this file (D-entries, then P-entries).
2. Existing prototype behavior, where the prototype implements an actual rule.
   Sandbox shortcuts don't count; see P10.
3. `~/dreamtides` Rust engine behavior, where the relevant rules text is
   unchanged from `~/dreamtides/docs/battle_rules/battle_rules.md`. This step
   is read-only.
4. The Magic: The Gathering Comprehensive Rules analog, adapted to Dreamtides.
5. The simplest reading consistent with every affected card text.

Then do both of the following:

- Write the outcome into `docs/rules.md` as normative, current-state text.
- Add an entry to `docs/plan/evidence/rules-decisions.md` that cites:
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
- Log it in `docs/plan/evidence/card-issues.md`.

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

## Workflow

### D16. Pre-flight

The planning session performed setup:

- the fork and history scrub;
- remote `origin`;
- Tollgate registration and the trusted policy;
- the `~/brain/hive.json` entry;
- the Phase 1 beads.

During the run the agent changes nothing outside these places:

- `~/dreamtides_web`;
- its Tollgate worktrees;
- its own beads;
- gitignored local state.

### D17. Machine resources

The machine is shared with other agents. Stay at about 6 cores:

- **Vitest:** `JOURNEY_TEST_WORKERS=2`, locally and in Tollgate.
- **Tollgate:** one repository buildset.
- **Fuzz soaks and tournaments:**
  - at most 4 worker processes;
  - batches of at most 30 minutes;
  - never concurrent with a running Tollgate validation of this repository.

### D37. Mason pass every phase

Every phase ends with a `mason` audit immediately before its gate, scoped to
the code that phase created or touched. **Every** bead it files is implemented
in the same phase; nothing is deferred to a later phase or past the run.
Procedure: [workflow § Mason passes](workflow.md#mason-passes).

### D18. Review cadence

The independent review is a fresh `gpt-5.6-sol` reviewer, run via the Codex
CLI. The setup was verified on 2026-10-03: read-only sandbox enforced, the
model honored, about 20 s for a trivial review. It runs:

- at every phase gate;
- for every engine-core bead marked in the phase pages.

This explicitly authorizes more than the skill's default of one review per
session. There is no per-bead warden review. When Codex hits a usage limit,
record review debt and continue; see [workflow](workflow.md#reviews).

### D19. Test pruning

Apply the behavior-contract rule: keep a test only if it pins an observable
player-facing, rules, or data contract that would plausibly regress. Delete
tests of:

- removed systems;
- private helpers;
- UI copy;
- near-duplicates.

There is no numeric quota. Budgets are monitored and reported, never gated.

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

### D26. Strict sequencing

Phases run strictly in order, with no wall-clock boxes. The AI improvement
loop has its own stop rule (D25).

### D28. Plan format

This index, a decisions page, two design and process pages, and one page per
phase. Progress lives in bead notes.

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

A candidate becomes champion only if it beats the champion with a 95% CI
lower bound above 50% over at least 400 paired games.

**Frozen baselines.** "Greedy" and "Expert" in the bar mean the immutable
reference snapshots `greedy@7.2` and `expert@7.3`, recorded when those tasks
close. Later changes to the Expert rules or evaluation never move the bar.
The bar applies even when the champion is itself an Expert variant.

The phase ends when either condition holds:

- The champion clears the bar **and** three consecutive iterations produce no
  new champion. The bar is ≥75% against Expert and ≥90% against Greedy.
- 3 days of AI-phase wall-clock have elapsed.

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

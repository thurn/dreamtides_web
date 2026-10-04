# Decisions

These decisions were made with the operator in the planning interview on
2026-10-03. They are binding for the run. In the
[rules ambiguity ladder](#d10-rules-ambiguity-ladder) they outrank every other
precedent. Each entry gives the decision, the reason, and its consequences.

Further sections:

- [Planner defaults](#planner-defaults) are choices the planner made with
  conventional answers. The agent may refine them through the ladder and must
  record any change.
- [Established facts](#established-facts) are behaviors the code already
  settles.

## Project shape

### D1. Hard fork, no sync

`~/dreamtides_web` is a clone of `quest_prototype` master with full history.
Nothing flows between the two repositories during the run.

- **Why:** The agent must be free to restructure schemas, data, and code
  without merge pressure. The operator keeps `quest_prototype` for their own
  tinkering.
- **Consequences:**
  - `data/*.ron` in this repository is canonical for dreamtides_web.
  - Never read from or write to `~/quest_prototype`.

### D2. Public repository and no deploys

Tollgate pushes certified `release` to the public
`git@github.com:thurn/dreamtides_web.git` master.

Nothing is deployed during the run. That covers Firebase Hosting, Storage
uploads, and `npm run deploy`. Phase 1 deletes the Firebase Hosting GitHub
workflows. `checks.yml` remains as an independent post-push signal.

Before the first push, the planning session scrubbed history with
`git filter-repo`. It replaced the hard-coded Discord webhook URL and every
`.env.production` value with placeholders. The project ID became
`redacted-firebase-project`.

- **Why:** The repository is public.
- **Consequences:**
  - Never commit secrets, `.env*` values, credentials, or images.
  - `scripts/send-screenshots-to-discord.mjs` requires `--webhook` or
    `DISCORD_WEBHOOK_URL`.
  - Production Firebase values must be restored by the operator before any
    future deploy.

### D3. Local-first solo play

Keep the event-sourced architecture: player intents are folded by the pure
reducer in `src/rules/`, and time and randomness enter through the event
context. Replace the Firebase RTDB room transport with a local persisted log
in IndexedDB. Delete all of the following:

- co-op;
- presence;
- Take Control and hosted-playtest controller semantics;
- room-generation recovery;
- the Firebase emulator;
- the JDK dependency.

Firebase remains only as a possible future static host.

- **Why:**
  - Production battles are against the AI.
  - The RTDB rules are world-writable.
  - The emulator slows development and tests.
  - The AI is disabled in shared rooms today.
  - Determinism, replay, and fold-based testing are kept.
- **Consequences:**
  - The engine runs inside the fold.
  - The AI is an intent producer on the single client.
  - Phase 2 owns the transport swap.

### D4. Debug tooling

Players take only legal engine actions and answer only engine prompts.

QA tools are re-implemented as **engine debug actions** that keep invariants,
behind `?debug=1` in development builds:

- add a card by UUID to a zone;
- set energy or score;
- force the next draw;
- reveal hidden zones;
- undo to an earlier intent.

The free-form sandbox is deleted in Phase 4: the debug rail, zone dragging,
status and counter edits, and the `BattleDebugEdit` path.

- **Why:** Free-form edits break engine invariants: pending triggers,
  durations, once-per-turn state.

### D5. Ability representation

Abilities are **typed, declarative TypeScript data keyed by UUID**:

- triggers;
- costs;
- effects;
- targets;
- conditions;
- durations.

One interpreter executes them. RON remains the source for identity, cost,
kind, rarity, printed `ability_text`, and `amplified_text`.

Each definition records the hash of the text it was authored against. A CI
gate fails when the text changes, which extends the prototype's
`rules-text-hash` pattern. An English renderer audits each AST against its
printed text.

- **Why:**
  - It is the fastest form for the agent to iterate on.
  - It is fully type-checked.
  - Transfigurations become structural transforms of the AST.
- **Rejected:**
  - RON-authored effect ASTs: every primitive would touch the Rust compiler,
    the TOML lowering, and the TS types.
  - A text parser: brittle with free-form English.

### D6. Apollyon is designed by the agent, flagged provisional

For each of the 10 incarnations in `data/apollyon_incarnations.ron`, author:

- an avatar-strength **Aspect ability** in the DSL;
- a **curated boss deck** around its `deck_archetype`, using the opponent
  generator with archetype bias;
- **1–2 dreamsigns**.

All three live in RON and the DSL. Rewrite `docs/journeys/bosses.md` to
describe the implemented incarnations, marked provisional. Sanity-check them
with AI-vs-AI results.

- **Why:** The final boss's mechanics are undefined today.

### D7. Meta-progression is out of scope

No achievement or unlock system. `docs/journeys/meta_progression.md` stays as
a design sketch; it is the first follow-up project.

### D8. Tool deletions

Delete all of these:

- the in-app editors (`src/editor`, `/editor`, `/dreamsigns`, `/images`, the
  image viewer, the tag editors);
- Tabula (`tabula/`);
- the Unity Cumulus project (`cumulus/` at the repository root);
- the draft and pool analysis scripts, metrics, `first-pick-cache`, and the
  alternate draft algorithms (`?algo=` other than tides4).

Keep these:

- Trox localization;
- the Rust RON game-data compiler;
- the Cumulus design system with its docs and lint suite;
- whatever tides4 needs to build and run.

Delete skills whose subject is deleted: `tabula`, `unity-cumulus`,
`cumulus-compare`, `build-ron-editor`, and any others found in Phase 2. Never
edit `dda/` (that requires an explicit `$dda` invocation).

### D9. Tutorial is ported to the engine

All tutorial content and behavior stay:

- the standalone `/tutorial` scripted battle;
- the Mira guidance;
- the tutorial journey's first-visit and first-occurrence guidance.

The scripted battle becomes engine actions plus authored AI overrides that
resolve through normal engine play. With the editors deleted, edit
`tutorial.ron` by hand.

## Rules

### D10. Rules ambiguity ladder

When [battle_rules.md](../battle_rules/battle_rules.md) is silent or ambiguous,
decide in this order:

1. An explicit decision in this file (D-entries, then P-entries).
2. Existing prototype behavior, where the prototype implements an actual rule.
   Sandbox shortcuts don't count; see P10.
3. `~/dreamtides` Rust engine behavior, where the relevant battle_rules.md text
   is unchanged from `~/dreamtides/docs/battle_rules/battle_rules.md`. This
   step is read-only.
4. The Magic: The Gathering Comprehensive Rules analog, adapted to Dreamtides.
5. The simplest reading consistent with every affected card text.

Then do both of the following:

- Write the outcome into battle_rules.md as normative, current-state text, so
  battle_rules.md remains the complete design.
- Add an entry to `docs/rules_decisions.md` that cites:
  - the ladder step;
  - the battle_rules.md section;
  - the affected card UUIDs;
  - the rationale.

The format is in
[workflow](workflow.md#rules-ambiguity-protocol).

### D11. Card data is immutable

Never change ability text, amplified text, cost, spark, subtype, or rarity of
any card, dreamsign, avatar, or Dreamwell card. Ambiguous, contradictory, or
seemingly broken text is handled as follows:

- Implement it through the ladder.
- Log it in `docs/card_issues.md` with the UUID, the problem, the chosen
  interpretation, and a suggested fix.

Balance observations from tournaments go into the AI reports, never into the
data. Apollyon content (D6) is new data, not an edit.

### D12. Infinite combos are intentional

Do not cap, fizzle, or log combos as defects. The engine supports them:

- **Optional loops.** The engine detects when a player's action sequence
  returned to an equivalent state with a monotonic gain. It then offers
  **Repeat ×N** and **Repeat until victory**, executed as one intent. The AI
  uses the same shortcut.
- **Mandatory unbreakable cycles.** A cycle with no player choice ends the
  battle in a **draw**. This is the analog of MTG rule 104.4b, and it is
  logged.

The detailed design is in [engine-design](engine-design.md#loops).

### D13. Stack and priority

Use the Rust-engine model, carried over verbatim into battle_rules.md:

- Playing a card or activating an ability gives the **opponent** priority.
- A player may respond only to the opponent's items.
- **A single pass resolves the top item.**
- After an item resolves, its controller receives priority if the stack is not
  empty.
- Priority cannot be held.

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
  Within a player, the order is avatar → dreamsigns → characters by position
  (back rank B0→B9, then front rank F0→F8).
- No ordering prompts.

### D15. Copies of cards on the stack

A copy is a created card placed on the stack above the original, so it
resolves first. It is **not "played"**:

- It fires no play triggers.
- It doesn't count toward "cards you played this turn".
- It grants no new priority window.

Other properties:

- Prevent effects can target it.
- Its controller may choose new targets and modes.
- X and paid additional costs carry over.
- On resolution or prevention it ceases to exist.

## Workflow

### D16. Pre-flight

The planning session performed setup:

- the fork and history scrub;
- remote `origin`;
- Tollgate registration;
- the `~/brain/hive.json` project entry `dreamtides_web`.

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

### D18. Review cadence

The independent review is a fresh `gpt-5.6-sol` reviewer via the Codex CLI.
It runs:

- at every phase gate;
- for every engine-core bead, as marked in the phase pages.

This explicitly authorizes more than the skill's default of one review per
session. No per-bead warden review: this overrides the Hive executor's
100-line default.

When Codex hits a usage limit, record review debt and continue. The procedure
is in [workflow](workflow.md#reviews).

### D19. Test pruning

Apply the behavior-contract rule: keep a test only if it pins an observable
player-facing, rules, or data contract that would plausibly regress. Delete
tests of:

- removed systems;
- private helpers and implementation details;
- UI copy;
- near-duplicate cases.

Apply the same rule to the custom ESLint rules. Sample-check survivors with
the `adversarial-test-validation` skill on the engine core.

There is no numeric quota. Budgets are monitored and reported, never gated,
because AGENTS.md forbids timing-gated CI.

### D20. Card test strategy

Layered:

- **Primitives:** thorough engine tests once for each DSL primitive.
- **Scenario specs:** a declarative spec only for cards whose behavior exceeds
  the composition of their primitives (est. 25–35%).
- **Every card, variant, and transfiguration:** covered by:
  - the seeded invariant fuzzer;
  - the UUID coverage gate;
  - the text-hash drift gate.
- **English-render audit:** a bead-level validation report, not a CI test.

### D21. Browser QA coverage

Per content batch:

1. A **scripted Playwright sweep** plays every card in the batch through the
   real UI, in the card-lab scene.
2. The agent **judges** by hand:
   - every card that introduces a new prompt type, status, or visual effect;
   - a 10% random sample of the rest.

Every phase gate from Phase 4 on ends with full journey playthroughs against
the current AI, on desktop and mobile. Verdicts go to the QA ledger. The
checklist is in [workflow](workflow.md#browser-qa).

### D26. Strict sequencing

Phases run strictly in order, with no wall-clock boxes. Each phase completes
before the next begins. The AI improvement loop has its own stop rule (D25).

### D28. Plan format

This index, a decisions page, two design and process pages, and one page per
phase. Progress lives in bead notes, not in these documents.

### D29. Keep-alive

The operator owns keeping the session alive. The plan prescribes no hooks,
`/loop`, or `caffeinate`. It only defines idempotent re-entry.

### D30. UI preservation

Player-visible appearance and flows stay as they are. Internal UI code may be
refactored or deleted only when rendered output is unchanged. Prove it with
before/after screenshots of touched screens at one desktop and one mobile
size.

Battle UI changes are limited to what the engine requires:

- legal-action highlights;
- prompts;
- response windows;
- the loop shortcut;
- status indicators.

They are built from existing Cumulus components. Co-op-only UI is removed.

## AI

### D22. AI hidden information

The AI knows what a human opponent could know:

- the board;
- both voids;
- revealed cards;
- hand sizes;
- the player's journey **decklist**.

It does not know hand contents or deck order. Search samples determinizations
consistent with those observations.

### D23. AI thinking budget

The AI runs in a Web Worker. Budgets:

- **Turn-planning decisions:** up to ~1.5 s.
- **Priority responses, Dusk blocking, and prompt answers:** up to ~0.5 s.
- **Forced and single-option decisions:** instant.

Search is anytime: it returns its best plan so far. For reproducibility,
tournament budgets are counted in iterations. Live play adds a wall-clock cap,
and the iteration budget is calibrated so a typical laptop reaches it within
the cap.

### D24. AI difficulty

Every battle uses the best AI. The difficulty curve stays in opponent deck
generation (`data/opponents.ron`). Add a per-layer AI preset in RON (search
budget and bot tier) that defaults to full strength. Do no difficulty tuning.

### D25. AI phase stop rule

A candidate becomes champion only if it beats the current champion with a
95% CI lower bound above 50% over at least 400 paired games.

The AI phase ends when either condition holds:

- The champion clears the bar **and** three consecutive improvement iterations
  fail to produce a new champion. The bar is ≥75% against Expert and ≥90%
  against Greedy, each by CI lower bound.
- The AI phase has used 3 days of wall-clock.

Final acceptance follows (Phase 7).

### D27. Expert bot knowledge

The hand-written Expert values actions and states from features computed off
the ability AST, plus hand-written phase strategy. Per-card hint overrides
exist only for cards that tournaments or QA show it misplays.

## Planner defaults

These choices have conventional answers. Rules-related changes go through the
ladder and are logged in `docs/rules_decisions.md`.

- **P1. Response windows.** A player receives a response window only while
  holding a legal response: a castable Interrupt, or a Fast item in a Fast
  window. Otherwise the engine auto-passes for them. The human always gets
  their Dusk window and their own Day and Night phases.
- **P2. Undo.** Undo exists only as a debug action.
- **P3. Mulligans.** There are no mulligans.
- **P4. Avatars and dreamsigns are not characters.**
  - They are not "in play" as board characters.
  - Character effects can't target them.
  - Spark and Support don't apply to them.
  - Each avatar has an exhausted status for its ☾ costs, cleared at Ending
    with everything else.
- **P5. Victory checks.** A state-based check runs after every action and every
  resolved effect.
  - Reaching `scoreToWin` wins immediately.
  - Both players reaching it simultaneously is a draw.
  - Passing the turn limit is a draw.
- **P6. Hand limit.** The player discarding to the hand limit chooses which
  cards to discard. It is a prompt for the human and a policy decision for the
  AI.
- **P7. Dev-only surfaces.** The debug panel, card-lab, and `?goto` scenes are
  compiled only into development builds.
- **P8. Journey dreamsign effects.** They use a typed journey-modifier registry
  keyed by dreamsign UUID. The existing journey rules consume it: essence,
  shops, drafts, purge, duplication, transfiguration, site enhancement,
  rerolls, and pre- and post-battle hooks. It is separate from the battle DSL.
- **P9. Engine tunables.** They live in RON next to `data/battle.ron`: for
  example loop-detection limits, response-window behavior, presentation
  dwell, and AI presets.
- **P10. Prototype precedent.** Prototype behavior counts as precedent only
  where it implements a rule. Sandbox simplifications don't count: automatic
  choice of discards, hand-resolved text, and debug-edit shortcuts.
- **P11. Turn counting.** "Turn" in the turn limit counts rounds, matching
  `data/battle.ron` `turn_limit`.

## Established facts

Code inspection settled these behaviors. Preserve them unless battle_rules.md
says otherwise.

- **F1. Energy.** Max energy rises only from Dreamwell draws (`energy_added`)
  and effects, starting at 0, with draws from round 2. `STANDARD_ENERGY_RAMP`
  is dead code; delete it.
- **F2. Drawn battles.** In a journey, a drawn battle is handled exactly like a
  defeat (`applyDefeat` in `src/rules/battle/battle-events.ts`).
- **F3. "Banish until end of turn."** The card returns during Ending to its
  prior controller's leftmost open back-rank slot. If the back rank is full,
  it remains banished. Returning to play is a materialize (battle_rules.md
  § Materialize), so its triggers fire.
- **F4. Battle setup.** It comes from `data/battle.ron`:
  - score targets `[10, 25]` by completion level;
  - turn limit 50;
  - hand limit 10;
  - energy cap 10;
  - the player starts;
  - the player skips the opening draw.

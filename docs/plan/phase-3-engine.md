# Phase 3: Rules Engine Core

**Goal:** a headless, deterministic engine in `src/engine/` that enforces all
of `docs/rules.md`. It must be complete enough that Phase 5 is "only" content.

This phase authors no catalog abilities. Entities stay `pending` or
`vanilla`. Primitives are exercised by **synthetic definitions** in
`src/engine/testing/synthetic-cards.ts`, which are test fixtures, not catalog
content.

**Read first:**

- [engine-design](engine-design.md), in full, especially
  [§ Decisions and prompts](engine-design.md#decisions-and-prompts);
- `docs/rules.md`;
- [decisions D10–D15, D31, and P1–P6](decisions.md);
- the prototype's challenge, Support, energy, and figment logic, for parity:
  `src/battle/engine/challenge.ts`, `support.ts`,
  `src/battle/state/figments.ts`, and `src/rules/battle/basic-automation.ts`;
- the Rust reference, read-only:
  `~/dreamtides/rules_engine/src/battle_mutations/src/play_cards/resolve_card.rs`
  and `phase_mutations/fire_triggers.rs`.

Beads marked **core-review** get an independent review
([D18](decisions.md#d18-review-cadence)), which runs asynchronously.

## Earliest start and task graph

Phase 3 overlaps Phase 2 ([D26](decisions.md#d26-dependency-ordered-execution)).
`src/engine/` is new code, and the Phase 2 work it needs has landed: TS
content modules (2.3) and `docs/rules.md` (2.1).

Each task depends on the tasks listed after its arrow:

- 3.1: none. It starts at once.
- 3.2 ← 3.1, Phase 2.11a (porting OID). It adds an npm script and a lint
  rule, so area holding orders it against 2.7a and 2.7b. Those culls keep
  anything Phase 3 has added.
- 3.3 ← 3.2; 3.4 ← 3.3
- 3.5 ← 3.4; 3.6 ← 3.5
- 3.7 ← 3.4; 3.8 ← 3.7
- 3.9 ← 3.6, 3.8
- 3.10 ← 3.8, 3.6
- 3.11 ← 3.9, 3.10
- 3.12 ← 3.11 and the Phase 2 gate (2.10)

**One session implements 3.2–3.4 itself,** in sequence. They fix the
architecture every later bead builds on. After 3.4 the tasks run in order:
3.5 stack → 3.6 triggers → 3.7 continuous effects → 3.8 zones →
3.9 loops → 3.10 views. 3.2–3.4 make the engine **registry-based** (below),
so each task adds files rather than editing shared switches. A task that
must edit a shared core file (`state/`, `steps/runner`,
`effects/interpreter`) lists it in its areas.

| Section | Bead |
| --- | --- |
| Epic | `hv-7x4l` |
| 3.1 | `hv-7x4l.1` |
| 3.2 | `hv-7x4l.2` |
| 3.3 | `hv-7x4l.3` |
| 3.4 | `hv-7x4l.4` |
| 3.5 | `hv-7x4l.5` |
| 3.6 | `hv-7x4l.6` |
| 3.7 | `hv-7x4l.7` |
| 3.8 | `hv-7x4l.8` |
| 3.9 | `hv-7x4l.9` |
| 3.10 | `hv-7x4l.10` |
| 3.11 | `hv-7x4l.11` |
| 3.12 | `hv-7x4l.12` |

## Engine test rules

These apply to every Phase 3 bead ([D19](decisions.md#d19-test-pruning)):

- **Environment.** Engine tests run in `node`, never `jsdom`.
- **Fixtures.** Synthetic definitions live in
  `src/engine/testing/synthetic-cards.ts`.
- **File grain.** Use one test file per engine module or rules area, never
  one per scenario. Property tests use a small fixed number of seeds; the
  fuzzer provides breadth.
- **Ported contracts.** Port prototype contracts from git at the OID recorded
  in Phase 2.11a's notes (`git show <oid>:<path>`). Never resurrect the old
  test files.
- **Fuzz smoke.** In interim mode, run `fuzz:engine -- --games 200` locally
  before committing an engine bead (heavy; D17). In staged mode, the release
  stage runs it, and a bead runs it only when it changes the fuzzer or the
  step runner.

## Tasks

### 3.1 Write the interview's rules into `docs/rules.md`

This is a docs-only bead.

1. **Write normative text** for each of these:
   - D13 priority;
   - D14 the trigger queue and order;
   - D15 copies;
   - D12 loops, in a new "§ Infinite Loops";
   - P1 auto-pass;
   - P4 avatars and dreamsigns;
   - P5 victory and draw checks;
   - P6 the hand-limit choice;
   - F3 the temporary-banish return;
   - "mandatory prompts with no legal answer" (engine-design rule 4);
   - the general card-text clarifications
     ([C5, C7–C10, C13–C15, C17](decisions.md#card-text-clarifications)):
     figment copies, paying to end an effect, extra turns, "supporting",
     "when you challenge with N", figment cost, the ⍟ floor, "you win the
     game", untargetability, and additional spark.
2. **Create `docs/plan/evidence/rules-decisions/`** with one file per
   decision, `RD-<bead-id>-<n>.md`.
3. **Fix contradictions** you find, through the ladder.

**Acceptance:** each listed decision appears in `docs/rules.md` as current
state, with an RD file (`docs/plan/evidence/rules-decisions/RD-<bead-id>-<n>.md`;
see [workflow](workflow.md#rules-ambiguity-protocol)).

### 3.2 Engine skeleton and step runner (core-review)

Build:

- **The state model:** instance IDs, RNG named streams, serialization, and a
  stable state hash.
- **Steps:** the step kinds, `runStep`, `InlineSource`, `ScriptedSource`, and
  the automatic-step driver loop.
- **The API:** `createBattle(init)`, `decision`, `legalActions`, `apply`
  (inline), and `view`.

Rules:

- the phase machine as `advancePhase` steps, including extra turns
  ([C8](decisions.md#c8-extra-turns-are-full-turns-outside-the-round-count));
- Dreamwell energy (F1);
- draw and Fatigue;
- challenger and blocker designation;
- `challengeLane` steps with Vengeful and Awakened;
- victory and draw checks (P5);
- the turn limit.

Content: vanilla characters and text-less events.

Tooling: `npm run fuzz:engine` (seeded, Random policy, invariants) as a Node
script via `tsx`. Add a lint rule banning `Date`, `Math.random`, and
module-level mutable state in `src/engine/`.

**Registries.** Step kinds and engine event kinds are each registered from
their own module (`steps/kinds/<kind>.ts`, `events/<kind>.ts`) through a typed
registry. The runner and the event bus dispatch through it, so later beads
add a file instead of editing a central switch. Exhaustiveness is checked at
the type level.

**Acceptance:**

- Port the prototype's challenge tests as contract tests against engine
  actions.
- Phase-machine tests.
- `fuzz:engine --games 1000` runs clean.
- Replaying a fuzz game reproduces its final hash.

### 3.3 Prompt protocol and interactive suspension (core-review)

This is the [D31](decisions.md#d31-prompt-architecture-replay-suspended-steps)
core. Build:

- **Prompt data:** `Prompt` and `Answer` types for every kind, validation,
  fingerprints, and auto-answer rules from the battle data module.
- **Suspension:** `InteractiveSource` with `Suspend` and `ReplayDivergence`.
- **The fold slice:** `committed`, `inFlight`, and `publishedEvents`, with the
  `battleAction`, `answer`, and `cancel` intents and the advance loop. Use a
  fold adapter fixture now; Phase 4 wires the real fold.
- **Supporting behavior:**
  - `commitPoint()` and cancellation;
  - legality by dry run;
  - event dedupe across re-runs;
  - a non-persisted re-run memo;
  - `engine_error` handling, so a throwing step aborts with `committed`
    untouched.
- **The hand-limit discard** (P6) as the first real prompt.

**Acceptance:** all the prompt property tests in
[engine-design § Testing layers](engine-design.md#testing-layers) pass on
synthetic effects:

- inline vs. interactive equivalence, with suspension at every prompt;
- divergence detection;
- reload mid-prompt;
- cancel before and after the commit point;
- empty candidate sets;
- prompts alternating sides within one step;
- auto-answers.

The fuzzer runs every 10th game in interactive replay mode. The re-run cost is
measured and recorded in `metrics.md`.

### 3.4 Ability DSL, interpreter, content fields, and gates (core-review)

Build:

- **The DSL:** ability types, builders, and the interpreter. All choices go
  through `ctx.choose`, including play-time ones. Start the primitive catalog
  with resources, cards, characters, flow, selectors, values, and durations;
  stack primitives come in 3.5.
- **Content fields:** `abilities`, `vanilla`, `pending`, and `verifiedText`
  on the content-module types.
- **Pending semantics** per
  [D36](decisions.md#d36-pending-entities-play-text-less): pending entities
  play text-less and emit `pendingAbility`.
- **Gates:** the CI coverage gate and the `verifiedText` gate
  ([engine-design § Content gates](engine-design.md#content-gates)).
- **Primitive registry:** each DSL primitive is defined, interpreted, and
  tested in its own module under `effects/primitives/`, registered like step
  kinds. Phases 3.5–3.8 and every Phase 5 content batch add primitives by
  adding files.
- **Tooling:**
  - the scenario-spec builder (with scripted answers);
  - the initial card-lab setup solver.

**Acceptance:**

- Primitive tests use synthetic cards, with one test file per primitive
  group, not per primitive (D19).
- The gates pass with every entity `pending` or `vanilla`.
- The fuzzer mixes synthetic cards and full-pool pending cards into decks.
- Adding a primitive touches only its own module, its group's test file, and
  one line in the registry index. Show this with one primitive added after
  the registry lands. The registry index is the primitive catalog;
  engine-design's table lists only the starting set.

### 3.5 Stack, priority, and timing windows (core-review)

Build:

- the D13 model, with `play`, `activate`, and `resolveTop` steps;
- Standard, Fast, and Interrupt legality per window;
- activated abilities on the stack, including avatar ☾ abilities and avatar
  exhaust (P4);
- P1 auto-pass;
- the Dusk and Night windows;
- `prevent`, including the "unless the opponent pays" prompt and "put it on
  top of the opponent's deck" or "into your hand";
- the `payToEnd` special action for "until the opponent pays N●" effects
  ([C7](decisions.md#c7-paying-to-end-an-effect-is-a-fast-special-action));
- "cannot be prevented".

**Acceptance:**

- Tests cover the D13 worked example and each window/side combination.
- Prevent covers created and reclaimed items.
- The fuzzer runs with synthetic Interrupts.

### 3.6 Triggers and durations (core-review)

Build:

- the event bus;
- the matcher;
- the FIFO queue in the D14 order, with one `resolveTrigger` step per trigger;
- functional zones;
- intervening conditions (as an RD entry);
- once-per-turn;
- floating and delayed triggers, `triggerAbility`, and disabled triggers;
- all named triggers and the `when…` patterns, including nth-in-turn counters
  and "when you challenge with N"
  ([C10](decisions.md#c10-when-you-challenge-with-n-fires-at-challenger-designation));
- every duration kind.

**Acceptance:**

- Order tests cover simultaneous triggers across both sides, emblems, and both
  ranks.
- Durations expire exactly at their boundaries.
- Prompts raised by triggers mid-sequence suspend and resume correctly.

### 3.7 Continuous effects (core-review)

Build:

- the layer evaluation;
- Support adjacency;
- anthems;
- base-spark setting;
- type changes;
- keyword grants and removal;
- cost increases and reductions, including consumable "next card" modifiers;
- locked-at-resolution values (an RD entry);
- memoization.

**Acceptance:** layer-order tests, including timestamp ties, and Support
contract tests ported from the prototype.

### 3.8 Zones and special mechanics

Build:

- `moveInstance` and its replacements: created cards and figments cease to
  exist, reclaimed cards are banished, Veil;
- materialize placement and capacity;
- the figment catalog, including Legionnaire;
- merging, and figments created at capacity;
- gain control;
- banish-until and its returns;
- Offering, Ephemeral, and Reclaim from the void;
- Phasing;
- stack copies (D15), figment copies
  ([C5](decisions.md#c5-figment-copies-copy-copiable-values)), and
  create-in-hand copies;
- figment cost 0●
  ([C13](decisions.md#c13-figments-cost-0)) and the ⍟ floor of 0
  ([C14](decisions.md#c14-victory-points-never-go-below-0)).

**Acceptance:**

- Figment and capacity contract tests are ported from the prototype.
- Copy tests cover new targets via a prompt, X carry-over, and
  prevent-the-copy.

### 3.9 Loops (core-review)

Build:

- loop signatures;
- `LoopCandidate` with recorded answers and fingerprints;
- the `repeatLoop` and `loopIteration` steps with early stops, including on a
  fingerprint mismatch;
- the mandatory-cycle draw;
- the resolution cap;
- the limits, in the battle data module.

**Acceptance:** tests with synthetic cards cover:

- an optional infinite loop, offered and executed;
- a loop with an embedded prompt, replayed;
- a loop stopped by a changed choice;
- a loop interrupted by an opponent's response;
- a mandatory cycle that ends in a draw;
- the resolution cap.

### 3.10 Views, determinization, logging, and performance

Build:

- **Views:** `view()` redaction, knowledge tracking (including `privateTo`
  prompts), and `determinize()` (D22).
- **Logging:** the engine logging schema
  ([workflow § Logging](workflow.md#logging)).
- **Performance:** measure the
  [performance targets](engine-design.md#performance-targets) and record them
  in `metrics.md`.

**Acceptance:**

- A redaction invariant runs in the fuzzer.
- Determinization tests pass.
- The numbers are recorded.

### 3.11 Mason pass

Run the [mason pass](workflow.md#mason-passes) over `src/engine/`: type
safety of IDs, steps, prompts, and answers; illegal states in `BattleState`;
duplicated rules logic; and anything that would make Phase 5's ~750
definitions harder to write. Every filed bead keeps the fuzz smoke green.

### 3.12 Phase gate

1. **Fuzz soak:** 10,000 games with synthetic and vanilla decks, ≥10% of them
   in interactive replay mode, in ≤30-minute batches with ≤4 processes. There
   must be zero invariant violations or divergences. The soak runs as a
   background process under the D17 soak conditions, and Phase 4 beads may
   run meanwhile.
2. **Adversarial check:** run the `adversarial-test-validation` skill on the
   engine core, the step runner and prompt protocol first. Fix the survivors.
3. **Retrospective:** run the [phase retrospective](workflow.md#retrospectives)
   and land the beads it files.
4. **Independent review** of the whole phase diff.
5. Update `metrics.md`, including the D19 suite budgets and the engine tests'
   share of the suite. In staged mode, confirm `release == staging`. Then
   close the epic.

## Exit gate

- The engine enforces all of `docs/rules.md`.
- The prompt protocol is proven by property tests and the soak.
- Every entity is `pending` or `vanilla`.
- Every mason bead filed this phase has landed.
- The retrospective's improvement beads have landed.
- The reviews are resolved.

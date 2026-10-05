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
([D18](decisions.md#d18-review-cadence)).

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
2. **Create `docs/plan/evidence/rules-decisions.md`** with entries RD-001
   onward.
3. **Fix contradictions** you find, through the ladder.

**Acceptance:** each listed decision appears in `docs/rules.md` as current
state, with an RD entry.

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
- **Tooling:**
  - the scenario-spec builder (with scripted answers);
  - the initial card-lab setup solver.

**Acceptance:**

- Primitive tests use synthetic cards.
- The gates pass with every entity `pending` or `vanilla`.
- The fuzzer mixes synthetic cards and full-pool pending cards into decks.

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
   must be zero invariant violations or divergences.
2. **Adversarial check:** run the `adversarial-test-validation` skill on the
   engine core, the step runner and prompt protocol first. Fix the survivors.
3. **Independent review** of the whole phase diff.
4. Update `metrics.md`, then close the epic.

## Exit gate

- The engine enforces all of `docs/rules.md`.
- The prompt protocol is proven by property tests and the soak.
- Every entity is `pending` or `vanilla`.
- Every mason bead filed this phase has landed.
- The reviews are resolved.

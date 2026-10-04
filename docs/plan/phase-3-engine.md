# Phase 3: Rules Engine Core

**Goal:** a headless, deterministic engine in `src/engine/` that enforces all
of battle_rules.md. It must be complete enough that Phase 5 is "only" content.
This phase defines no catalog cards beyond vanilla bodies. Primitives are
exercised by **synthetic definitions** in `src/engine/testing/synthetic-cards.ts`,
which are test fixtures, not catalog content.

**Read first:**

- [engine-design](engine-design.md), in full;
- [battle_rules.md](../battle_rules/battle_rules.md);
- [decisions D10–D15 and P1–P6](decisions.md);
- the prototype's challenge, Support, energy, and figment logic, for parity:
  `src/battle/engine/challenge.ts`, `support.ts`,
  `src/battle/state/figments.ts`, and `src/rules/battle/basic-automation.ts`;
- the Rust reference, read-only, for precedent:
  `~/dreamtides/rules_engine/src/battle_mutations/src/play_cards/resolve_card.rs`
  and `phase_mutations/fire_triggers.rs`.

Beads marked **core-review** get an independent review
([D18](decisions.md#d18-review-cadence)).

## Tasks

### 3.1 Write the interview's rules into battle_rules.md

This is a docs-only bead.

1. **Write normative text** for each of these:
   - D13 priority;
   - D14 trigger queue and order;
   - D15 copies;
   - D12 loops, in a new "§ Infinite Loops";
   - P1 auto-pass;
   - P4 avatars and dreamsigns are not characters;
   - P5 victory and draw checks;
   - P6 the hand-limit choice;
   - F3 temporary-banish return.
2. **Create `docs/rules_decisions.md`** with entries RD-001 onward for these.
3. **Fix contradictions** inside battle_rules.md you find on the way, through
   the ladder.

**Acceptance:** every listed decision appears in battle_rules.md as current
state, with an RD entry.

### 3.2 Engine skeleton (core-review)

Build:

- the state model;
- instance IDs;
- RNG named streams;
- serialization;
- a stable state hash;
- the `createBattle(init)`, `decision`, `legalActions`, `apply`, `view` API.

Rules:

- the phase machine (Dreamwell from round 2, Draw, Dawn, Day, Dusk, Night,
  Challenge lane cursor, Ending);
- Dreamwell energy (F1);
- draw, Fatigue doubling, hand limit (a P6 prompt);
- challenger and blocker designation;
- Challenge resolution with Vengeful and Awakened;
- victory and draw checks (P5);
- the turn limit.

Content: vanilla characters, plus events with no text.

Tooling: the fuzz harness `npm run fuzz:engine` (seeded, Random policy,
invariants from [engine-design](engine-design.md#testing-layers)), as a Node
script via `tsx`.

**Acceptance:**

- Port the prototype's challenge tests as contract tests, rewritten against
  engine actions.
- Phase-machine tests.
- `fuzz:engine --games 1000` runs clean.
- Replaying any fuzz game's action log reproduces its final hash.

### 3.3 Ability DSL, interpreter, registry, and gates (core-review)

Build:

- **The DSL:** ability types, builders, and the interpreter. Start the
  primitive catalog with resources, cards, characters, flow, selectors,
  values, and durations; stack primitives come in 3.4.
- **Play-time choices:** the `playOptions` choice tree and validation of
  `PlayChoices`.
- **Resolution-time prompts:** every `Prompt` kind.
- **The registry:**
  - `vanilla()` and `pending()`, with every catalog UUID registered as
    `pending()` or `vanilla()`;
  - the CI coverage gate and the text-hash drift gate
    ([engine-design § Registry](engine-design.md#registry-and-gates));
  - `src/engine/content/pending.ts`.
- **The English renderer and audit:** `npm run audit:abilities`.
- **Test tooling:** the scenario-spec builder and the initial card-lab setup
  solver.

**Acceptance:**

- Primitive tests use synthetic cards, one or more per primitive.
- The gate test passes with the full pending list.
- The audit script runs on synthetic definitions.
- Fuzz runs with synthetic cards mixed into the decks.

### 3.4 Stack, priority, and timing windows (core-review)

Build:

- the D13 priority model;
- Standard, Fast, and Interrupt legality per window;
- activated abilities as stack items, including avatar ☾ abilities with
  avatar exhaust (P4);
- P1 auto-pass;
- the Dusk and Night windows for the right sides;
- `prevent`, including "unless the opponent pays", "put it on top of the
  opponent's deck", and "into your hand";
- "This event cannot be prevented".

**Acceptance:**

- Tests cover the D13 worked example and each window/side combination.
- Prevent covers created and reclaimed items.
- The fuzzer runs with synthetic Interrupts.

### 3.5 Triggers and durations (core-review)

Build:

- the event bus;
- the matcher;
- the FIFO queue with the D14 order;
- functional zones;
- intervening conditions (as an RD entry);
- once-per-turn;
- floating triggers, delayed "next time" triggers, and `triggerAbility`;
- disabled triggers;
- all named triggers and the `when…` patterns, including nth-in-turn counters
  ("your second card in a turn");
- every duration kind.

**Acceptance:**

- Order tests cover simultaneous triggers across both sides, avatar and
  dreamsigns, and both ranks.
- Durations expire exactly at their boundaries.

### 3.6 Continuous effects (core-review)

Build:

- the layer evaluation ([engine-design](engine-design.md#continuous-effects));
- Support adjacency;
- anthems;
- base-spark setting;
- type changes ("all character types");
- keyword grants and removal;
- cost increases and reductions, with "next card" modifiers consumed on use;
- locked-at-resolution values (an RD entry);
- memoization per state version.

**Acceptance:** layer-order tests, including timestamp ties, and Support tests
ported from the prototype as contracts.

### 3.7 Zones and special mechanics

Build:

- `moveInstance` and its replacement rules: created cards and figments cease
  to exist, reclaimed cards are banished, Veil;
- materialize placement and capacity;
- the figment catalog, from `data/figments.ron`, including Legionnaire;
- merging, and figments created at capacity
  (battle_rules.md § Creating Figments at Capacity);
- gain control;
- banish-until and its return (F3, plus RD entries for the other variants);
- Offering, Ephemeral, and Reclaim / Reclaim N● from the void;
- Phasing;
- stack copies (D15), figment copies, and create-in-hand copies.

**Acceptance:**

- Port the prototype's figment and capacity tests as contracts.
- Copy tests cover new targets, X carry-over, and prevent-the-copy.

### 3.8 Loops (core-review)

Build:

- loop signatures;
- `LoopCandidate` detection;
- `repeatLoop` execution with its early-stop rules;
- the mandatory-cycle draw;
- the resolution cap;
- the RON limits in `data/battle.ron`, through the game-data compiler schema.

**Acceptance:** tests with synthetic cards cover:

- an optional infinite energy or score loop, offered and executed;
- a loop interrupted by an opponent's legal response;
- a mandatory two-trigger cycle that ends in a draw;
- the resolution cap.

### 3.9 Views, determinism, logging, and performance

Build:

- **Views:** `view()` redaction and knowledge tracking (reveal, look at hand,
  play, public moves), and `determinize()` (D22).
- **Logging:** the engine logging schema
  ([workflow § Logging](workflow.md#logging)).
- **Performance:** measure the
  [performance targets](engine-design.md#performance-targets) and record them
  in `metrics.md`.

**Acceptance:**

- A redaction invariant runs in the fuzzer.
- Determinization tests: sampled states never contain cards that contradict
  the observations.
- The performance numbers are recorded.

### 3.10 Phase gate

1. **Fuzz soak:** 10,000 games with synthetic and vanilla decks, run in
   ≤30-minute batches with ≤4 processes. There must be zero invariant
   violations.
2. **Adversarial check:** run the `adversarial-test-validation` skill on the
   engine core. It injects realistic bugs, adds regression tests for survivors,
   and restores production code.
3. **Independent review** of the whole phase diff.
4. **Metrics:** update `metrics.md`.
5. Close the epic.

## Exit gate

- The engine enforces every battle_rules.md section.
- The registry and gates are live, with every catalog UUID pending or vanilla.
- The soak is clean.
- The adversarial survivors are fixed.
- The reviews are resolved.

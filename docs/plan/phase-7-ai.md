# Phase 7: AI (Last)

**Goal:** a competent, fair AI built in three layers:

1. a hand-written **Expert** bot;
2. a determinized **turn-planning search** (Planner) on top of the Expert;
3. tournaments against other bot types, to evaluate and improve it.

The phase ends with the run's final acceptance and report.

**Read first:**

- [decisions D17, D22–D25, D27](decisions.md);
- [engine-design § Policy interface](engine-design.md#policy-interface) and
  [§ Views](engine-design.md#views-and-hidden-information);
- `~/dreamtides/docs/ai_system/ai_system.md`, read-only. It describes the Rust
  ISMCTS. Note its finding that random rollouts beat heuristic rollouts there;
  test that here rather than assume it.

## Earliest start and task graph

The original task acceptance joins follow these arrows; functional build
children use the adopted native lanes below:

- 7.1 ← Phase 4.5. The harness and deck pool are built during Phase 5,
  because they need only the policy interface.
- 7.2a evaluation build ← 7.1. It starts during the Phase 5 gate
  ([D46](decisions.md#d46-lean-phase-5-gate-and-early-ai-build)).
- 7.2 Greedy upgrade, comparison and `greedy@7.2` freeze ← 7.2a, the Phase 5
  gate.
- Expert build children `.13`–`.16` ← 7.2a.
- Original 7.3 integration/reference/strength ← 7.2 and its four delivered
  functional children.
- Original 7.4 baseline report ← completed Expert 7.3 and delivered ISMCTS/
  calibration; original 7.5 full Planner strength ← 7.3, 7.4 and delivered
  Planner/calibration. ISMCTS and Planner builds `.17`/`.18` run independently
  after completed Expert `.4`; the baseline report does not serialize their
  implementation.
- 7.6 live acceptance ← 7.5
- 7.7 iterations run in sequence ← 7.6
- 7.8 ← 7.7; 7.9 ← 7.8
- 7.10 ← 7.9, the Phase 6 gate, and the Track T gate
- 7.11 ← 7.10

The adopted functional build lanes and original acceptance joins are recorded
in [hv-umm2.606](evidence/parallelism/hv-umm2.606.md). The 7.2a evaluation
build and the Expert build children `.13`–`.16` run during the Phase 5 gate.
They do not change the Greedy or Random policies the gate runs. Every
tournament, strength report, frozen reference and calibration waits for the
Phase 5 gate (`hv-umm2.46`).

| Build owner | Delivered work | Required consumer/join |
| --- | --- | --- |
| `hv-fy5h.13` | AST extraction and its real typed evaluation contract | `.14` Dusk, `.16` prompts, `.15` valuation; original `.4` |
| `hv-fy5h.14`, `.16` | Exact Dusk assignment and prompt choices in separate modules | `.15` consumes delivered Dusk/AST; original `.4` integrates all four |
| `hv-fy5h.15` | Day/response/placement valuation | Original `.4` Expert report, strength and frozen reference |
| `hv-fy5h.17`, `.18` | Independent ISMCTS and Planner builds after completed Expert `.4` | `.19` registration/calibration, then originals `.5`/`.6` |
| `hv-fy5h.19` | Real registration and per-policy calibrated budgets through the existing harness | Original `.5` baseline report, `.6` full Planner strength/core join, `.7` live integration |

These are functional modules with observable public synthetic contracts and
actual consumers. Shared contracts belong to the first real functional owner;
unused type-only packages, placeholder registries and entry/Knip waivers do
not establish a lane. Native Areas name the exact primary/read-only/conditional
bodies and their serialization. Original acceptance quantities and all final
joins below remain binding; independent builds do not imply early tuning.

Tournament runs are heavy. Run them as background processes, only under the
D17 soak conditions. While one runs, the current bead may implement, but not
run heavy validation.

**No time box.** The phase is best effort
([D25](decisions.md#d25-ai-phase-stop-rule)). Every build task, 7.1–7.6,
completes against its own acceptance. The improvement loop (7.7) ends when
three consecutive iterations produce no new champion.

## Tasks

### 7.1 Tournament harness and deck pool

- **Runner:** `npm run tournament -- --a <policy> --b <policy> --games <n>
  --budget <iterations|scale> --pool <file> --seed <s>`. It is a Node runner
  on `worker_threads` with at most 4 workers and resumable ≤30-minute batches
  (D17).
- **Games:**
  - **Pairing:** each seed and deck pair is played twice, with the policies
    swapping seats, including who moves first.
  - **Determinism:** fixed seeds; the policy RNG is separate from the battle
    RNG.
- **Results:** per-game JSONL goes to `logs/tournaments/<run-id>.jsonl`. The
  summary report goes to `docs/plan/evidence/ai/<run-id>.md`. Each report
  states:
  - the win rate, with a Wilson 95% CI; draws count ½;
  - an Elo estimate across all policies played;
  - per-layer and per-archetype splits;
  - the mean decision time;
  - the host load.
- **Deck pool:** `scripts/tournament/deck-pool.json`, frozen for
  reproducibility. It holds 8 decks per Atlas layer 0–6, built by the real
  opponent generator with its avatars and dreamsigns, plus each Apollyon
  incarnation's deck. Regenerate it only deliberately, and log why.

**Acceptance:**

- A Random-vs-Greedy run of 200 games produces a report.
- Re-running with the same seed reproduces identical outcomes.

### 7.2 Evaluation function

This task has two beads
([D46](decisions.md#d46-lean-phase-5-gate-and-early-ai-build)):

- **7.2a** builds the evaluation module, its weights in `src/content/ai.ts`,
  and its contract tests. It leaves the Greedy and Random policies unchanged.
- **7.2** upgrades Greedy to use it, runs the comparison and freezes
  `greedy@7.2`, after the Phase 5 gate.

Hand-written features computed from the engine view:

- the score difference and the distance to `scoreToWin`;
- projected challenge outcomes for the current board;
- spark on board by rank and Support;
- cards in hand and deck health (fatigue risk);
- current and maximum energy;
- threats: opposing removal or Interrupts that could still be in hand,
  estimated from the decklist;
- tempo.

The weights live in the AI data module (`src/content/ai.ts`). Greedy is
upgraded to use the evaluation.

**Acceptance:**

- Contract tests: the evaluation is monotonic in obvious features.
- New Greedy beats old Greedy (CI lower bound > 50%, 400 games).
- Snapshot it as the frozen reference policy `greedy@7.2` (D25). Later edits
  to the evaluation never change the snapshot.

The frozen `greedy@7.2` reference includes its complete policy-owned
evaluation, weights, simulation ordering and prompt dependencies, with hashes,
a manifest and public decision characterization. The old comparison policy is
preserved before the upgrade; mutable evaluation/config imports cannot stand
in for a frozen reference.

### 7.3 Expert bot (D27)

**Valuation.** Valuation comes from the ability AST. The DSL exposes feature
extractors: cards drawn, energy, points, spark swing, removal reach, recursion,
tempo, and trigger value.

**Strategy rules:**

- **Day:** curve and sequencing, with removal before deployment. Choose
  challengers by projecting the opponent's Dusk blocks. Place characters to
  maximize Support.
- **Dusk (defending):** assign blockers by solving the small lane assignment
  exactly. There are 9 lanes, so this is exhaustive or Hungarian. It minimizes
  points conceded and value lost.
- **Responses:** Prevent high-value items. Hold Interrupts while their
  expected value is higher than using them. Pay "unless" costs when cheap.
- **Prompts:** targets and choices by valuation.

**Overrides.** A small per-card table
(`src/engine/policy/expert-overrides.ts`) is filled only from observed
misplays, each with a note.

**Acceptance:**

- Expert beats Greedy (CI lower bound > 50%, 400 games). The first report is
  recorded.
- Snapshot it as the frozen reference policy `expert@7.3` (D25). Later edits
  to the Expert rules never change the snapshot.

Original `hv-fy5h.4` owns Expert registration, current catalog weights and
observed-misplay overrides while consuming `.13`–`.16` read-only. Its 400-game
strength report and `expert@7.3` snapshot retain the whole policy-owned
AST/Dusk/Day/prompt/evaluation/config closure with immutable catalog reference
data, hashes and decision characterization (D22–D25).

### 7.4 ISMCTS baseline

Root-parallel UCT with a fresh determinization per iteration, as in the Rust
design. Try rollouts with both the Random and Expert policies. Budgets are in
iterations.

**Acceptance:** a report against Expert and Greedy at the calibrated full
budget.

### 7.5 Planner (core-review)

A determinized turn-planning beam search over the acting side's own action
sequences, through its pass. It works like this:

- **Samples:** K determinizations of the opponent's hidden state (D22).
- **Expansion:** expand legal actions, including play-time choices and
  `repeatLoop`, with the Expert's move ordering.
- **Evaluation:** each leaf runs the rest of the turn with the Expert on both
  sides, through Dusk blocks, Night responses, and the Challenge. It then
  optionally runs a shallow model of the opponent's next turn, and applies the
  evaluation function.
- **Selection:** pick the best plan by average value across the samples.
- **Anytime:** search stops at the iteration budget or the wall-clock cap.
- **Off-turn decisions:** responses, prompts, and Dusk use a shallow search
  over Expert or a Planner variant.

**Acceptance:** the Planner beats Expert (CI lower bound > 50%, 400 games) at
the calibrated budget.

`hv-fy5h.19` performs the build-side calibration and real registration after
both search modules land. Its bounded extension of the existing tournament
options/game/report transport binds budgets to the acting policy across
paired seat swaps and preserves legacy common-pair and resume behavior.
Configuration/source/calibration identities remain fixed across the `.5`/`.6`
reports; an algorithm or tuning change invalidates affected reports and needs
recalibration. Original `.7` proves live caps, logs, worker behavior and UI
responsiveness. All D23 proxy/caps, D24 full-strength presets and D25 frozen
reference/champion rules below remain.

### 7.6 Live integration and calibration

- **The champion runs in the Web Worker.**
- **Budget calibration (D23):**
  1. Measure iterations per second on the M5 Max.
  2. Set the iteration budgets so a mid-range laptop meets the ~1.5 s main and
     ~0.5 s response caps. Use 3× the M5 Max time as the proxy.
  3. Keep the wall-clock caps as a backstop.
- **Per-layer presets** in the AI data module (D24), defaulting to full
  strength.
- **AI decision logging** per the [schema](workflow.md#logging).
- **Browser QA:** the UI stays responsive during AI turns, and AI pacing uses
  the reveal dwell.

**Acceptance:** live games keep their budgets, and logs show the per-decision
budget used.

### 7.7 Improvement loop

Each iteration is one bead, filed only after the previous iteration closes.

1. **Hypothesize** from evidence: losses, AI decision logs, blunders found in
   QA, per-archetype weaknesses. Write it in the bead description.
2. **Change** one thing: evaluation weights, the expert rules, search
   parameters, an override, a determinization count.
3. **Screen.** Run 200 games at ⅛ budget against the champion. If the CI upper
   bound is below 50%, the candidate is rejected early.
4. **Confirm.** Run at least 400 games at the full calibrated budget against
   the champion. The candidate becomes **champion** only if its CI lower bound
   is above 50%.
5. **Commit:**
   - If promoted, commit the change and record the new champion ID.
   - If rejected, commit only the report, and revert the code.
6. **Check the stop rule (D25).** The phase moves to 7.8 when the last three
   iterations produced no new champion. Each new champion is also measured
   against the frozen `expert@7.3` and `greedy@7.2` with ≥400 full-budget
   games, and the report records both win rates with their Wilson 95% CIs.
   These are reference points, not a bar.

Run tournaments only when no Tollgate validation is running (D17).

### 7.8 Apollyon re-check and balance report

1. Re-run the 5.8 sanity matrix with the champion.
2. Write `docs/plan/evidence/ai/balance.md` with:
   - per-avatar, per-archetype, and per-incarnation win rates;
   - outlier cards, flagged as observations only (D11).

### 7.9 Mason pass

Run the [mason pass](workflow.md#mason-passes) over `src/engine/policy/`, the
tournament runner, and the worker host. It runs after the improvement loop.
Each bead must leave policy
behavior unchanged: a fixed-seed tournament reproduces the champion's
outcomes exactly.

### 7.10 Final acceptance

1. **Browser acceptance** on desktop and mobile:
   - ~10 full games against the champion, with a blunder report written into
     `docs/plan/evidence/ai/acceptance.md`;
   - two full journeys with real battles and no debug resolution
     ([D41](decisions.md#d41-final-acceptance-opponents)): one ending in
     victory against Apollyon, played with `?ai=greedy`, and one ending in
     defeat, played against the champion;
   - the full tutorial.

   `__caps` must be empty throughout.
2. **Final gates:**
   - a 10,000-game fuzz soak with the champion and Random policies, ≥10% of
     games in interactive replay mode;
   - the coverage gate;
   - the full gate, with `release == staging == origin/master`;
   - the D19 suite budgets.
3. **Retrospective:** run the [phase retrospective](workflow.md#retrospectives)
   and land the beads it files.
4. **Independent review** of the Phase 7 diff.

### 7.11 Report and end state

The last bead. Its commit deletes `docs/plan/`, so its friction record goes
into the report instead of a friction file. After it lands, the run is over:
a compaction that finds no `docs/plan/README.md` and no `# Plan` section in
`AGENTS.md` stops.

1. **Docs pass.** `README.md`, `docs/rules.md`, and `docs/design.md`
   describe the shipped system in the current state. The rules include every
   normative decision; the design includes Apollyon, marked provisional.
2. **Write `docs/plan/report.md`.** This is the only plan file that survives.
   It is self-contained, because its sources are deleted in step 3. It covers:
   - what was delivered against the README's outcomes;
   - a summary of the rules decisions, with each RD's ladder step and the
     affected UUIDs;
   - the full card-issues list (UUID, problem, interpretation, suggested
     fix), for the operator;
   - the QA ledger totals and any remaining judged concerns;
   - the metrics before and after;
   - the friction ledger's recurring causes and the improvement beads they
     produced, with their measured effect;
   - the tournament ladder and champion, the champion's win rates against
     the frozen `greedy@7.2` and `expert@7.3`, and the balance observations;
   - the open issues, the review debt (if any), and the recommended
     follow-ups. Meta-progression is first.
3. **Reach the D33 end state.** Delete `docs/plan/` except `report.md`.
   Remove the `# Plan` section from `AGENTS.md` and every other pointer into
   `docs/plan/`, so no surviving guidance references a deleted file.
   Verify that the tracked Markdown files are exactly those listed in
   [README done criterion 7](README.md#done-criteria-whole-run).
4. Close the Phase 7 epic. The run is over; the session stops.

## Exit gate

- The stop rule is satisfied.
- Every mason bead filed this phase has landed.
- The retrospective's improvement beads have landed.
- The final acceptance passes.
- The report is promoted.
- The D33 end state holds.
- This is the end of the run.

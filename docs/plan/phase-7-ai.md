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

**Clock:** the AI phase's 3-day wall-clock box
([D25](decisions.md#d25-ai-phase-stop-rule)) starts when bead 7.1 is claimed.
Record the start timestamp in the epic notes.

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

Hand-written features computed from the engine view:

- the score difference and the distance to `scoreToWin`;
- projected challenge outcomes for the current board;
- spark on board by rank and Support;
- cards in hand and deck health (fatigue risk);
- current and maximum energy;
- threats: opposing removal or Interrupts that could still be in hand,
  estimated from the decklist;
- tempo.

The weights live in the AI data module (`src/content/data/ai.ts`). Greedy is
upgraded to use the evaluation.

**Acceptance:**

- Contract tests: the evaluation is monotonic in obvious features.
- New Greedy beats old Greedy (CI lower bound > 50%, 400 games).

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

**Acceptance:** Expert beats Greedy (CI lower bound > 50%, 400 games). The
first report is recorded.

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
6. **Check the stop rule (D25).** The phase moves to 7.8 when either holds:
   - The champion clears the bar **and** the last three iterations produced
     no new champion. The bar is ≥75% against Expert and ≥90% against Greedy,
     each by CI lower bound with ≥400 full-budget games.
   - The 3-day clock has expired.

Run tournaments only when no Tollgate validation is running (D17).

### 7.8 Apollyon re-check and balance report

1. Re-run the 5.8 sanity matrix with the champion.
2. Write `docs/plan/evidence/ai/balance.md` with:
   - per-avatar, per-archetype, and per-incarnation win rates;
   - outlier cards, flagged as observations only (D11).

### 7.9 Final acceptance and report

1. **Browser acceptance** on desktop and mobile:
   - ~10 full games against the champion, with a blunder report written into
     `docs/plan/evidence/ai/acceptance.md`;
   - two full journeys with real battles, one ending in victory against
     Apollyon and one in defeat;
   - the full tutorial.

   `__caps` must be empty throughout.
2. **Final gates:**
   - a 10,000-game fuzz soak with the champion and Random policies, ≥10% of
     games in interactive replay mode;
   - the coverage gate;
   - the full gate;
   - GitHub checks green.
3. **Independent review** of the Phase 7 diff.
4. **Docs pass.** `README.md`, `docs/rules.md`, and `docs/design.md`
   describe the shipped system in the current state. The rules include every
   normative decision; the design includes Apollyon, marked provisional.
5. **Write `docs/plan/report.md`.** This is the only plan file that survives.
   It is self-contained, because its sources are deleted in step 6. It covers:
   - what was delivered against the README's outcomes;
   - a summary of the rules decisions, with each RD's ladder step and the
     affected UUIDs;
   - the full card-issues list (UUID, problem, interpretation, suggested
     fix), for the operator;
   - the QA ledger totals and any remaining judged concerns;
   - the metrics before and after;
   - the tournament ladder and champion, plus the balance observations;
   - the open issues, the review debt (if any), the deferred `mason` beads,
     and the recommended follow-ups. Meta-progression is first.
6. **Reach the D33 end state.** Delete `docs/plan/` except `report.md`.
   Verify that the tracked Markdown files are exactly those listed in
   [README done criterion 7](README.md#done-criteria-whole-run).
7. Close the Phase 7 epic.

## Exit gate

- The stop rule is satisfied.
- The final acceptance passes.
- The report is promoted.
- The D33 end state holds.
- This is the end of the run.

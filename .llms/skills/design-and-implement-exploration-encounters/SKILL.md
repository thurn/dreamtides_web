---
name: design-and-implement-exploration-encounters
description: Design a random or UUID-selected batch of Dreamtides Exploration encounters and ship the winning designs directly into data/tabula/exploration.toml as complete replayable behavior. Use when expanding the live Exploration catalog, designing and implementing encounter batches in one pass, porting new card-art encounters straight to production, or adding the effect kinds, Cumulus choices, persisted outcomes, animations, logs, tests, and browser QA required by new Exploration mechanics.
---

# Design and Implement Exploration Encounters

Ship one implementation-ready encounter for each selected canonical card. The
default batch is five cards. Use private design competition for quality, but do
not write `data/exploration_candidates.json`: each designer compares five
concepts and emits only the winner plus four short rejection notes. Complete
the selected designs as live, tested behavior in the same worktree.

## Establish the isolated run

1. Invoke `$wt` and create a fresh worktree before reading repository data.
   Continue follow-up work in that same unpromoted worktree.
2. From the worktree root, run `npm install`, then
   `scripts/regenerate-assets.sh` as required by the repository instructions.
3. Create an empty temporary run directory outside the repository.
4. Select the batch and create canonical per-card requests:

   ```bash
   python3 .llms/skills/design-and-implement-exploration-encounters/scripts/select_batch.py \
     --run-dir <empty-run-directory>
   ```

   The default is five random cards absent from live Exploration. Use
   `--batch-size <positive-count>` or `--seed <integer>` when requested. For an
   explicit set, add one `--card-id <canonical-uuid>` per card; explicit UUIDs
   replace random selection. Stop if a requested UUID already has a live
   encounter or fewer eligible cards exist than requested.

The selector writes `manifest.json`, `requests/`, and `results/`. It includes
the resolved full-size artwork path in every request and records source digests
so completed designs cannot be assembled against changed catalogs.

## Run one designer per card

Read [references/design-contract.md](references/design-contract.md) completely
before dispatch. Spawn exactly one design subagent for each selected UUID and
run them concurrently up to available capacity. Give each agent only its own
request path, result path, the design-contract path, and this assignment:

```text
Design one implementation-ready Dreamtides Exploration encounter for the
canonical request at <request-path>. Read and follow <design-contract-path>
completely. Actually inspect the request's full-size art. Privately generate
and rank five complete two-action concepts, then write only the winning design
and four concise rejected-alternative notes to <result-path> using the exact
JSON contract. Do not edit repository files or any other result. Report only
the card UUID and result path.
```

Design agents may read canonical repository data but must not edit it. Keep
cards UUID-backed throughout. Wait for every result. If validation fails, send
the precise error to that card's original agent for repair; never substitute a
different card or accept a partial batch.

Assemble all winners atomically:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/assemble_designs.py \
  --manifest <run-directory>/manifest.json \
  --results-dir <run-directory>/results \
  --workset-output <run-directory>/encounter_workset.toml \
  --display-output <run-directory>/display.md
```

The assembler validates every card, artwork path, template, variable, entity
reference, selection, prose field, action label, alternative note, and
implementation note before writing either output. It rejects stale source
digests, missing or extra result files, copied template wording, source-card
targets, and duplicate templates within an encounter. Treat the generated TOML
as scratch authoring input; never copy it wholesale over live data or commit the
temporary run directory.

## Triage implementation complexity

Read [references/implementation-guide.md](references/implementation-guide.md)
before classifying or changing mechanics. For each action, compare its required
semantics—not its wording—with existing effect kinds across offer preparation,
selection payload, state transition, persisted result, logging, and outcome
presentation.

Classify each winning design:

- **Reuse-only:** Both actions are semantically identical to existing effect
  kinds, require only authored fields already supported by the editor/compiler,
  and their existing persisted outcome paths satisfy the complete animation and
  logging contracts. The operator may author and verify these encounters
  inline. Do not spawn an implementation agent merely to paste TOML.
- **Vertical-slice:** Any action adds or extends a state transition, minted
  offer, selection shape, persisted result, log schema, semantic outcome,
  dedicated animation, or nontrivial Cumulus interaction. Group encounters by
  shared mechanic family and delegate each group to one implementation agent.
  A major mechanic must not be implemented inline.

Use one implementation agent per semantic mechanic family, not per card. Run
implementation assignments sequentially by default because the authored-data
schema, effect union, provider, view model, screen, and logging adapter are
shared integration points. Parallelize only when file ownership is proven
disjoint and no exhaustive type, registry, reducer, or catalog file overlaps.

Give each implementation agent the relevant request/result paths, scratch
workset, implementation-guide path, and this assignment:

```text
Implement the assigned Exploration encounter UUIDs from <workset-path> in this
worktree. Read and follow <implementation-guide-path> completely. Own the full
vertical slice for the assigned mechanic family: authored validation, asset
compilation, typed runtime data, deterministic persisted offers and resolution,
UUID-only intent, logging, semantic Cumulus outcome, dedicated animation,
reduced motion, synthetic tests, live exploration.toml entries, generated
assets, and focused verification. Do not use or edit
data/exploration_candidates.json. Do not leave TODOs or partial effect paths.
Report changed files, focused checks, and unresolved blockers.
```

Review every implementation-agent diff before proceeding. Repair omissions in
the same assignment when practical. The operator owns cross-group integration,
reuse-only entries, global action-ID uniqueness, final generated output, and
end-to-end verification.

## Complete the live vertical slice

For every winner:

1. Add exactly one encounter with exactly two actions to
   `data/tabula/exploration.toml`. Preserve `template-id`,
   `template-variables`, optional `selection`, rendered `effect-text`, and the
   generated globally unique action IDs unless a structural conflict requires a
   deterministic UUID-based replacement.
2. Reuse an effect kind only when all runtime semantics match. Implement every
   new or extended kind through editor metadata, compilation, types, persisted
   room-event state, deterministic provider behavior, UUID-only actions,
   reconstructable logs, view models, UI, and outcome animation.
3. Invoke `$cumulus` before changing Exploration UI. Game flow must fold from
   the room event log; React state may sequence a resolved presentation but may
   not gate shared behavior.
4. Persist every minted choice and exact result needed for replay, explanation,
   and presentation. Resolve names only at the display boundary.
5. Give every successful action a dedicated semantic outcome sourced from its
   persisted resolution. Picker UI, generic success copy, and closing the card
   are not outcomes.

Do not defer an in-scope broken dependency as pre-existing. Record only
unrelated pre-existing issues in `pre-existing-issues.txt` and commit that file
with the work.

## Verify every encounter and action

After live TOML is complete, run:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/verify_live.py \
  --workset <run-directory>/encounter_workset.toml
```

Then:

1. Run focused synthetic tests for authored compilation, offer minting,
   deterministic resolution and replay, logging, semantic view-model output,
   interaction, and each exact outcome animation.
2. Run `scripts/regenerate-assets.sh` and inspect tracked output.
3. Exercise every new action through the normal player workflow with
   `agent-browser` on a non-default port using
   `/?goto=exploration&card=<canonical-uuid>`.
4. Assert the persisted state change, resolution, semantic outcome attributes,
   animation completion/exit, responsive geometry, accessible result, reduced
   motion behavior, and an empty `window.__caps` error buffer.
5. Capture only the smallest desktop/mobile/outcome evidence set needed for
   distinct visual risks. Keep image artifacts out of version control.
6. Run `npm run review`. For major implementation work, request the repository's
   single independent review and fix confirmed findings.

Do not accept a batch because TOML compiles while an effect branch, log field,
selection contract, outcome, animation, test, or normal-player workflow remains
pending.

## Deliver

Confirm every manifest UUID appears exactly once in live Exploration and every
scratch workset action maps to a runtime-complete live action. Commit all
changes with a detailed message and push the worktree branch immediately.
Return the complete `display.md`, relevant QA evidence, and the `$wt`
promotion handoff. Do not commit scratch requests, design results, worksets,
display files, or screenshots.

## Invariants

- Select, compare, persist, log, and test cards by canonical UUID, never name.
- Never write the candidate catalog during this workflow.
- Never implement before every selected design validates atomically.
- Never infer mechanics from labels, prose, effect text, template IDs, or names.
- Never mint shared randomness during React rendering or player resolution.
- Never let a design agent edit repository data or an implementation agent own
  only part of a new effect family.
- Never finish with temporary designs but no committed, pushed live behavior.

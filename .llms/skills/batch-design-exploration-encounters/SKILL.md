---
name: batch-design-exploration-encounters
description: Select a requested-size random batch of canonical Dreamtides cards that are absent from data/encounter_candidates.json, delegate one exploration-encounter-designer run per card, validate and append every completed encounter set atomically, and return the batch in display Markdown. Use when generating encounter candidates in parallel, running a batch of encounter-design subagents, or expanding the encounter candidate catalog by a target count.
---

# Batch Design Exploration Encounters

Produce one validated five-encounter set per randomly selected card. Keep card
selection, collision detection, catalog writes, and display rendering in the
bundled scripts; use subagents only for the creative single-card designs.

## Required input

Require a positive target batch size. Accept an optional integer seed when the
caller wants reproducible card selection. The batch size is the number of cards
and the number of single-card subagent assignments.

## Workflow

1. Work from the repository root. Create a new empty temporary run directory.
   Never place intermediate agent output in `data/`.

2. Select the batch and create one canonical request per UUID:

   ```bash
   python3 .llms/skills/batch-design-exploration-encounters/scripts/select-batch.py \
     --batch-size <positive-count> \
     --run-dir <empty-run-directory>
   ```

   Add `--seed <integer>` only when supplied by the caller. Read the printed
   `manifest`, `requests_dir`, `results_dir`, and UUID list. Stop if selection
   reports fewer unrepresented cards than requested. Do not replace selected
   cards manually.

3. Spawn exactly one subagent for every selected UUID. Dispatch concurrently up
   to the available agent capacity; use additional waves when the batch is
   larger than the current capacity. Give each subagent only its own request
   path, its own result path, and this task:

   ```text
   Use $exploration-encounter-designer in JSON mode for the canonical card
   request at <requests_dir>/<card-uuid>.json. Follow that skill completely,
   including artwork inspection and validation. Write the resulting bare JSON
   list of five ranked event objects to <results_dir>/<card-uuid>.json. Do not
   edit data/encounter_candidates.json or any other batch result. In your final
   response, report only the card UUID and result path.
   ```

   Every assignment must explicitly invoke `exploration-encounter-designer`.
   Do not design cards in the operator agent while a corresponding assignment
   exists. All subagents intentionally read the same committed candidate usage
   baseline; only the aggregator writes the shared catalog.

4. Wait for every assignment. Confirm that each selected UUID has one result
   file. When an agent fails or produces invalid JSON, send the validation error
   back to that same agent for repair; do not substitute another card or accept
   a partial batch.

5. Validate every result against the single-card designer contract, resolve its
   artwork, append the complete batch atomically, and capture the display copy:

   ```bash
   python3 .llms/skills/batch-design-exploration-encounters/scripts/aggregate-batch.py \
     --manifest <run-directory>/manifest.json \
     --results-dir <run-directory>/results \
     --display-output <run-directory>/display.md
   ```

   The aggregator refuses stale catalog state, duplicate card UUIDs, missing
   results, invalid events, and unresolved artwork before writing. It marks the
   rank-1 candidate selected for the encounter editor. If it reports that the
   catalog changed after selection, preserve the completed results, select a
   fresh batch, and reuse a result only when its UUID is selected again and the
   single-card validator still accepts it.

6. Return only the complete contents of `display.md` to the caller. Preserve
   card order from the manifest and event rank order within each card. Do not
   add an introduction, summary, raw JSON, IDs, templates, scores, or ranking
   commentary.

## Safety invariants

- Identify cards exclusively by canonical UUID until display rendering.
- Never append any portion of a batch before all results validate.
- Never overwrite an existing card entry or aggregate against a changed source
  digest.
- Never let a subagent edit the shared candidate catalog.
- Use the scripts' path overrides only for synthetic tests or an explicitly
  supplied alternate repository data source.

---
name: batch-design-exploration-encounters
description: In a separate git worktree, select a requested-size random batch of canonical Dreamtides cards absent from data/exploration_candidates.json, delegate one exploration-encounter-designer run per card, append every validated encounter set atomically, commit and push the catalog update, show the batch in display Markdown, and offer to promote the catalog commit through the wt workflow. Use when generating encounter candidates in parallel, running a batch of encounter-design subagents, or expanding the encounter candidate catalog by a target count.
---

# Batch Design Exploration Encounters

Produce one validated five-encounter set per randomly selected card. The
persistent deliverable is a committed update to `data/exploration_candidates.json`
on a pushed worktree branch. The human-facing deliverable is the complete
generated `display.md`. Keep card selection, collision detection, catalog
writes, and display rendering in the bundled scripts; use subagents only for
the creative single-card designs. End with the `$wt` promotion handoff so an
approved batch is replayed onto `master`.

## Required input

Require a positive target batch size. Accept an optional integer seed when the
caller wants reproducible card selection. The batch size is the number of cards
and the number of single-card subagent assignments.

## Workflow

1. Invoke `$wt` and establish a separate git worktree before reading repository
   data or selecting cards. Perform the entire batch from that worktree's
   repository root. For follow-up work on an unpromoted batch worktree, continue
   in that same worktree as required by `$wt`. Never run the aggregation against
   the user's primary checkout.

2. Create a new empty temporary run directory outside the repository. Never
   place intermediate agent output in `data/`.

3. Select the batch and create one canonical request per UUID:

   ```bash
   python3 .llms/skills/batch-design-exploration-encounters/scripts/select-batch.py \
     --batch-size <positive-count> \
     --run-dir <empty-run-directory>
   ```

   Add `--seed <integer>` only when supplied by the caller. Read the printed
   `manifest`, `requests_dir`, `results_dir`, and UUID list. Stop if selection
   reports fewer unrepresented cards than requested. Do not replace selected
   cards manually.

4. Spawn exactly one subagent for every selected UUID. Dispatch concurrently up
   to the available agent capacity; use additional waves when the batch is
   larger than the current capacity. Give each subagent only its own request
   path, its own result path, and this task:

   ```text
   Use $exploration-encounter-designer in JSON mode for the canonical card
   request at <requests_dir>/<card-uuid>.json. Follow that skill completely,
   including artwork inspection and validation. Write the resulting bare JSON
   list of five ranked event objects to <results_dir>/<card-uuid>.json. Do not
   edit data/exploration_candidates.json or any other batch result. In your final
   response, report only the card UUID and result path.
   ```

   Every assignment must explicitly invoke `exploration-encounter-designer`.
   Do not design cards in the operator agent while a corresponding assignment
   exists. All subagents intentionally read the same committed candidate usage
   baseline; only the aggregator writes the shared catalog.

5. Wait for every assignment. Confirm that each selected UUID has one result
   file. When an agent fails or produces invalid JSON, send the validation error
   back to that same agent for repair; do not substitute another card or accept
   a partial batch. Batch validation reports every invalid result together, so
   route each UUID's error to its corresponding agent before retrying.

6. Validate every result against the single-card designer contract, resolve its
   artwork, append the complete batch atomically, and capture the display copy:

   ```bash
   python3 .llms/skills/batch-design-exploration-encounters/scripts/aggregate-batch.py \
     --manifest <run-directory>/manifest.json \
     --results-dir <run-directory>/results \
     --display-output <run-directory>/display.md
   ```

   The aggregator refuses stale catalog state, duplicate card UUIDs, missing
   results, invalid events, and unresolved artwork before writing. It validates
   the exact delivered result files from their card-only requests and reports
   all per-card failures in one pass. It marks the
   rank-1 candidate selected for the Exploration candidates editor. Candidate actions store
   `label`, `template_id`, `variables`, and optional selection metadata;
   canonical template wording remains exclusively in `data/templates.json`.
   The display renderer emits one label-and-effect bullet per action,
   substitutes braced variables, and preserves runtime
   `$SPECIAL_VARIABLE` tokens literally. If it reports that the
   catalog changed after selection, preserve the completed results, select a
   fresh batch, and reuse a result only when its UUID is selected again and the
   single-card validator still accepts it.

7. Confirm that aggregation modified the worktree's
   `data/exploration_candidates.json` and that every manifest UUID has exactly one
   newly appended catalog entry with five ranked events. Treat a successful
   `display.md` without the corresponding catalog diff as a failed run. Run the
   repository's required diff-aware review, commit the catalog update with a
   detailed message, and immediately push the worktree branch.

8. Return the complete contents of `display.md` to the caller. This Markdown is
   the presentation of the committed catalog update, not a substitute for that
   update. Preserve card order from the manifest and event rank order within
   each card. Do not add an introduction, summary, raw JSON, IDs, templates,
   scores, or ranking commentary to the display.

9. Immediately after `display.md`, perform the promotion handoff required by
   section 3 of `$wt`. Ask whether to promote the committed worktree changes
   onto `master`, with explicit **Yes** and **No** options. Do not ask before the
   display, bury the question inside it, or end the turn without the promotion
   choice. On **Yes**, follow `$wt` to replay the worktree commits onto `master`,
   push `master`, and clean up the worktree branches. Confirm that the promoted
   commit includes the batch's `data/exploration_candidates.json` update. On
   **No**, leave the catalog commit on the pushed worktree branch and keep
   `master` unchanged.

## Safety invariants

- Identify cards exclusively by canonical UUID until display rendering.
- Never append any portion of a batch before all results validate.
- Never overwrite an existing card entry or aggregate against a changed source
  digest.
- Never let a subagent edit the shared candidate catalog.
- Reject subagent actions containing copied `template` or `effect_text` fields.
- Edit mechanical wording only in `data/templates.json`; candidate records do
  not contain editable template copy.
- Never finish with only temporary result files or display Markdown; the batch
  is complete only after the worktree catalog change is committed and pushed.
- Never omit the `$wt` promotion handoff after presenting the committed batch.
- Never edit `data/exploration_candidates.json` in the primary checkout.
- Use the scripts' path overrides only for synthetic tests or an explicitly
  supplied alternate repository data source.

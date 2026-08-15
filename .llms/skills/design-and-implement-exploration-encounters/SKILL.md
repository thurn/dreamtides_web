---
name: design-and-implement-exploration-encounters
description: Rebalance Dreamtides Exploration by assigning underrepresented ideas from the complete 82-template library, auditioning existing encounter artwork, replacing exactly one overrepresented action, and shipping any required new typed mechanic as complete replayable behavior. Use for iterative Exploration redesign batches, template coverage or distribution work, one-action encounter refreshes, or explicit expansion batches that must implement assigned templates rather than substitute existing effects.
---

# Design and implement Exploration encounter actions

Optimize the live catalog for broad, roughly even coverage of the 82 source
templates while preserving strong existing encounter work. The default operation is
an **action redesign**, not a new encounter: assign one underrepresented template,
show the designer three existing encounter images with one replaceable action each,
choose the best narrative fit, and replace exactly that action.

## Non-negotiable objective

- The controller assigns template IDs before design begins.
- A designer interprets the assigned template; the designer never chooses a
  different template because it is implemented, familiar, or cheaper.
- `vertical_slice` means implement new production behavior. It is not permission to
  substitute a `reuse` template.
- One redesign changes one action. Preserve the selected encounter's card UUID,
  prose, untouched action, and untouched action UUID exactly.
- Mint a new UUIDv4 for the replacement action because its semantic identity changes.
- Preserve every unselected candidate encounter byte-for-byte.
- A batch is incomplete if it does not increase the assigned template's live count
  and decrease the nominated donor template's live count by one.

## Required references

Read these files completely before starting:

- `references/design-contract.md`
- `references/implementation-guide.md`
- `references/mechanic-ideas.md`
- `references/rebalancing-strategy.md`

`references/mechanic-ideas.md` contains the complete 82-entry source list from
`/tmp/templates.json`, including the original IDs and template text. The annotated
machine-readable form is `references/mechanic-ideas.json`. Integer template IDs are
design and audit identifiers; they are never `ActionDefinition.id` values.

`references/template-assignments.json` is the canonical audit ledger mapping every
live action UUID to one template ID. Never infer distribution from effect-kind
counts: several templates share the same runtime kind. Validate the ledger and print
current counts with:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/template_assignments.py
```

Validate the library and its rendered Markdown:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/mechanic_ideas.py
```

## 1. Establish the worktree

Follow repository instructions and use the `wt` skill unless the user explicitly
requests work on master. Install dependencies and regenerate assets in the fresh
worktree. Keep every follow-up batch in that worktree until promotion.

Create a unique empty scratch directory under `/tmp`. Scratch plans, requests,
results, worksets, and displays stay outside version control.

## 2. Audit and assign targets

Recompute live template counts before every batch. Select recipients from the
lowest-count templates and donors from the highest-count templates. Follow the
dependency-aware initial order in `references/rebalancing-strategy.md`; within a
wave, prefer the template with the lowest live count.

Each batch item contains:

- one required recipient template ID;
- three candidate encounter card UUIDs;
- one nominated replaceable action UUID per candidate; and
- the donor template ID of each nominated action.

Write the assignments to a scratch plan:

```json
{
  "schema_version": 1,
  "assignments": [
    {
      "target_template_id": 1,
      "candidates": [
        {
          "card_id": "<canonical UUID>",
          "replace_action_id": "<live action UUID>",
          "donor_template_id": 14
        },
        {
          "card_id": "<second canonical UUID>",
          "replace_action_id": "<second live action UUID>",
          "donor_template_id": 38
        }
      ]
    }
  ]
}
```

Provide two or three candidates per assignment, then run:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/select_redesign_batch.py \
  --run-dir "$RUN_DIR" \
  --plan "$RUN_DIR/redesign-plan.json"
```

Candidate encounters must be live, have full-size art, and donate an
overrepresented action. Do not nominate an action whose narrative fit is unusually
strong merely to satisfy arithmetic; pull the next candidate instead. Do not assign
the same encounter twice in one batch.

Use three candidates by default. Use two only when the eligible art pool is narrow
or the user requests it. Keep vertical-slice batches small: two to four assigned
templates from one implementation family.

## 3. Design one replacement per assignment

Use one independent designer per assignment when parallel agent work is available.
Give the designer only the immutable request, result path, and design contract.

The designer must inspect every candidate's full-size artwork and current
encounter, then:

1. choose the candidate where the assigned template produces the strongest visible
   and causal action;
2. redesign only its nominated action;
3. preserve encounter prose and the other action exactly;
4. use the assigned template ID exactly; and
5. write compact rejection reasons for the other candidates.

For an assigned `reuse` template, declare the catalog's current typed variant and
fields. For an assigned `vertical_slice` template, specify the new or extended
typed variant and the complete behavior contract. Implementation cost may shape
values or presentation but may not change the assigned template.

## 4. Validate the redesign workset

Assembly must reject:

- a replacement whose template ID differs from the assignment;
- a selected card or replaced action outside the candidate set;
- a reused effect whose typed contract does not match the catalog;
- any proposed change to encounter prose or the preserved action;
- reuse of the replaced action UUID; or
- stale source, art, encounter, action, or template-library hashes.

After every designer result exists, run:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/assemble_redesigns.py \
  --manifest "$RUN_DIR/manifest.json" \
  --results-dir "$RUN_DIR/results" \
  --workset-output "$RUN_DIR/redesign-workset.json" \
  --display-output "$RUN_DIR/display.md"
```

Show the assembled display to the user as an intermediate checkpoint. It must show
the three candidates, the selected replacement, the preserved action, recipient
template ID, and donor template ID. Continue to implementation unless the user asks
to pause.

## 5. Implement exactly the selected action replacement

Locate the selected `EncounterDefinition` in `data/exploration_site.ron`. Replace the
nominated `ActionDefinition` in place. Preserve the encounter's position, card UUID,
prose, and other action source exactly. Author the new action with its pre-minted
UUID, label, presentation, and typed effect.

For `reuse` mechanics, trace the effect end to end and use it only when its complete
semantics match the assigned template. For `vertical_slice` mechanics, implement:

1. typed source model and compatibility lowering;
2. generated-data validation and editor support;
3. deterministic offer, target, or random-result preparation;
4. intent-event validation and replayable state transitions;
5. persisted identifiers and numeric outcomes;
6. Cumulus follow-up and outcome presentation, including reduced motion;
7. reconstruction-grade journey logging; and
8. deterministic synthetic tests for source, generation, runtime, replay, UI state,
   and logging.

Update the machine catalog from `vertical_slice` to `reuse` only after the complete
implementation exists. Regenerate its Markdown reference. Compile game data after
RON or model changes:

```bash
npm run game-data:compile
```

After compilation, apply the validated action replacements to the assignment ledger
and revalidate complete live coverage:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/template_assignments.py \
  --apply-workset "$RUN_DIR/redesign-workset.json"
```

## 6. Verify preservation and distribution

The live verifier must prove for each replacement:

- the selected encounter still appears exactly once;
- its prose equals the pre-redesign prose;
- the untouched action is structurally identical and keeps its UUID;
- the old nominated action UUID is absent globally;
- the new action UUID appears exactly once with designed presentation and behavior;
- the encounter still has exactly two actions; and
- recipient count increased by one while donor count decreased by one.

Run:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/verify_redesigns.py \
  --workset "$RUN_DIR/redesign-workset.json"
```

Run focused tests while iterating, then `npm run review`. Run browser QA whenever
runtime behavior or presentation changes, exercising the normal player workflow,
follow-up state, outcome state, replay, and `window.__caps` error buffer.

## 7. Stage and hand off

Stage only production, tests, skill documentation, and generated files in the
worktree. Exclude scratch artifacts and images. Inspect the staged diff and ask for
approval through the `wt` workflow. Commit and promotion happen only after approval.

## Explicit expansion mode

Add a new encounter only when the user requests expansion or the selected card has
no live encounter. Even in expansion mode, assign both template IDs before design
and require exact use of those IDs. Randomly choosing from already implemented
templates is not a valid expansion workflow for template-distribution work.

## Repair failures proactively

Treat every validation, compilation, test, replay, browser, or review failure as a
repair-loop input. Fix in-scope causes and rerun the failed gate plus downstream
gates. If an assigned template exposes missing runtime support, implement that
support. Change the assignment only when the template cannot produce a coherent,
balanced action for any candidate after replacing the candidate set; record that
decision and return the template to the front of the target queue.

Stop only after in-scope repair and candidate replacement are exhausted and a
replayable, reconstructable implementation remains impossible.

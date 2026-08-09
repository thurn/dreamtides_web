---
name: design-and-implement-exploration-encounters
description: Design a random or UUID-selected batch of Dreamtides Exploration encounters and ship the winning designs into canonical data/exploration.ron as complete replayable behavior. Use when expanding the live Exploration catalog, designing and implementing encounter batches in one pass, porting card-art encounters to production, or adding the typed effects, reward selection, Cumulus choices, persisted outcomes, animations, logs, tests, and browser QA required by new Exploration mechanics.
---

# Design and implement Exploration encounters

Run one pipeline from card selection through staged production implementation. Each
selected card gets one encounter with two actions. The live catalog accepts one to
four actions per encounter; two is the design policy for encounters created by this
skill.

## Required references

Read these files completely before starting:

- `references/design-contract.md`
- `references/implementation-guide.md`
- `references/mechanic-ideas.md`

The machine-readable mechanic library is
`references/mechanic-ideas.json`. Its integer IDs identify design ideas. They are
not runtime identifiers and do not belong in `ActionDefinition.id`.
Validate the catalog and its rendered reference with:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/mechanic_ideas.py
```

## 1. Establish the worktree

Follow repository instructions and use the `wt` skill unless the user explicitly
requests work on master. Run dependency installation and asset regeneration in the
fresh worktree before selecting a batch. Keep all implementation and follow-up work
in that worktree.

Create a unique empty scratch directory under `/tmp`, for example:

```bash
RUN_DIR="$(mktemp -d /tmp/exploration-encounters.XXXXXX)"
```

Scratch requests, results, worksets, and displays stay outside version control.

## 2. Select the batch

Run:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/select_batch.py \
  --run-dir "$RUN_DIR" \
  --batch-size 5 \
  --seed 12345
```

For explicit cards, repeat `--card-id <canonical-card-uuid>`. Card names are
display-only; all selection and identity use UUIDs.

The selector:

- excludes card UUIDs already present in generated `data/exploration.toml`;
- resolves and hashes each full-size artwork;
- hashes canonical RON, generated compatibility data, the mechanic library, the
  Rust Exploration model, and the editor effect schema;
- pre-mints two lowercase RFC 4122 UUIDv4 action IDs for each request; and
- writes one request per card plus a manifest.

Treat request paths and UUIDs as immutable run inputs.

## 3. Design one winner per card

Use one independent designer subagent per request when parallel agent work is
available. Give each designer only its request path, result path, and the design
contract. The designer must inspect the full-size artwork, read the complete
mechanic library, evaluate five distinct two-mechanic pairings, and write only the
winning result JSON.

Each result must preserve the two pre-minted action UUIDs in request order. Every
action chooses a mechanic idea, owns its label and presentation, and declares the
typed RON effect variant, exact source field names, and runtime compatibility kind.
For a `reuse` idea these values must match the mechanic catalog. A
`vertical_slice` idea may propose a new or extended variant and requires the full
implementation described below.

## 4. Assemble the validated workset

After every result exists, run:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/assemble_designs.py \
  --manifest "$RUN_DIR/manifest.json" \
  --results-dir "$RUN_DIR/results" \
  --workset-output "$RUN_DIR/encounter-workset.json" \
  --display-output "$RUN_DIR/display.md"
```

Assembly is atomic. It rejects stale source hashes, missing or extra results,
changed action UUIDs, invalid mechanic references, mismatched current effect
variants or fields, bad canonical content references, and prose/copy violations.

Show `display.md` to the user as an intermediate design checkpoint, then continue
directly to implementation unless the user asks to pause.

## 5. Implement canonical behavior

Use the workset as a scratch contract. Add each encounter to the flat list in
`data/exploration.ron` with `EncounterDefinition`, `ActionDefinition`,
`ActionPresentation`, and typed `ActionEffect` values. Preserve card UUIDs, action
UUIDs, prose, labels, effect text, and follow-up presentation exactly.

For `reuse` mechanics, author the declared current effect variant with the declared
fields. For `vertical_slice` mechanics, implement the complete slice:

1. typed source model and compatibility lowering;
2. generated-data validation and editor schema/bridge support;
3. reward offer or selection preparation with stable content signatures;
4. intent-event validation and replayable state transitions;
5. persisted offered and selected identifiers or other outcome data;
6. Cumulus follow-up and outcome presentation, including reduced motion behavior;
7. reconstruction-grade journey logging; and
8. deterministic synthetic tests for source, generation, runtime, replay, UI state,
   and logging.

Reuse a runtime kind only when its full semantics match. A shared chooser must flow
through canonical reward mechanic IDs and compatible selection policy IDs.

Run the game-data compiler after RON or model changes:

```bash
npm run game-data:compile
```

Generated `data/exploration.toml` is a compatibility output and verification input.

## 6. Verify the implementation

Run:

```bash
python3 .llms/skills/design-and-implement-exploration-encounters/scripts/verify_live.py \
  --workset "$RUN_DIR/encounter-workset.json"
```

The verifier checks the full generated catalog for one-to-four-action cardinality
and globally unique UUIDv4 action IDs. For the workset, it requires the designed two
actions and compares UUIDs, prose, labels, presentation, runtime kinds, and lowered
fields for reused mechanics.

Run focused tests while iterating, then `npm run review`. Run browser QA for runtime
or presentation changes using the repository's isolated-session workflow. Exercise
the normal player path, inspect `window.__caps`, and check both ordinary and
follow-up/outcome states. Add targeted screenshots only when presentation changed.

## 7. Stage and hand off

Stage only the completed production, test, documentation, and generated files in
the worktree. Exclude scratch artifacts and images. Inspect the staged diff and ask
for approval to promote through the `wt` workflow. Commit and promotion happen only
after that approval.

## Stop conditions

Stop and report the blocker when:

- a requested UUID is absent from canonical card data or is already represented;
- full-size art is missing or ambiguous;
- the source manifest changes during design;
- a designer cannot produce schema-valid output after one repair attempt;
- canonical compilation fails;
- the live verifier fails;
- deterministic tests, browser QA, or diff-aware review fail; or
- a vertical slice cannot be made replayable and reconstructable within scope.

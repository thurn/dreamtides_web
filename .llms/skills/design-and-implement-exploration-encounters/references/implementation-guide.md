# Exploration implementation guide

## Preservation boundary for redesign batches

A redesign workset replaces one nominated `ActionDefinition` inside one existing
encounter. Preserve the encounter's card UUID, prose, list position, and untouched
action exactly. Preserve the untouched action UUID. Give the replacement action its
pre-minted UUIDv4 because the choice has new semantics.

Generated verification must compare the untouched action structurally, prove the
old action UUID is absent globally, and prove the new UUID appears exactly once.
Unselected candidate encounters are outside the implementation diff.

## Canonical data and generation

Exploration authoring lives in `data/exploration_site.ron`. Its root is a flat RON list
of `EncounterDefinition` values. Each encounter has a card UUID, prose, and one to
four `ActionDefinition` values. Each action has:

- a lowercase RFC 4122 UUIDv4 `id`;
- a label;
- `ActionPresentation(effect_text, followup)`; and
- one typed `ActionEffect` variant.

The authoritative model and compatibility lowerer are in
`tools/game-data/src/models/exploration.rs`. `npm run game-data:compile` validates
the source and emits `data/exploration_site.toml`. Runtime code consumes that generated
compatibility view.

Keep these contracts synchronized when a typed effect changes:

- `tools/game-data/src/models/exploration.rs`
- `scripts/exploration-effect-editor-schema.mjs`
- `scripts/exploration-editor-data.mjs`
- `scripts/exploration-editor-api.mjs`
- `scripts/exploration-effect-kinds.mjs`
- `scripts/setup-assets.mjs`
- `src/data/exploration.ts`

Use canonical UUIDs for card and Dreamsign references. Resolve names only at the
display edge.

## Reusing an effect

Trace the declared typed variant through Rust lowering, generated TOML validation,
asset generation, runtime preparation, intent validation, state transition,
outcome rendering, and logging. Reuse it when each part matches the designed
semantics, including eligibility, quantity, offer construction, target selection,
persisted values, and follow-up behavior.

The mechanic idea catalog records a current variant and runtime kind for every
`reuse` idea. Treat this mapping as a checked starting point; the live code remains
the semantic source of truth.

## Implementing a vertical slice

### Typed source and compatibility data

Add or extend the `ActionEffect` variant and its lowering in
`tools/game-data/src/models/exploration.rs`. Add a runtime kind and editor schema
entry where required. The compiler must reject malformed source and produce all
compatibility fields needed by runtime code.

Add synthetic Rust and JavaScript tests for parsing, lowering, schema validation,
and generated output. Keep optional RON fields explicit enough that source intent is
clear.

### Reward preparation and selection

Shared reward selection is keyed by canonical mechanic ID and selection policy ID.
The Rust lowerer derives these metadata fields for current Exploration effects.
Compatibility and tuning contracts live in:

- `scripts/reward-selection-contracts.mjs`
- `scripts/reward-selection-data.mjs`
- `src/reward-selection/context.ts`
- `src/reward-selection/selectReward.ts`
- `src/reward-selection/rng.ts`
- `src/reward-selection/stable.ts`
- `src/reward-selection/types.ts`

Exploration-specific offer preparation lives in
`src/coop/providers/exploration-provider.ts`. Build eligible inputs from canonical
UUID-keyed content, select through the compatible policy, and persist the exact
offer, selection context, content revision/signature, and chosen result required to
replay the action. Randomness must come from the deterministic stream and be
observable in tests and logs.

### Event-log state transitions

Coop state is a fold of intent events. Route player intent through
`src/coop/actions.ts`; shared flow may not depend on component-local React state.
Validate the intent against the prepared offer and current state before applying the
transition. Persist canonical identifiers and exact numeric results rather than
recomputing them from mutable catalog data during replay.

Inspect these types and folds for every new semantic branch:

- `src/types/journey.ts`
- `src/coop/providers/exploration-provider.ts`
- `src/coop/providers/site-provider.ts`
- `src/coop/actions.ts`

### Cumulus presentation

Exploration view-model construction is in
`src/screens/cumulus_adapters/exploration-view-model.ts`; logging-specific view data
is in `src/screens/cumulus_adapters/exploration-logging-view-model.ts`; the Cumulus
screen is `src/cumulus/screens/ExplorationSiteScreen.tsx`.

Use authored action presentation from generated content. A selection action opens
the authored follow-up title/subtitle and displays the prepared choices. Outcomes
must disclose the actual persisted result. Provide reduced-motion behavior for new
animation and preserve keyboard, focus, and accessible-name contracts.

### Logging

Journey logging must make the action reconstructable from
`logs/journey-log.jsonl`. Include, as applicable:

- site UUID, encounter card UUID, action UUID, typed/runtime effect identity;
- canonical mechanic and selection policy;
- deterministic stream/seed identity and content revision;
- eligibility inputs and exclusions;
- offered UUIDs and scores/tie breaks;
- selected UUIDs or exact numeric results;
- persisted transition data; and
- terminal outcome.

Use `src/coop/journey-log-sink.ts` and the Exploration logging view-model/adapter as
the integration points. Avoid names as identifiers.

## Testing and QA

Use deterministic synthetic fixtures. Cover:

- RON parsing and compatibility lowering;
- malformed source rejection;
- generated-data parsing;
- offer eligibility and deterministic selection;
- intent validation and state-fold replay;
- exact persisted outcomes;
- view-model follow-up and outcome states;
- reduced-motion behavior where animation changed; and
- logging fields sufficient for reconstruction.

Run focused tests while iterating, compile game data, run the workset verifier, and
finish with `npm run review`.

For runtime or presentation changes, exercise the normal Exploration workflow with
an isolated `agent-browser` session on a non-default Vite port. Assert URL and
viewport before actions, inspect `window.__caps`, verify the resulting DOM state,
and visually inspect the changed action/follow-up/outcome states at representative
desktop and narrow widths when presentation changed.

## Completion gate

Completion requires:

- every requested card UUID appears once in generated Exploration;
- every workset action UUID appears once globally and matches its request UUID;
- workset prose, labels, presentation, runtime kinds, and reused lowered fields
  match generated data;
- canonical compilation and focused tests pass;
- runtime and visual QA pass when applicable;
- `npm run review` passes; and
- the complete intended diff is staged in the worktree for approval.

For a redesign batch, completion additionally requires one exact action replacement
per assignment, preservation of prose and the untouched action, and the declared
recipient/donor template delta of `+1/-1`.

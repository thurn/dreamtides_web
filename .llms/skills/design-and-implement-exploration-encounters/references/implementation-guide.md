# Exploration encounter implementation guide

## Classify effect semantics

Compare each designed action with definitions in
`scripts/exploration-editor-schema.mjs` and reducer branches in
`src/coop/providers/exploration-provider.ts`. Reuse an effect kind only when all
of these match:

- offered-object source and eligibility;
- when randomness is minted and persisted;
- UUID-only player intent and validation;
- exact state transition and failure conditions;
- persisted resolution facts;
- semantic outcome and animation;
- reconstructable logging.

Different numeric values, predicates, canonical UUIDs, Dreamsign UUIDs, or
subtypes usually belong in authored fields. A different transition, selection
contract, persisted result, or outcome is a new or extended kind. Never infer
runtime behavior from prose, labels, `effect-text`, `template-id`, or display
names.

## Implement the full vertical slice

Search for one semantically similar effect and follow its complete path.

| Layer | Primary files | Contract |
| --- | --- | --- |
| Authoring/editor | `scripts/exploration-editor-schema.mjs`, `scripts/exploration-editor-data.mjs` | Kind, compatible templates, fields, defaults, controls, normalization, and TOML serialization. |
| Asset compiler | `scripts/setup-assets.mjs` | Validate required fields and ranges before emitting runtime JSON. |
| Runtime content | `src/data/exploration.ts` | Typed effect union and UUID-backed action data. |
| Persisted state | `src/types/journey.ts` | Minted offers and exact replay/presentation results. |
| Shared behavior | `src/coop/providers/exploration-provider.ts` | Deterministic preparation, availability, UUID intent validation, atomic transition, and resolution. |
| Intent API | `src/coop/actions.ts` | Intent events only; no client-authored outcome. |
| View model | `src/screens/cumulus_adapters/exploration-view-model.ts` | Follow-up choice and non-null semantic outcome from persisted data. |
| Cumulus screen | `src/cumulus/screens/ExplorationSiteScreen.tsx` | Accessible choice, dedicated outcome animation, reduced motion, and local exit sequencing. |
| Logging adapter | `src/screens/cumulus_adapters/ExplorationSiteScreenAdapter.tsx` | Authored input, minted data, intent, transition, result, and presented outcome. |

Update exhaustive tests, QA fixtures, editor fixtures, and any helper that
intentionally enumerates kinds. Catalog validation must use structural
invariants such as non-empty data, unique UUIDs, two actions, known kinds, and
valid fields—not a mutable production encounter count.

## Persist deterministic shared behavior

Exploration state is a fold of the room event log.

1. Mint every random offer during site-runtime construction with the supplied
   deterministic RNG.
2. Persist offered card UUIDs, Dreamsign UUIDs, pack contents, replacement
   maps, transfiguration maps, and new rolls in the site runtime.
3. Send only intent through `src/coop/actions.ts`: action UUID plus a UUID-only
   selection payload.
4. Revalidate selection against the persisted offer and current journey state.
5. Apply the transition atomically through stable helpers when semantics match.
6. Persist a resolution containing the exact result. Include deck-entry UUIDs
   whenever copies of one card UUID can differ.
7. Derive both clients from the folded event log. Component state may sequence
   animation phases only after persisted resolution exists.

Persist and present every component of compound effects, including all affected
entry UUIDs, before/after semantics, resource deltas, gained objects, purged
objects, and rolled choices.

## Build the Cumulus interaction

Invoke `$cumulus` before UI edits.

- Extend `ExplorationFollowupView` for a new selection shape.
- Build choice data from persisted offers and UUID-backed current state.
- Reuse existing Cumulus selection panels only when their interaction contract
  matches; otherwise create a focused component with tokens and primitives.
- Expose stable semantic `data-*` attributes for outcome kind, phase, affected
  UUIDs, and numeric deltas.
- Keep controls keyboard accessible, visibly focused, readable at narrow
  widths, and clear of safe-area insets.
- Resolve names only from canonical display objects at the component boundary.

## Meet the outcome-animation contract

Every successful action needs a named semantic animation branch that presents
the exact persisted result. It must:

- begin only after the matching resolved action and resolution exist;
- use exact gained, purged, replaced, selected, or affected UUIDs;
- show resource deltas numerically and mutations on affected objects;
- sequence every part of a compound outcome legibly;
- expose an accessible status describing the same result;
- present the complete static result under reduced motion with zero-duration or
  simplified choreography;
- complete deterministically before Continue or encounter exit.

A picker is input, not an outcome. A generic fade, success message, or card
close without the exact object/value change is insufficient. A reused effect
path must meet this same contract; fix any in-scope deficiency while adding the
encounter.

## Log reconstructable behavior

Log enough to reconstruct production behavior without current catalog copy or
fresh randomness:

- site UUID, source-card UUID, action UUID, and effect kind;
- authored parameters and predicates;
- every minted offer or roll in stable order;
- UUID-only player selection;
- affected deck-entry, card, and Dreamsign UUIDs;
- before/after semantic values and resource deltas;
- every gained or purged UUID in a compound result;
- semantic outcome kind shown by the adapter.

Keep bulky display snapshots out of logs. Stable IDs and mechanic values should
identify the result exactly.

## Test stable contracts

Use synthetic fixtures and deterministic RNG. Cover:

1. editor/schema compatibility and save round-trip;
2. asset compilation success and precise invalid-field failures;
3. exact deterministic offer construction and persistence;
4. valid provider resolution plus atomic rejection of stale, foreign,
   duplicate, or ineligible selection;
5. identical replay from the same event log;
6. reconstructable logging;
7. non-null semantic view-model outcomes with exact UUIDs and deltas;
8. screen outcome stages, semantic attributes, reduced motion, and deterministic
   completion;
9. live data integration with two runtime-complete actions.

Do not assert card names as identity, production catalog counts, mutable copy or
selection, statistical/timing thresholds, or private helper call order.

## Run browser QA

Use `http://localhost:<non-default-port>/?goto=exploration&card=<card-uuid>`.
For every new action:

1. Assert URL, viewport width, source-card UUID, and action UUID.
2. Complete normal picker or automatic-selection flow.
3. Assert folded journey state and exact persisted resolution.
4. Assert semantic outcome root, phase, affected UUIDs, and displayed delta.
5. Complete the outcome and exit normally.
6. Check clipping, overlap, safe areas, controls, and responsive geometry.
7. Require empty `window.__caps.errors`, `.rejections`, and `.consoleErrors`.

Capture only screenshots that prove distinct visual risks and keep them out of
version control.

## Completion checklist

- Every requested UUID appears once in live `exploration.toml`.
- Every encounter has two globally unique action IDs.
- Runtime fields implement canonical template semantics.
- New kinds are complete across editor, compiler, types, persisted runtime,
  provider, adapter, screen, and logs.
- Every action has a dedicated accessible outcome sourced from persisted data.
- Reduced motion presents the same exact result.
- Logs reconstruct offers, intent, transition, result, and outcome.
- Synthetic focused tests, live-workset verification, generated assets, browser
  QA, and `npm run review` pass.

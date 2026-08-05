# Exploration Encounter Implementation Guide

## Contents

- [Decide whether an effect kind exists](#decide-whether-an-effect-kind-exists)
- [Implement an effect kind vertically](#implement-an-effect-kind-vertically)
- [Persist deterministic shared behavior](#persist-deterministic-shared-behavior)
- [Build the Cumulus interaction](#build-the-cumulus-interaction)
- [Meet the outcome-animation contract](#meet-the-outcome-animation-contract)
- [Log reconstructable behavior](#log-reconstructable-behavior)
- [Test the stable contracts](#test-the-stable-contracts)
- [Run browser QA](#run-browser-qa)
- [Completion checklist](#completion-checklist)

## Decide whether an effect kind exists

Start from semantics, not wording. Compare the candidate action with the
definitions in `scripts/exploration-editor-schema.mjs` and the reducer branches
in `src/coop/providers/exploration-provider.ts`.

Reuse a kind only when all of these match:

- the source and eligibility of any offered objects;
- when randomness is minted and persisted;
- the player selection payload;
- the exact state transition and failure conditions;
- the persisted resolution fields;
- the outcome objects or deltas presented to the player;
- the logging needed to reconstruct the result.

Different numbers, predicates, card UUIDs, Dreamsign UUIDs, or subtypes usually
belong in fields on an existing kind. A different state transition belongs in a
new kind. Never infer behavior from `label`, `effect-text`, `template-id`, or
display names at runtime.

## Implement an effect kind vertically

Touch each layer that owns part of the contract. Search for one similar effect
kind and follow its complete path rather than copying a single switch branch.

| Layer | Primary files | Required contract |
| --- | --- | --- |
| Authoring/editor | `scripts/exploration-editor-schema.mjs`, `scripts/exploration-editor-data.mjs` | Define the kind, compatible template IDs, editable fields, defaults, controls, normalization, and TOML serialization. |
| Asset compiler | `scripts/setup-assets.mjs` | Accept the kind and validate every required field and range before emitting runtime JSON. |
| Runtime content | `src/data/exploration.ts` | Extend the effect-kind union and typed action fields; keep card identity UUID-backed. |
| Persisted site state | `src/types/journey.ts` | Store minted offers and the exact resolution facts required for replay and presentation. |
| Shared behavior | `src/coop/providers/exploration-provider.ts` | Prepare offers deterministically, compute availability, validate UUID-only selection, apply the state transition, and persist its resolution. |
| Presentation adapter | `src/screens/cumulus_adapters/exploration-view-model.ts` | Build action copy/references, follow-up choice data, and a non-null semantic outcome from persisted state. |
| Cumulus screen | `src/cumulus/screens/ExplorationSiteScreen.tsx` | Render the choice, animate the resolved outcome, support reduced motion, and gate local exit timing. |
| Logging adapter | `src/screens/cumulus_adapters/ExplorationSiteScreenAdapter.tsx` | Record enough authored input, minted data, selection, and result data to reconstruct the run. |

Also search the repository for the closest effect kind. Update exhaustive tests,
QA fixtures, editor fixtures, and any special predicate/transfiguration helper
that intentionally enumerates kinds.

Catalog loading currently contains exact encounter-count checks in
`scripts/setup-assets.mjs` and `src/data/exploration.ts`. Make acceptance depend
on structural invariants such as a non-empty catalog, unique UUIDs, two actions,
known kinds, and valid fields. Keep synthetic tests independent of the mutable
production catalog size.

## Persist deterministic shared behavior

Exploration state is shared game state. Follow these rules:

1. Mint every random offer during site-runtime construction using the supplied
   deterministic RNG.
2. Persist offered card UUIDs, Dreamsign UUIDs, pack contents, replacement maps,
   transfiguration maps, or any new roll in `ExplorationActionOfferRuntime`.
3. Send only intent through `src/coop/actions.ts`: action UUID plus a UUID-only
   selection payload.
4. Revalidate the selection against the persisted offer and current journey
   state in the provider.
5. Apply the change through stable reward/state helpers where their semantics
   fit. Reject the resolution atomically when any child effect is invalid.
6. Persist an `ExplorationResolution` containing the exact result. Include
   deck-entry UUIDs when multiple copies of one card UUID can differ.
7. Derive both clients' UI from the folded event log. Use component state only
   for animation phases after the persisted resolution exists.

For a compound effect, persist and present every component. For example, a cost
change plus Nightmares needs affected entry UUIDs, the cost delta, gained Bane
objects, and a composed outcome sequence.

## Build the Cumulus interaction

Invoke `$cumulus` and follow its component, token, material, and responsive
guidance before UI edits.

- Extend `ExplorationFollowupView` when a new selection shape is needed.
- Build follow-up content in the adapter from persisted offers and current
  UUID-backed state.
- Use existing Cumulus selection panels and object views when their interaction
  contract fits; create a focused component when the contract is new.
- Expose stable semantic `data-*` attributes for the outcome kind, affected
  UUIDs, phase, and quantitative delta.
- Keep controls keyboard accessible, visibly focused, fully readable, and clear
  at narrow widths and safe-area insets.
- Resolve card and Dreamsign names only from canonical display objects at the
  component boundary.

## Meet the outcome-animation contract

Every successful action requires a dedicated animation that communicates its
persisted result. Dedicated means the animation has a named semantic branch and
visually represents the objects or values that changed. It may compose shared
Cumulus primitives, card flights, radial announcements, or selection rings.

An acceptable outcome animation:

- begins only after `resolvedActionId` and the corresponding resolution are
  present;
- uses the exact gained, purged, replaced, or affected UUIDs from the
  resolution;
- shows resource deltas numerically and card/Dreamsign mutations on the affected
  objects;
- shows all parts of a compound outcome in a readable sequence;
- exposes an accessible status/announcement describing the same result;
- presents a complete static result under reduced motion, with timing reduced
  to zero or simplified motion;
- has a deterministic completion path that makes Continue available or returns
  the encounter card after the result is legible.

The follow-up picker is input, not an outcome. A generic fade, closing the
encounter, or a success message without the actual object/value change does not
meet the contract. Do not let a newly resolved kind reach the adapter's
`reward: null` path unless the screen has another explicit semantic outcome
variant for it.

Apply this contract to every existing effect path reused by a new encounter.
Pre-existing issues are not an excuse: fix any existing path that fails the
contract as part of the encounter implementation. Record only unrelated issues
in `pre-existing-issues.txt`; do not use that file to defer a broken dependency
of the workset.

Model outcome data in `ExplorationRewardView` or a purpose-built successor. Add
a view-model test that proves the new effect produces the expected semantic
variant, UUIDs, and deltas. Add a screen test that proves the corresponding
animation stage mounts and reaches its completion state.

## Log reconstructable behavior

The existing Exploration adapter logs site entry, requested choice, resolved
choice, and completion. Extend those records so the new behavior can be
reconstructed without relying on current catalog copy or fresh randomness.

Include, as applicable:

- site UUID, source-card UUID, action UUID, and `effectKind`;
- authored numeric parameters and predicates that determine mechanics;
- every minted offer/roll in stable order;
- the player's UUID-only selection;
- affected deck-entry UUIDs and card/Dreamsign UUIDs;
- before/after semantic values and resource deltas;
- every gained or purged UUID in a compound result;
- the semantic animation/outcome kind presented by the adapter.

Keep sensitive or bulky display snapshots out of logs. IDs and mechanic values
are enough when they identify the persisted result exactly.

## Test the stable contracts

Use synthetic fixtures and deterministic RNG. Cover the following layers in
focused tests:

1. Editor/schema: the kind exposes compatible template IDs and required fields,
   and a save round-trip preserves them.
2. Asset compiler: valid TOML compiles; missing, invalid, or out-of-range fields
   fail with a precise message.
3. Offer construction: fixed RNG produces exact UUID offers and records them in
   the site runtime.
4. Provider resolution: valid UUID intent produces exact state and resolution;
   stale, foreign, duplicate, or ineligible selection is rejected atomically.
5. Replay: the same event log folds to the same result for both clients.
6. Logging: emitted records include the inputs, minted data, selection, and
   result needed to explain the action.
7. View model: a resolved effect produces a non-null semantic outcome containing
   exact UUIDs and quantitative deltas.
8. Screen: the semantic outcome stage mounts, uses the expected phase/data
   attributes, respects reduced motion, and exposes Continue only after the
   presentation contract completes.
9. Data integration: the workset verifier passes and generated assets contain
   the encounter with exactly two runtime actions.

Do not assert card names as identity, production catalog counts, statistical or
timing thresholds, mutable production selections, or private helper call order.

## Run browser QA

Use the normal Exploration route documented by the QA scene registry:

```text
http://localhost:<non-default-port>/?goto=exploration&card=<card-uuid>
```

For every action in every added encounter:

1. Assert the URL, viewport width, source-card UUID, and action UUID before
   acting.
2. Complete the action through its normal picker or automatic-selection flow.
3. Assert the folded journey state and persisted `ExplorationResolution`.
4. Assert the semantic outcome root, phase, affected UUID attributes, and
   displayed delta.
5. Wait for the outcome's intended completion signal and exit normally.
6. Inspect responsive geometry for clipping, overlap, safe-area clearance, and
   usable controls.
7. Inspect `window.__caps.errors`, `.rejections`, and `.consoleErrors`; a missing
   buffer is a failed QA setup.

Capture the smallest screenshot set that proves the distinct visual risks:
usually one desktop outcome, one narrow/mobile outcome, and one interaction or
compound-outcome state. Inspect the images before handoff and keep them out of
version control.

## Completion checklist

- [ ] Every requested UUID appears once in live `exploration.toml`.
- [ ] Every encounter has exactly two globally unique action IDs.
- [ ] Runtime fields implement the canonical template semantics.
- [ ] New effect kinds are supported in editor, compiler, content types,
      persisted runtime, provider, adapter, and screen.
- [ ] Every successful action presents a dedicated, accessible outcome
      animation sourced from persisted resolution data.
- [ ] Every reused existing effect path satisfies the same contracts; any
      pre-existing failure in scope is fixed in this worktree.
- [ ] Reduced motion presents the same exact result.
- [ ] Logs reconstruct offers, selection, state changes, and presented outcome.
- [ ] Synthetic focused tests and the workset verifier pass.
- [ ] Generated assets are current and `npm run review` passes.
- [ ] Normal-player browser QA passes for every new action at relevant widths.
- [ ] The detailed commit is pushed and ready for the `$wt` promotion handoff.

---
name: implement-canonical-ron
description: Activate a reviewed production-intended `_canonical.ron` candidate by reusing its existing dataset-specific Rust source model, compatibility-TOML lowerer, and synthetic tests, then registering the adapter, replacing the production RON source, regenerating outputs, proving parity, and invoking `build-ron-editor` before cutover whenever an existing UI, API, or save path can edit the dataset. Use when asked to implement, integrate, ship, promote, cut over, or replace a compatibility-shaped production RON file with a canonical modeled candidate such as `data/affiliations_canonical.ron`.
---

# Activate Canonical RON

Treat this as activation of already-tested design artifacts, not a second
implementation pass. Preserve runtime data, record order, stable IDs,
references, generated artifacts, and consumer behavior while switching authored
ownership to the modeled RON source.

## Required handoff

Expect `convert-toml-to-ron` to have produced all of the following:

- `data/<stem>_canonical.ron`;
- `tools/game-data/src/models/<dataset>.rs` with strict source types and the
  compatibility lowerer;
- an export from `tools/game-data/src/models/mod.rs`; and
- passing synthetic model/adapter tests; and
- an ignored real-data parity probe containing the approved old-to-new UUID map
  when legacy identifiers were migrated.

If these durable Rust artifacts are absent, use `convert-toml-to-ron` to create
them in the repository. Do not reconstruct them in a disposable crate and then
write them again here.

## 1. Audit, do not rewrite

Inspect the candidate, durable model/lowerer, current production RON, generated
TOML, manifest entry, compiler registries, consumers, dependencies, refresh
operation, identity strategy, and editor capability. Independently search for
the dataset ID, RON/TOML filenames, and generated artifact names across editor
routes, UI components, API handlers, staging transactions, hot-reload code, and
tests. Do not infer that a dataset has no editor solely from a `read_only`
manifest entry.

Confirm that the durable code still:

- deserializes the complete candidate with strict records and typed variants;
- preserves canonical concepts such as catalog-level defaults, grouped data,
  and renamed fields;
- expands hoisted values into the exact established TOML fields;
- preserves order, scalar types, sentinels, IDs, and references; and
- rejects duplicate identities, non-UUIDv4 canonical IDs, incomplete UUID
  mappings, and invalid combinations.

Make only review-driven corrections to these existing artifacts. Do not replace
them with a fresh implementation merely because the activation agent would have
modeled them differently.

Materialize a clean current compatibility output before cutover. Save parsed
TOML and affected derived artifacts outside the committed tree, or use a
historical parity base that actually contains the compatibility outputs.
Compare parsed semantics rather than generated headers because source and
adapter fingerprints change.

## 2. Complete editor support when required

Classify the dataset from the traced save path:

- If no writable editor UI, API, semantic operation, or save route exists,
  record that evidence and proceed directly to activation.
- If any existing UI/API flow can edit the dataset, its generated TOML, or a
  companion catalog in the same save transaction,
  invoke `$build-ron-editor` and follow that skill completely as part of the
  activation, even when the manifest currently says `read_only` or the editor
  is generic.
- If an editor surface exists but its write capability is ambiguous, trace a
  representative field from the control to publication before deciding. Treat
  a reachable save path as editor-backed.

Trace every source catalog mutated by each editor operation. A cross-catalog
save expands the editor-migration scope to all sources in that transaction;
do not migrate only the named activation candidate.

When invoked, `$build-ron-editor` owns the editor migration. Reuse the durable
source model for the activation candidate and the appropriate typed model for
every companion source. Implement typed semantic operations against canonical
RON. Require stable-ID routing, operation-sized source patches, preservation of
unrelated comments/literals/order, formatter-clean typed equivalence, source
revisions, atomic multi-source publication/rollback, generated-artifact
validation, and the normal browser save and recovery workflow.

Begin the editor migration before the source-replacement phase. The editor and
activation may become coherent together in one working tree, but do not accept
or commit the activation until a normal UI save reaches every production-intended
canonical RON source and the `$build-ron-editor` completion standard passes.
The editor must not patch generated TOML or adopt a whole compatibility
document as an ordinary save.

## 3. Register the existing adapter

Wire the reviewed module through every production registry:

1. Add a dataset-specific branch in `tools/game-data/src/compiler.rs` that
   parses the existing root type and calls its existing lowerer.
2. Add the adapter ID to manifest validation and every other exhaustive adapter
   registry or test fixture.
3. Update the dataset manifest entry from `compat_document_v1` / `compat_v1` to
   explicit dataset-specific schema and adapter IDs.
4. Preserve the dataset ID, `data/<stem>.ron` source path, generated
   `data/<stem>.toml` output path, dependencies, refresh operation, identity,
   editor capability, and RON migration state.
5. Establish adapter version 1 for the new typed adapter unless the repository
   convention or a compatibility-output change requires another version.

Search for adapter and dataset string registries instead of assuming the
compiler match and manifest validator are the only registration points.

## 4. Cut over atomically

Make one coherent activation change that:

1. replaces `data/<stem>.ron` with the reviewed candidate content;
2. removes `data/<stem>_canonical.ron`;
3. activates the existing typed schema and lowerer;
4. applies the approved old-to-new UUID mapping to every dependent source and
   reference when identifiers changed;
5. compiles the established generated TOML path; and
6. regenerates every affected runtime artifact.

Leave exactly one canonical RON source. Do not point the manifest at the
suffixed review candidate, keep dual production sources, or hand-edit generated
TOML/JSON to force parity.

## 5. Prove the production boundary

Compare the new parsed TOML recursively with the saved compatibility oracle,
including array order and scalar types. When identifiers changed, normalize the
comparison through the reviewed old-to-new UUID map and require every differing
ID/reference to be explained by it. This proves output semantics, not
structural similarity between the two source models. Compare unaffected runtime
artifacts byte for byte; compare affected artifacts through the same UUID map
and trace every other difference to a source field and lowerer branch.

If the canonical design omits duplicated values or hoists defaults, require the
existing lowerer to recreate the exact compatibility values from the canonical
source. Return to design only when that durable mapping is genuinely wrong;
otherwise preserve the reviewed model.

Add activation-specific tests only for new registration, generation, editor,
or integration behavior. Do not duplicate the source-model and lowering tests
already delivered with the candidate.

Remove the ignored production-data parity probe only after final parity and
reference validation pass. Its source model, lowerer, and synthetic tests stay.

## 6. Verify and finish

Run focused checks while iterating, then at minimum:

1. format Rust and RON with repository tooling;
2. run the existing model/adapter tests;
3. compile and check the selected dataset through the normal game-data
   pipeline;
4. run semantic parity against the saved pre-cutover oracle or a valid tracked
   historical baseline;
5. run affected TypeScript validators and generated-artifact tests;
6. run `scripts/regenerate-assets.sh` and include its tracked output;
7. run `npm run review`; and
8. confirm one production RON source, no suffixed candidate, and the expected
   generated-file tracking state.

For read-only migrations, browser screenshots are unnecessary. For
editor-backed migrations, exercise a normal save, validation failure, stale
revision, and recovery; verify canonical RON and generated outputs, preservation
of unrelated comments/literals/values/order, an operation-sized source diff,
formatter-clean RON, and an empty captured error buffer.

Update affected documentation and source comments to state the current RON
authoring and generated TOML compatibility boundaries directly. Use UUIDs or
the dataset's established stable identity, never display names, for migration
logic and tests.

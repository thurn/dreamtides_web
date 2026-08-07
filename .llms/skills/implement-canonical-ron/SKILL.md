---
name: implement-canonical-ron
description: Promote a reviewed suffixed `_canonical.ron` candidate into Dreamtides production as the canonical unsuffixed `.ron` source, with strict dataset-specific Rust types, an explicit RON-to-compatibility-TOML adapter, manifest/compiler registration, parity proof, generated artifacts, tests, and editor integration when applicable. Use when asked to implement, integrate, ship, promote, cut over, or replace a compatibility-shaped production RON file with its canonical modeled RON counterpart, such as replacing `data/affiliations.ron` with `data/affiliations_canonical.ron`.
---

# Implement Canonical RON

Treat this as a production migration between two intentionally different
source models. Preserve runtime data, record order, stable IDs, references,
generated artifacts, and consumer behavior while making the modeled RON
document the authored source. Do not expect or pursue a field-for-field port.

Start from a reviewed candidate produced by `convert-toml-to-ron`. If the
candidate is missing, compatibility-shaped, or lacks a typed semantic parity
proof, use that companion skill first. Keep domain redesign and production
integration as separate review stages.

## Production contract

- Replace `data/<stem>.ron` with the reviewed
  `data/<stem>_canonical.ron` content and remove the suffixed candidate. Leave
  exactly one canonical RON source for the dataset.
- Add dataset-specific Rust source types under `tools/game-data/src/models/`.
  Deserialize the canonical RON into those types through the pinned `ron` and
  Serde crates.
- Preserve canonical modeling decisions such as dataset-level defaults,
  grouped domain concepts, typed variants, and renamed fields. Do not flatten
  the candidate back into per-record compatibility fields merely to resemble
  the production input it replaces.
- Lower the typed source model explicitly into the existing compatibility TOML
  shape. Keep TypeScript, browser, build, editor-read, and asset-generation
  consumers on the generated TOML or existing generated JSON boundary.
- Register a dataset-specific schema and adapter in the compiler and
  `data/game-data-manifest.ron`. Do not use `CompatDocument` for the promoted
  dataset.
- Preserve semantic values and ordering exactly unless the user separately
  authorizes a data correction. Treat an unexplained parity difference as a
  blocker, not an opportunity to normalize production data.
- Keep generated TOML at its established path and preserve its tracked or
  ignored policy. Regenerate downstream artifacts through repository commands.
- For an editor-backed dataset, complete typed mutation, stable-ID routing,
  serialization, revision, rollback, and browser QA before cutover. A read-only
  dataset needs no editor write implementation.

## 1. Establish the migration boundary

Inspect all of the following before editing:

- the canonical candidate, current production RON, and generated TOML;
- the dataset manifest entry and its dependencies, refresh operation, identity,
  and editor capability;
- `tools/game-data/src/compiler.rs`, `manifest.rs`, `models/mod.rs`, and the
  closest existing typed model and adapter;
- every direct consumer of the generated TOML and affected derived JSON;
- validation, hot-reload, regeneration, build, deploy, and editor paths; and
- domain documentation and stable-ID/reference invariants.

Summarize root types, record counts, stable IDs, enum variants, optional and
defaulted fields, order-sensitive collections, sentinels in the compatibility
format, references, and exceptional records. Identify each deliberate
many-to-one or one-to-many mapping between the source models. For example, a
canonical catalog may hoist repeated record values into top-level defaults that
the adapter must expand back onto every compatibility record. Use UUIDs or the
dataset's established stable identifier throughout the migration; never use
display names as identity.

Materialize a clean current compatibility output before changing the adapter.
Keep temporary parsed TOML and derived-artifact oracles outside the committed
tree, or use the repository parity tooling when its configured historical base
contains the compatibility outputs. Verify that the oracle exists before the
cutover; do not assume the current merge base still tracks generated TOML.
Compare parsed semantics rather than generated headers, since source and
adapter fingerprints intentionally change.

## 2. Implement the typed source model

Create `tools/game-data/src/models/<dataset>.rs` and model the candidate as
authored:

- Derive `Deserialize`, `Serialize`, `Debug`, `Clone`, and `PartialEq` where
  useful for parsing, editor round trips, and tests.
- Add `#[serde(deny_unknown_fields)]` to every record so misspelled or stale
  authored fields fail closed.
- Represent closed vocabularies and discriminated behavior as enums. Put
  variant-specific fields inside their variants.
- Preserve authored sequence order with `Vec`. Use `IndexMap` when map order is
  part of the compatibility contract; use unordered maps only when order is
  semantically irrelevant.
- Match `#![enable(implicit_some)]` with `Option<T>` fields. Use Serde defaults
  only for intentional schema defaults, and pair them with
  `skip_serializing_if` when editor serialization should preserve the compact
  authored form.
- Model top-level defaults as first-class catalog fields. Give per-record
  overrides an explicit typed representation only when the canonical design
  supports them; do not duplicate the default into every canonical entry.
- Keep runtime identifiers typed or validated at the model/adapter boundary.
  Validate duplicate IDs and cross-record references before lowering.
- Avoid `ron::Value`, `serde_json::Value`, `toml::Value`, untyped maps, and
  string discriminators in the source model. Dynamic values are acceptable
  only where the domain itself is intentionally dynamic.

Parse the complete real candidate with these types early. A model that only
passes hand-written fixtures is insufficient evidence that production data is
covered.

## 3. Lower into compatibility TOML

Implement `lower(source: RootType) -> anyhow::Result<toml::Value>` or the
repository's current equivalent. Treat this as a named compatibility adapter,
not as the source schema.

Account deliberately for every compatibility field:

- reproduce established TOML key spelling, table/list nesting, scalar types,
  empty-string or empty-list sentinels, and record order;
- expand top-level canonical defaults and other hoisted domain values into the
  repeated compatibility fields expected by existing consumers;
- convert source enums and compound variants exhaustively into their established
  compatibility representations;
- emit compatibility defaults even when the canonical RON omits them;
- reject duplicate identities, missing referenced records, invalid
  combinations, and dataset invariants before serialization; and
- use `toml::Value` only at this output boundary, or use strict serializable
  compatibility structs when they make the mapping clearer.

Do not serialize the canonical source structs directly when their natural
Serde representation differs from the compatibility TOML contract. The
compiler should deserialize typed RON, lower it, and then call the established
TOML serializer.

Add deterministic synthetic unit tests covering:

- every enum/behavior variant and exceptional compound form;
- omitted/defaulted/optional fields and compatibility sentinels;
- exact compatibility keys and order-sensitive collections;
- duplicate IDs, invalid references, and cross-field invariants; and
- Unicode, quoting, multiline text, numeric types, and empty collections when
  the dataset uses them.

Do not make permanent unit tests depend on mutable production copy, counts,
tuning, or default algorithm choices. Use the real catalog only in one-time
parity and repository reference-integrity validation.

## 4. Register the typed adapter

Wire the new module through every compiler registry:

1. Export the module from `tools/game-data/src/models/mod.rs`.
2. Add a dataset-specific adapter branch in `compiler.rs` that parses the
   source root type and calls its lowering function.
3. Add the adapter ID to manifest validation and any other exhaustive adapter
   registry or test fixture.
4. Update the manifest entry from `compat_document_v1` / `compat_v1` to clear
   dataset-specific schema and adapter IDs. Increment the adapter version when
   the compatibility output contract changes; otherwise establish version 1
   for the new adapter according to repository convention.
5. Preserve the dataset ID, canonical `data/<stem>.ron` source path, generated
   `data/<stem>.toml` output path, dependencies, refresh operation, identity,
   editor capability, and RON migration state.

Search for string registries instead of assuming the compiler match and
manifest validator are the only registration points.

## 5. Cut over atomically

Keep the current source available as a temporary parity oracle until the typed
adapter parses and lowers the candidate successfully. Then make one coherent
change that:

1. replaces `data/<stem>.ron` with the candidate content;
2. removes `data/<stem>_canonical.ron`;
3. activates the typed schema and adapter;
4. compiles the established generated TOML path; and
5. regenerates every affected runtime artifact.

Do not commit a state with two canonical sources or a manifest pointing at the
suffixed review candidate. Do not hand-edit generated TOML or JSON to force
parity.

Compare the new parsed TOML to the saved compatibility oracle recursively,
including array order and scalar types. This is output-semantic parity, not
structural parity between the canonical RON and compatibility-shaped source.
Compare affected generated runtime artifacts byte for byte when the repository
contract requires it. Investigate every difference back to a source field and
adapter branch.

If the canonical design intentionally omits duplicated or derived data, prove
that the adapter recreates the exact compatibility values from their declared
source. If it cannot, the candidate does not yet preserve production semantics;
return to the design stage instead of silently dropping the values.

## 6. Verify the production workflow

Run focused checks while iterating, then the repository's diff-aware review.
At minimum:

1. format the Rust and RON changes with repository tooling;
2. run the typed model/adapter Rust tests;
3. compile and check the selected dataset through the normal game-data
   pipeline;
4. run game-data semantic parity against the prior production source, using the
   saved pre-cutover oracle when no tracked historical TOML baseline exists;
5. run the affected TypeScript validators and generated-artifact tests;
6. run `scripts/regenerate-assets.sh` and include its tracked output;
7. run `npm run review`; and
8. inspect `git status` to confirm one production RON source, no suffixed
   candidate, and the expected generated-file tracking state.

For read-only migrations, browser screenshots are unnecessary. For
editor-backed migrations, exercise a normal save, a validation failure, a stale
revision, and recovery through the browser; verify the canonical RON changes,
the generated TOML/JSON refreshes, unrelated typed values and order survive,
and the captured error buffer is empty.

Update affected documentation and source comments to describe RON as authored
data and TOML as the generated compatibility boundary. State the current system
directly and keep UUID/stable-ID terminology accurate.

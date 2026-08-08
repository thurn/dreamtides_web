---
name: convert-toml-to-ron
description: Design an idiomatic canonical Rusty Object Notation candidate from a compatibility-shaped RON catalog or legacy TOML and, by default, implement its reusable dataset-specific Rust source model, compatibility-TOML lowerer, UUIDv4 identity migration, and synthetic tests in the Dreamtides game-data crate without activating the candidate in production. Use when asked to convert, port, experiment with, or redesign a data catalog as typed RON, especially when producing a sibling such as `data/affiliations_canonical.ron`. Use disposable standalone Rust validation only when the user explicitly requests a design-only artifact or no repository compiler exists.
---

# Design Production-Ready Canonical RON

Treat conversion as domain modeling, not punctuation replacement. Preserve
semantic source information while replacing compatibility wrappers, string
discriminators, repeated defaults, and incidental nesting with an intentional
authored model.

Assume the candidate is likely to reach production. Build the reusable Rust
model and compatibility lowerer once during design, then leave activation to
`implement-canonical-ron` after review.

## Choose the workflow

Use the **production-intended workflow by default** in this repository:

- write `data/<stem>_canonical.ron` beside the current source;
- add the durable dataset module under `tools/game-data/src/models/`;
- export that module so its tests compile;
- implement compatibility lowering and synthetic tests there; and
- prove the real candidate with an ignored parity probe that imports the same
  durable code and retains any old-to-new UUID mapping for activation.

Do not change the dataset manifest, compiler adapter dispatch, production
source filename, generated outputs, or runtime/editor ownership. Those are the
reviewed cutover performed by `implement-canonical-ron`.

Use a **design-only workflow** only when the user explicitly wants an isolated
experiment, says no production code should be added, or the repository has no
appropriate Rust compiler. In that mode, validate in a temporary crate and
leave only the candidate. State that a later integration will need to port the
temporary model.

## 1. Understand the source and consumers

Prefer the current `.ron` source when one exists. Use its generated TOML and
runtime projections as parity references.

Inspect representative source sections, direct consumers, compiler/adapter
code, validation, domain documentation, stable-ID references, and the closest
typed dataset module. For a large catalog, parse it mechanically to summarize:

- root shape, record count, stable IDs, and order-sensitive collections;
- key unions, scalar types, optional fields, empty sentinels, and defaults;
- closed vocabularies, discriminator families, and exceptional records;
- duplicate or derived values and their actual source of truth; and
- cross-record and cross-catalog invariants.

Inventory every identifier-bearing field and identifier encoded as a map key.
Classify each one before conversion:

- Use an enum for a small, bounded, internal vocabulary whose members represent
  modes, algorithms, positions, or other concepts that should change alongside
  the Rust model.
- Use UUID identity for an open or growing entity set, cross-catalog records,
  and especially entities whose user-facing names may change independently of
  their identity.

For fields classified as entity identities, validate their UUID version and
report every non-UUIDv4 source identifier before conversion. For fields
classified as enums, inventory every observed value and prove exhaustive
compatibility lowering.

Classify each observed field as a domain concept, compatibility encoding, or
derived value. Do not let `CompatDocument`, a synthetic `data` map, kebab-case
keys, positional comments, or loose TOML tables determine the canonical shape.

## 2. Model the canonical document

Design the Rust source types and RON together around what an author should
edit:

- Use a top-level `Vec<Definition>` for a homogeneous catalog. Use a named
  document record for multiple independent root concepts or dataset-wide
  defaults.
- Give long-list entries named record types. Use anonymous inline records only
  when the field name supplies enough meaning.
- Convert every source `id` field into either a UUIDv4 entity identity or a Rust
  enum for a small closed vocabulary. Retain an explicit UUIDv4 `id` when a
  typed `behavior`, `kind`, or other discriminator describes an entity; the
  discriminator complements entity identity rather than replacing it. Never
  discard a source identifier without an explicit typed migration.
- Turn closed vocabularies and discriminated behavior into enums, with
  variant-specific fields inside each variant.
- Keep scalar concepts scalar and model exceptional compound forms explicitly.
- Hoist repeated values only when they are genuine catalog rules or defaults.
  For example, affiliation selection multipliers belong at the catalog root
  when entries inherit them.
- Preserve lists and ordered maps only when the authored concept or
  compatibility contract is ordered.
- Keep presentation/template text as strings while typing identifiers,
  predicates, modes, and behavior.
- Use enums for small closed internal sets such as algorithm choices, modes, or
  fixed positions. Use a lowercase, hyphenated RFC 4122 version-4 UUID for
  durable entity identities and their foreign keys, nested/action IDs,
  reference-list entries, and keyed identifiers. Model UUIDs as `uuid::Uuid` or
  a domain newtype around it.
- Do not add schema-version fields. The typed model and compiler build define
  the source contract.
- Add concise comments for fields whose semantics, units, invariants, fallback
  behavior, weighting, or compatibility role are not obvious from their names.
  Put each explanation on the first instance of that field in a repeated
  definition list instead of collecting field documentation in a large comment
  above the list.
  Describe the catalog's purpose directly in file-level comments; labels such
  as "authored data" or "authored catalog" add no useful information.
- Separate named long-list definitions with a blank line. Format struct-like
  enum variants across multiple lines with one field per line when the
  repository formatter preserves that layout.

For legacy values classified as entity identity, assign a fresh UUIDv4 to each
slug, name, integer, or other identifier, rewrite every reference consistently,
and preserve an explicit old-to-new map in the parity probe. For values
classified as a closed vocabulary, migrate them to enum variants and preserve
an explicit legacy-value-to-variant map in the parity probe. Never use mutable
display text as canonical identity.

Start the candidate with `#![enable(implicit_some)]`. Write present optional
values without `Some(...)`, and omit absent/defaulted fields when the Serde
model intentionally supports omission. Prefer quoted strings; use raw strings
only when multiline text or escaping becomes clearer.

Generate large candidates mechanically. Fail on unknown or missing input keys,
duplicate IDs, non-UUIDv4 candidate IDs, unsupported variants, invalid or
incompletely migrated references, and violated invariants.

## 3. Write the durable Rust handoff

Create `tools/game-data/src/models/<dataset>.rs` during the production-intended
workflow. This file is the implementation the cutover will activate; do not
recreate it in a temporary crate.

- Derive `Deserialize`, `Serialize`, `Debug`, `Clone`, and `PartialEq` where
  useful.
- Add `#[serde(deny_unknown_fields)]` to every record.
- Use `Vec` and `IndexMap` deliberately to preserve required order.
- Represent intentional schema defaults with Serde defaults and pair them with
  `skip_serializing_if` when editor serialization should retain compact RON.
- Add the Serde-enabled `uuid` crate to `tools/game-data` when the dataset has
  UUID identities and it is not already available. Validate UUID version, RFC
  4122 variant, and lowercase hyphenated formatting at the typed boundary.
- Keep `ron::Value`, `toml::Value`, untyped maps, and string discriminators out
  of the source model unless the domain is genuinely dynamic.
- Validate identities, references, and cross-field invariants before lowering.

Implement `lower(source: RootType) -> anyhow::Result<toml::Value>` or the
repository's current equivalent in the same module. Map every compatibility
field deliberately:

- preserve established TOML key spelling, nesting, scalar types, sentinels,
  and record order;
- expand top-level canonical defaults and other hoisted values into repeated
  compatibility fields;
- exhaustively lower enums and compound variants; and
- emit compatibility defaults even when the canonical source omits them.

Do not serialize canonical structs directly when their natural Serde shape
differs from the compatibility contract.

Export the module from `tools/game-data/src/models/mod.rs` so its unit tests are
compiled, but do not add it to compiler adapter dispatch or the manifest yet.

## 4. Test reusable behavior once

Add permanent deterministic tests beside the durable model for:

- every enum/behavior variant and exceptional compound form;
- optional/defaulted fields and compatibility sentinels;
- exact compatibility keys and order-sensitive collections;
- duplicate IDs, invalid references, UUIDv4 enforcement, and cross-field
  invariants; and
- relevant Unicode, multiline, numeric, and empty-collection cases.

Use distinct synthetic top-level defaults to prove that lowering expands the
correct values instead of hard-coding current production values. Do not make
permanent unit tests depend on mutable production copy, counts, tuning, or
default algorithm choices.

## 5. Prove the real candidate without duplicating code

Add a narrowly scoped `#[ignore]` Rust parity probe inside the existing
game-data crate. Import the durable source model and lowerer; never redefine
them. Keep this probe through candidate review so the activation phase can
reuse its old-to-new UUID map and parity logic, then remove it after successful
cutover.

Run it explicitly against the real current source, candidate, and generated
TOML to prove:

- strict deserialization of the complete candidate;
- semantic equality of current compatibility RON and generated TOML when both
  exist;
- equality between lowered canonical data and compatibility data after applying
  the explicit UUID mapping, including array order and scalar types;
- record counts, unique IDs, references, cardinalities, defaults, and every
  observed exceptional variant;
- parsing of every candidate UUID identity as `uuid::Uuid` with
  `Version::Random`, `Variant::RFC4122`, and lowercase hyphenated formatting;
- exhaustive lowering and mapping coverage for every enum-backed legacy value;
  and
- complete mapping coverage for every legacy identifier and reference.

In explicit design-only mode, create a temporary crate with the pinned `ron`,
Serde, `uuid`, and optional `toml` dependencies, define strict input and
canonical types, and compare both through a shared semantic model. This is the
fallback, not the repository default.

## 6. Leave a reviewable handoff

Run Rust formatting, the model's focused tests, the ignored parity probe, RON
formatting, and the repository's diff-aware review. Leave the
production-intended review with:

- `data/<stem>_canonical.ron`;
- `tools/game-data/src/models/<dataset>.rs` containing the tested source model,
  lowerer, synthetic tests, and ignored parity probe/UUID map;
- its export from `models/mod.rs` and any required crate dependency updates;
  and
- the current production source, manifest, adapter dispatch, and generated
  outputs unchanged.

Report the exact durable artifacts that `implement-canonical-ron` should reuse.
The next phase should activate and cut over this code, not rewrite it.

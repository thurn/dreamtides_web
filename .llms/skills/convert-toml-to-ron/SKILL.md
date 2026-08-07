---
name: convert-toml-to-ron
description: Design an idiomatic canonical Rusty Object Notation (.ron) candidate from a compatibility-shaped or draft RON catalog, or from legacy TOML when no RON input exists. Use when asked to convert, port, experiment with, or redesign a data catalog as real typed RON, especially when producing a sibling such as data/affiliations_canonical.ron from a CompatDocument input.
---

# Design Canonical RON

Treat the conversion as domain modeling. The existing file is evidence about
the data, not a schema to reproduce. Feel free to make assumptions and
idealized layout choices; the user is not asking for a 1:1 port unless they say
otherwise.

Many `.ron` files in this repository are compatibility-shaped migration
artifacts: they wrap JSON- or TOML-shaped data in `CompatDocument`, retain
stringly typed keys and discriminators, and may include generated positional
comments. Treat these files as inputs to this process, not examples of good RON.

## Output contract

- Prefer the existing `.ron` file as the migration input when one exists. Use
  the corresponding TOML and generated projections as parity references, not as
  competing schema authorities.
- Write a separate candidate named `<stem>_canonical.ron` beside the input by
  default. For example, read `data/affiliations.ron` and write
  `data/affiliations_canonical.ron`.
- Do not overwrite the input, change the manifest, replace a loader, or make the
  candidate canonical at runtime unless the user explicitly asks for
  integration.
- Preserve all semantic source information. Do not preserve compatibility
  wrappers, map/list nesting, key spelling, ordering annotations, or other
  representational artifacts merely because they appear in the input.
- Use a lowercase, hyphenated RFC 4122 version-4 UUID for every identifier in
  the candidate. This applies to primary IDs, foreign keys, nested/action IDs,
  reference lists, and identifiers encoded as map keys. Explicitly flag every
  source identifier that is not UUIDv4, assign it a fresh UUIDv4, rewrite every
  reference to it, and retain an old-to-new mapping in the parity validator.
  Do not carry a legacy slug, name, integer, or other non-UUID value forward as
  an ID.

## Workflow

1. Inspect representative input sections, consumer types, compiler or adapter
   code, validation code, and domain documentation. If the catalog is large, do
   not dump it into context. Parse it to summarize record counts, stable IDs,
   key unions, optional fields, value types, repeated defaults, closed
   vocabularies, exceptional records, and cross-record invariants. Inventory
   every identifier-bearing field and keyed identifier, validate its UUID
   version, and report all non-UUIDv4 identifiers before converting them.
2. Classify the observed shape before designing anything:
   - **Domain concepts** belong in the candidate in an intentionally modeled
     form.
   - **Compatibility encoding** such as `CompatDocument`, a synthetic `data`
     map, kebab-case keys, loose discriminator fields, and index comments does
     not constrain the candidate shape.
   - **Derived or duplicated data** should be authored only when the canonical
     source model truly owns it. Confirm how it is derived before omitting it,
     and prove parity rather than silently dropping it.
3. Sketch the intended Rust source types independently of the input encoding.
   Ask what an author should edit and what invariants the type system should
   enforce. Then design the RON that naturally deserializes into those types.
   Explicitly reject a design that is only the compatibility tree with RON
   punctuation.
4. Design the RON shape:
   - When a document consists solely of homogeneous definitions, make the list
     itself the top-level value and deserialize it as `Vec<Definition>`. Use a
     document record only when the domain has multiple independent root fields.
     Prefer explicit stable ID fields, and use maps only when keyed lookup is
     part of the authored domain model.
   - Give entries in long lists a named record such as `CardDefinition(...)` or
     `ActionDefinition(...)`; anonymous inline records such as `art: (...)` are
     fine when the surrounding field already supplies enough context.
   - Turn closed vocabularies and discriminated behavior into enums. Put
     variant-specific parameters inside the variant instead of keeping a wide
     record of unrelated optional fields.
   - Keep scalar concepts scalar. Introduce a sequence only when the concept is
     inherently plural; use an explicit compound variant for exceptional forms.
   - Hoist repeated values only when they represent a dataset-wide rule or
     default, not merely because every current record happens to match.
   - Order primary authored content before secondary metadata. Rename and
     regroup fields around domain meaning while preserving their semantics.
   - Keep presentation and template-substitution text as strings, while typing
     runtime identifiers, predicates, and modes.
   - Model every identifier as `uuid::Uuid` or a domain newtype around it. Emit
     UUIDv4 values in lowercase hyphenated form, including references and
     identifiers nested inside variants or lists.
   - Do not add schema-version fields. The typed source model and compiler build
     define the current contract. Evolve source models compatibly with optional
     or defaulted fields and deliberate adapter handling for new variants.
5. Start the candidate with `#![enable(implicit_some)]`. Write present
   `Option<T>` values as `value` instead of `Some(value)`, and omit absent or
   default-valued fields when the Serde schema supports omission. Skip this
   extension only when the target parser cannot support it or the user requests
   explicit `Some`.
6. Use normal quoted strings by default. Use raw strings only when multiline
   content or escaping makes them materially clearer.
7. Generate large catalogs mechanically. Fail on unknown or missing input keys,
   duplicate stable IDs, candidate IDs that are not UUIDv4, unsupported
   variants, invalid or incompletely migrated references, and violated
   invariants so the transformation cannot silently discard or reinterpret
   data.

## Modeling examples

A compatibility input such as this:

```ron
CompatDocument(
    data: {
        "actions": [
            { "id": "gather", "effect-kind": "draft-card", "count": 1 },
        ],
    },
)
```

does not imply that the wrapper, string keys, or discriminator belong in the
candidate. A modeled candidate might instead be:

```ron
#![enable(implicit_some)]
[
    ActionDefinition(
        id: "a60022e4-aa68-49ac-a389-bf3c8a29fe1c",
        effect: DraftCard(count: 1),
    ),
]
```

Use named entries in long lists and anonymous records inline:

```ron
#![enable(implicit_some)]
[
    CardDefinition(
        id: "7be2e6d7-abff-4c44-a0c3-35460da1693c",
        rarity: Legendary,
        art: (image: 454095982, owned: true),
    ),
]
```

Replace a string discriminator and its loose parameters with one typed value:

```ron
effect: DraftCard(
    predicate: Warrior,
    count: 1,
    offer_count: 4,
),
```

Keep a common scalar form simple and name the exceptional compound form:

```ron
energy_cost: Fixed(3),
// Alternatives: `Variable` for `X`, or `FixedAndVariable(3)` for `3,X`.
```

## Validate with Rust

Validate with the real `ron` and Serde crates, not a text or bracket check.

1. Create a temporary crate outside the repository:

   ```sh
   validation_dir=$(mktemp -d /tmp/ron-validation.XXXXXX)
   cargo init --quiet --bin --name ron_validation "$validation_dir"
   ```

2. Add the dependencies required by the actual inputs to its `Cargo.toml`:

   ```toml
   [dependencies]
   ron = "0.10"
   serde = { version = "1", features = ["derive"] }
   toml = "0.9" # Include when TOML is a parity input.
   uuid = { version = "1", features = ["serde"] }
   ```

3. In `src/main.rs`, define two strict typed models:
   - an input model that can deserialize the compatibility RON or legacy TOML;
   - the intended canonical structs and enums that define the candidate design.

   Add `#[derive(Deserialize)]` and `#[serde(deny_unknown_fields)]` to every
   record. Represent omitted fields with `Option<T>` or `#[serde(default)]`.
   Do not use `ron::Value`, `serde_json::Value`, or an untyped map as a
   substitute for proving the candidate schema.
4. Convert both typed forms into a shared semantic comparison model, derive
   `PartialEq`, and assert equality. This comparison should permit deliberate
   renaming, regrouping, enum modeling, and default hoisting while proving that
   every source value has an accounted-for meaning. When migrating legacy IDs,
   compare through an explicit old-to-new UUID mapping and prove that all
   references resolve through that same mapping.
5. Also assert source/output record counts, unique stable IDs, enum coverage,
   reference validity, required nested cardinalities, repeated-default
   assumptions, and every exceptional variant. Parse every candidate ID as a
   `uuid::Uuid`, assert `Version::Random` and `Variant::RFC4122`, assert
   lowercase hyphenated formatting, and fail if any identifier-bearing source
   value was neither already UUIDv4 nor included in the migration mapping. If
   TOML and compatibility RON both exist, first prove that they carry the same
   semantic data or report the discrepancy.
6. Run the validator against the real files, passing the compatibility input,
   candidate, and optional TOML parity source explicitly:

   ```sh
   cargo run --quiet --manifest-path "$validation_dir/Cargo.toml" -- \
     /absolute/path/input.ron \
     /absolute/path/input_canonical.ron \
     /absolute/path/input.toml
   ```

Run the repository's normal checks afterward. Leave the candidate as a review
artifact; integration into the compiler and runtime is a separate task unless
the user asks for it.

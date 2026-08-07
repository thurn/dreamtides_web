---
name: convert-toml-to-ron
description: Create an idiomatic Rusty Object Notation (.ron) equivalent of a TOML configuration or catalog. Use when asked to convert, port, experiment with, or redesign a .toml file as RON, including large or structurally complex TOML sources.
---

# Convert TOML to RON

Treat the conversion as domain modeling. Feel free to make assumptions and
idealized layout choices; the user is not asking for a 1:1 port unless they say
otherwise.

## Workflow

1. Inspect representative source sections, consumer types, and validation code.
   For a large TOML file, do not dump the whole file into context. Parse it to
   summarize record counts, key unions, optional fields, value types, and closed
   vocabularies.
2. Design the RON shape:
   - When a document consists solely of homogeneous definitions, make the list
     itself the top-level value and deserialize it as `Vec<Definition>`. Use a
     document record only when the source has multiple independent root fields.
     Prefer explicit stable ID fields, and use maps only when keyed lookup is
     part of the domain model.
   - Give entries in long lists a named record such as `CardDefinition(...)` or
     `ActionDefinition(...)`; anonymous inline records such as `art: (...)` are
     fine when the surrounding field already supplies enough context.
   - Turn closed vocabularies and discriminated behavior into enums. Put
     variant-specific parameters inside the variant instead of keeping a wide
     record of unrelated optional fields.
   - Keep scalar concepts scalar. Introduce a sequence only when the concept is
     inherently plural; use an explicit compound variant for exceptional forms.
   - Order primary authored content before secondary metadata. Preserve every
     semantic source value even when renaming or regrouping it.
   - Keep presentation and template-substitution text as strings, while typing
     runtime identifiers, predicates, and modes.
   - Do not add schema-version fields. The typed source model and compiler build
     define the current contract. Evolve source models compatibly with optional
     or defaulted fields and deliberate adapter handling for new variants.
3. Start the file with `#![enable(implicit_some)]`. Write present `Option<T>`
   values as `value` instead of `Some(value)`, and omit absent or default-valued
   fields when the Serde schema supports omission. Skip this extension only when
   the target parser cannot support it or the user requests explicit `Some`.
4. Use normal quoted strings by default. Use raw strings only when multiline
   content or escaping makes them materially clearer.
5. Generate large catalogs mechanically. Fail on unknown or missing TOML keys,
   duplicate stable IDs, unsupported variants, and invalid source invariants so
   the transformation cannot silently discard data.

## Modeling examples

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

2. Add these dependencies to its `Cargo.toml`:

   ```toml
   [dependencies]
   ron = "0.10"
   serde = { version = "1", features = ["derive"] }
   toml = "0.9"
   ```

3. In `src/main.rs`, define the intended Rust structs and enums rather than
   deserializing into a generic value. Add `#[derive(Deserialize)]` and
   `#[serde(deny_unknown_fields)]` to every record. Represent omitted fields
   with `Option<T>` or `#[serde(default)]`, then parse the actual output:

   ```rust
   fn main() -> Result<(), Box<dyn std::error::Error>> {
       let mut args = std::env::args().skip(1);
       let ron_path = args.next().expect("RON path");
       let toml_path = args.next().expect("TOML path");
       let ron_cards: Vec<CardDefinition> = ron::from_str(&std::fs::read_to_string(ron_path)?)?;
       let toml_catalog: TomlCatalog = toml::from_str(&std::fs::read_to_string(toml_path)?)?;
       assert_eq!(ron_cards.len(), toml_catalog.cards.len());
       Ok(())
   }
   ```

4. Parse the TOML source with `toml::from_str`. For strongest validation,
   canonicalize both typed forms, derive `PartialEq`, and assert equality. At
   minimum, assert source/output record counts, unique stable IDs, enum
   coverage, required nested cardinalities, and every exceptional variant.
5. Run the validator against the real files:

   ```sh
   cargo run --quiet --manifest-path "$validation_dir/Cargo.toml" -- \
     /absolute/path/output.ron /absolute/path/source.toml
   ```

Run the repository's normal checks afterward. Create only the sidecar `.ron`
file; do not replace the TOML loader, compiler, or canonical source unless the
user asks for integration.

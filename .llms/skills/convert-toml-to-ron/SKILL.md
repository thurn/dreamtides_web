---
name: convert-toml-to-ron
description: Create an idiomatic Rusty Object Notation (.ron) equivalent of a TOML configuration or catalog. Use when asked to convert, port, experiment with, or redesign a .toml file as RON, including large or structurally complex TOML sources.
---

# Convert TOML to RON

Treat the conversion as domain modeling. Feel free to make assumptions and
idealized layout choices; the user is not asking for a 1:1 port unless they say
otherwise.

1. Inspect representative source sections, consumer types, and validation code.
   For a large TOML file, do not dump the whole file into context: use a parser
   to summarize record counts, key unions, optional fields, value types, and
   closed vocabularies.
2. Design the RON shape before generating it:
   - Prefer named records such as `CardDefinition(...)` and flat lists with an
     explicit stable ID field. Use maps only when keyed lookup is part of the
     domain model.
   - Turn closed vocabularies and discriminated behavior into enums. Put
     effect-specific parameters inside enum variants instead of leaving a wide
     record of unrelated optional fields.
   - Keep scalar concepts scalar. Introduce a sequence only when the concept is
     inherently plural; model exceptional compound values with an explicit
     variant when that is clearer.
   - Group related values into small nested structs, and order fields for a
     human reader: primary authored content first, secondary metadata later.
   - Preserve every semantic source value even when renaming or regrouping it.
     Keep presentation/template strings as strings while typing runtime
     identifiers and predicates.
3. Use normal quoted strings by default. Use RON raw strings only when multiline
   content or escaping makes them materially clearer.
4. Omit default-valued optional fields when the intended Serde schema supports
   it. Use `#![enable(implicit_some)]` only deliberately; it trades visible
   `Some(...)` wrappers for a RON parser extension.
5. Generate large catalogs mechanically. Fail on unknown or missing TOML keys,
   duplicate stable IDs, unsupported variants, and invalid source invariants so
   the transformation cannot silently discard data.
6. Parse the result with the real Rust `ron` and Serde stack, preferably against
   a typed schema with unknown-field rejection. Compare source and output
   semantics or, at minimum, validate record counts, unique IDs, enum coverage,
   nested cardinalities, and representative exceptional values. Then run the
   repository's normal checks.

Create the sidecar `.ron` file only. Do not replace the TOML loader, compiler,
or canonical source unless the user asks for integration.

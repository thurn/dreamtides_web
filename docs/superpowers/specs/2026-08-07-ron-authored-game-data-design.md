# RON-Authored Game Data with Generated TOML

Date: 2026-08-07  
Status: proposed design, ready for implementation planning

## Goal

Make RON the tracked authoring format for Dreamtides game data while preserving
TOML as the compatibility format read by the TypeScript application and its
existing data compilers.

A repository-owned Rust binary converts canonical RON into deterministic TOML.
The generated TOML occupies the paths that TypeScript reads today, is excluded
from version control, and is refreshed before data-consuming commands and after
RON changes during local development. Production and browser code continue to
parse TOML with the TypeScript toolchain.

The final data flow is:

```text
tracked RON -> Rust conversion -> staged TOML -> TypeScript validation
            -> generated TOML -> existing JSON/assets/runtime pipeline
```

## Context

The repository currently has 26 tracked game-data TOML files: 25 under
`data/tabula/` and `data/exploration_candidates.toml`. Together they contain
approximately 20,000 lines. `data/tabula/cards.toml` is the largest at roughly
233 KB and 521 card records.

TOML is consumed in several different ways:

- `scripts/setup-assets.mjs` compiles the catalogs into runtime JSON and asset
  indexes.
- focused data compilers and experiments parse individual TOML files directly;
- browser modules import a small number of TOML files through Vite `?raw`;
- Vite plugins watch TOML files and regenerate focused JSON outputs;
- local editor APIs patch TOML and refresh their generated outputs; and
- tests parse both synthetic fixtures and production catalogs.

The TypeScript-facing shapes include kebab-case, snake_case, and camelCase
source keys. Those shapes are established inputs to the existing compilers.
The generated runtime JSON and all UUID-based references are established output
contracts.

## Decisions

1. **RON is canonical; TOML is generated compatibility data.** Every migrated
   dataset has one tracked `.ron` source and one ignored `.toml` output. The
   application treats the TOML as read-only.
2. **TypeScript reads TOML.** Game code, Node data compilers, Vite raw imports,
   and tests do not parse RON. RON parsing and serialization belong to the Rust
   tool.
3. **Generated TOML keeps its current path and schema.** For example,
   `data/tabula/cards.ron` generates `data/tabula/cards.toml`. Existing
   TypeScript readers retain their paths and source-facing key names during the
   migration.
4. **Canonical data may use RON's full typed value model.** Dataset source
   schemas may use named structs, enums, tuples, options, ranges, chars, byte
   strings, maps, heterogeneous collections, numeric forms, and pinned official
   extensions. Dataset adapters lower those values into the established TOML
   compatibility contract.
5. **Authored fields use snake_case.** Dataset adapters explicitly map RON field
   paths to the existing TOML schema. Conversion never guesses whether an
   underscore should become a hyphen or preserve an underscore.
6. **Generation is deterministic and content-aware.** Equal source and tool
   versions produce byte-identical TOML. An output whose bytes already match is
   left untouched so file watchers do not loop.
7. **Validation precedes publication.** Rust conversion writes to staging. The
   TypeScript compiler validates the staged TOML before it replaces the visible
   generated TOML.
8. **Local editors write RON through the Rust tool.** Editor APIs may read the
   generated TOML, but saves target canonical RON and publish RON, TOML, and
   derived JSON as one validated transaction.
9. **Stable identity remains authoritative.** Card and entity edits, mappings,
   references, diagnostics, and migration comparisons use UUIDs or the
   dataset's established stable identifier, never display names.
10. **Migration is dataset-by-dataset.** The compiler supports a mixed checkout
    during implementation, but each dataset has exactly one canonical source at
    every committed stage.

## Scope

The migration covers the tracked game-data TOMLs under `data/tabula/` and the
Exploration candidate catalog:

- core entities: cards, Dream Avatars, Dreamsigns, Dreamwell cards, figments,
  dreamscapes, guides, sites, affiliations, and Apollyon incarnations;
- card and Dreamsign tag registries plus card tide annotations;
- gameplay configuration: Atlas, Augury, draft, economy, opponents, reward
  selection, tutorial, and tutorial journey pool;
- Exploration runtime configuration and Exploration candidates; and
- Dreamsign profiles, Dreamsign signatures, and glossary data.

The Rust tool, generation orchestration, Vite integration, build integration,
editor write path, migration tooling, documentation, and verification needed
for those datasets are in scope.

## Non-goals

- Parsing RON in production TypeScript or browser code.
- Replacing the JSON artifacts served to the application.
- Changing runtime data types, game rules, balance, copy, UUIDs, record order,
  or cross-reference semantics as part of the format migration.
- Converting repository and tool configuration such as `.codex/config.toml`.
- Inventing one schema-blind mapping from every possible RON value to TOML.
  Rich RON values are compiled through explicit dataset adapters.
- A general-purpose RON/TOML conversion utility for unrelated repositories.
- A bidirectional authoring workflow in which developers edit generated TOML.
- Preserving byte-level blame across the one-time syntax conversion. The
  mechanical conversion commit is recorded in `.git-blame-ignore-revs`.

## Source and generated layout

Canonical RON and generated TOML share a basename and directory:

```text
data/tabula/cards.ron                    # tracked source
data/tabula/cards.toml                   # ignored generated compatibility file
data/tabula/exploration.ron              # tracked source
data/tabula/exploration.toml             # ignored generated compatibility file
data/exploration_candidates.ron          # tracked source
data/exploration_candidates.toml         # ignored generated compatibility file
```

Keeping generated TOML at the current path makes the format boundary invisible
to TypeScript readers. `.gitignore` lists only the generated targets declared in
the game-data manifest; it does not ignore arbitrary TOML elsewhere in the
repository.

Every generated TOML begins with a short generated-file warning naming its RON
source, source SHA-256, compiler format version, and regeneration command. It
is valid input to `smol-toml` and makes accidental direct edits obvious. The
warning is the only compiler-added content; data ordering and values come from
RON.

A clean checkout may have no generated game-data TOML. Supported development,
review, build, and deployment entry points materialize it before TypeScript
needs it.

## Dataset manifest

The tracked `data/game-data-manifest.ron` manifest defines the complete
conversion graph. It records, per dataset:

- stable dataset ID;
- canonical RON path;
- generated TOML path;
- accepted `ron_format_version`;
- Rust source-schema type;
- compatibility-adapter version;
- compatibility-key adapter;
- dependent datasets whose TypeScript validation must run together;
- focused runtime JSON refresh operation;
- editor capability and record identity strategy; and
- migration state while mixed RON/TOML operation is enabled.

The Rust binary is the only parser of the manifest. A `list --json` command
exposes the resolved entries to the Node orchestrator and Vite plugin, avoiding
a second TypeScript registry.

The manifest rejects duplicate source or output paths, missing adapters,
targets outside the approved data roots, and two canonical sources for one
dataset. Dataset IDs, rather than filenames, are used by command-line and
editor operations.

## RON authoring contract

Canonical files deserialize into dataset-specific Rust source types through the
pinned official RON and Serde crates. The RON source schema is allowed to model
the domain directly instead of imitating TOML. Struct fields use snake_case;
named types and enum variants follow Rust identifier conventions.

Any RON construct supported by the pinned parser may be used when the dataset's
Rust source schema and compatibility adapter define its meaning. This includes:

- named and anonymous structs;
- unit, newtype, tuple, and struct enum variants;
- tuples and tuple structs;
- explicit `Some`/`None` values;
- ranges, chars, and byte strings;
- maps with typed non-string keys;
- lists containing typed heterogeneous enum variants;
- the numeric forms accepted by RON; and
- official RON extensions enabled by the source document and admitted by the
  dataset schema.

The compiler does not require these values to have a direct TOML equivalent.
It deserializes the canonical document into the typed source model, then the
dataset adapter lowers that model into a separate compatibility model that the
TOML serializer can represent. Parser errors, unknown fields, duplicate struct
fields, invalid variants, and values outside the dataset's declared Rust types
remain ordinary malformed-source errors rather than restrictions imposed by
TOML.

Every canonical document carries the reserved source-only field
`ron_format_version`. Dataset adapters validate it before conversion and omit
it from generated TOML. RON format migrations are explicit tool operations;
ordinary compilation does not silently reinterpret an older format version.

Dataset domain schemas remain independent. A canonical source corresponding to
an existing TOML domain schema marker authors that value as its dataset field
`schema_version`; the compatibility adapter maps it to that dataset's exact
established output key, including `schema-version` or `schema_version`, and the
existing TypeScript compiler continues to validate it. `ron_format_version`
never supplies or changes a dataset's `schema_version`.

The authoring style uses trailing commas and stable field order. Long rules text
and narrative copy use raw strings with the minimum safe hash delimiter. The
formatter preserves Unicode characters and line endings inside string values.

## Compatibility schema adapters

The generated TOML is an interface owned by the TypeScript compilers. A source
field such as `energy_cost` may need to become `energy-cost`, while a field in
another dataset may need to remain `card_id` or become camelCase. A recursive
global case conversion is therefore unsafe.

Each dataset selects a typed source schema and explicit compatibility adapter.
An adapter defines:

- source field path to generated field path mappings;
- top-level collection names;
- array-of-table and nested-table representation;
- fields omitted from compatibility output, including
  `ron_format_version`; and
- any representation conversion required by the current TOML contract.

The adapter is normal Rust code from the typed source model to a typed or
ordered TOML compatibility model. It may use a direct representation where RON
and TOML align, or deliberately lower a richer value:

| RON source construct | Possible compatibility representation |
| --- | --- |
| Named struct | TOML table; the type name is validated and may be omitted |
| Enum variant | Existing string discriminator or discriminated TOML table |
| Tuple or tuple struct | TOML array, positional table, or named table |
| `Some(value)` / `None` | Value, field omission, or declared sentinel |
| Range | Start/end/inclusive table or the dataset's existing compact form |
| Char | One-character string |
| Byte string | Integer array, hexadecimal string, or base64 string |
| Non-string map key | Reversible encoded key or ordered key/value entries |
| Heterogeneous enum list | Mixed TOML array or discriminated table entries |
| Numeric value outside consumer range | Declared string or structured value |

These are available strategies, not global encodings. The dataset adapter
chooses the representation that matches its existing TypeScript contract. A
new dataset is equally free to establish a new TOML contract, provided its
TypeScript compiler validates that contract explicitly.

Mappings are total. Compilation fails when a source field or variant is not
covered, two source values target the same generated path, or the lowered value
does not fit the declared TOML compatibility type. Adding a source field or
variant therefore requires a deliberate compatibility decision rather than a
global case or value heuristic.

The adapters preserve the current handling of values such as blank spark,
variable energy cost, absent optional art, nested action tables, and current
mixed-case tutorial keys. They do not perform game-rule validation; the
existing TypeScript compilers remain authoritative for domain semantics and
cross-dataset references.

## Rust tool

The repository contains one Cargo binary crate under `tools/game-data/`. A
pinned stable Rust toolchain and lockfile make local and CI builds reproducible.
The binary depends on the official RON, Serde, and TOML ecosystem and has no
network or service dependency at runtime. Dataset source models deserialize
RON's typed forms directly; compatibility models serialize the adapter output
to TOML without routing through a generic JSON-like value.

Its public commands are:

- `list --json`: resolve and print the dataset manifest;
- `compile`: convert all canonical RON into a staging directory;
- `compile --dataset <id>`: convert one dataset and its declared conversion
  dependencies;
- `check`: parse, adapt, serialize, and compare generated outputs without
  publishing them;
- `migrate`: perform the one-time TOML-to-RON conversion for a selected dataset;
  and
- `stage-edit`: apply one editor operation to a staged RON source and produce
  the corresponding staged TOML.

The binary accepts the repository root explicitly for tests and worktrees. It
resolves and validates every path before reading or writing and refuses targets
outside manifest-approved roots. Machine callers request structured JSON
diagnostics; interactive use receives concise human-readable diagnostics. The
Node launcher builds the locked crate on cache miss and invokes the cached
binary directly for subsequent watch and editor operations.

Compilation reports dataset ID, source path, RON format version, compatibility-
adapter version, source hash, generated hash, duration, and whether the output
differs. It never emits game data values or authored copy into routine logs.

## Deterministic conversion

The converter preserves source collection order. Compatibility adapters define
the deterministic output order of schema-owned fields; dynamic maps use their
document order. It emits UTF-8, LF line endings, one final newline, stable
indentation, stable string escaping, and deterministic table layout. The same
source and compiler version must produce identical bytes on macOS and Linux.

`compile` writes an entire requested batch beneath a unique temporary staging
root. A RON parse, schema, mapping, or TOML serialization failure leaves visible
generated files untouched. Successful conversion hands the staged paths to the
Node orchestration layer for semantic validation.

Publication compares staged and visible bytes. Unchanged files are discarded;
changed files are moved into place with same-filesystem atomic renames. Batch
publication commits every validated generated TOML or none of them.

## TypeScript orchestration and validation

`scripts/game-data-pipeline.mjs` is the integration boundary between Rust
conversion and the existing TypeScript data pipeline. It does not parse RON.
It:

1. asks the Rust binary to generate staged TOML;
2. parses the staged files with the same TOML parser used by production tools;
3. runs the affected focused compilers and cross-reference validators against
   the staged root;
4. prepares the derived JSON writes that the requested operation owns;
5. publishes canonical RON changes, generated TOML, and derived JSON as one
   transaction when called from an editor; and
6. returns structured success or failure details to the caller.

Focused compilers must accept explicit source paths or a root override so
validation never requires temporarily replacing the visible TOML. This path
also prevents a semantically invalid RON save from disrupting a running local
game that can continue using its last valid generated data.

On command startup, missing generated TOML is normal and triggers compilation.
A generated output whose recorded source hash differs is stale and triggers
compilation. Supported standalone data scripts invoke a lightweight freshness
assertion before their first read; an absent or mismatched generated header
fails with a message naming the command that materializes game data.

## Local development and hot reload

The Vite configuration installs one RON generation plugin ahead of the current
data hot-reload plugins. At server startup it materializes and validates every
generated TOML. Startup fails visibly if the canonical RON cannot produce valid
game data.

During development, the plugin watches manifest-listed RON sources with the
same explicit watcher lifecycle used by the current data plugins. A change is
debounced by dataset ID and follows this sequence:

1. convert the changed dataset to staging;
2. validate the staged TOML and affected cross-dataset contracts;
3. atomically publish changed TOML;
4. let the existing focused TOML watcher regenerate runtime JSON; and
5. emit the existing targeted HMR event.

Generated TOML is ignored by Vite's general module watcher, retaining targeted
refresh behavior for editor pages and running games. Content-aware publication
ensures the RON watcher and TOML watchers settle after one conversion cycle.

A failed edit retains the previous generated TOML and runtime JSON. Vite shows
the RON file, line, column, dataset ID, and conversion or semantic validation
message. A later valid save clears the error and publishes normally.

## Build, review, regeneration, and deployment

All supported entry points use the same orchestration command:

- `npm run dev` and `npm run dev:vite` compile before Vite starts;
- `npm run build` compiles before TypeScript and Vite build;
- `npm run review` and `npm run review:full` validate generation before their
  diff-aware or exhaustive checks;
- `scripts/regenerate-assets.sh` compiles before its first `setup-assets` step;
- data experiments and bakes compile before reading generated TOML; and
- `npm run deploy` receives the generation gate through `npm run build` before
  Firebase Hosting or Storage changes occur.

CI installs the pinned Rust toolchain and caches Cargo dependencies plus the
crate target directory. A clean-checkout job proves that ignored TOML can be
materialized before the Node review suite. Deployment cannot proceed with a
missing Rust toolchain, invalid RON, stale generated TOML, or failed TypeScript
semantic validation.

Generated TOML is a local build artifact. Release correctness is established
by canonical RON, compiler source and lockfile, existing tracked derived data,
and the clean-checkout generation test.

The diff-aware review planner treats `.ron`, the dataset manifest, Rust crate,
toolchain files, compatibility adapters, and generation orchestration as data-
pipeline inputs. A change to those inputs schedules the applicable generation,
Rust, TypeScript compiler, reference, and focused integration checks.

## Editor architecture

The browser remains a client of localhost-only Vite middleware. It never
writes files or invokes Rust directly. Editor collection reads may continue to
use generated TOML so the editor previews exactly what the game compiler sees.

Editor source selection uses a dataset ID or a validated canonical `.ron` path.
The final URL/API vocabulary calls this `source`; it does not present generated
TOML as an editable choice.

For a save, the middleware:

1. validates the request and stable record identifier;
2. asks `stage-edit` to patch a copy of canonical RON;
3. compiles that staged RON to staged TOML;
4. runs the existing TypeScript field, dataset, reference, and JSON validation;
5. prepares all affected RON, TOML, registry, and JSON writes;
6. atomically publishes the transaction; and
7. returns the confirmed record read through the generated compatibility path.

Cards are always selected by UUID. Other catalogs use their established stable
ID. Positional records such as ordered tutorial actions use a schema-defined
stable locator and reject a stale client revision rather than guessing by copy
or array contents.

### RON source patching

Source preservation remains a hard editor requirement. `stage-edit` uses a
syntax-aware RON source model that understands comments, raw strings, escapes,
and balanced nested structures. A narrow field edit changes only that value's
source range. Record replacement changes only the identified record. Unrelated
records, fields, comments, ordering, and whitespace remain byte-identical.

The editor patch layer formats newly inserted values canonically. It selects a
normal quoted string for one-line text and a minimum-delimiter raw string for
multiline or escape-heavy text. It reparses the complete candidate RON before
returning it.

Full-document editors may use canonical serialization only when their existing
save contract already replaces the complete document. Dataset-level and field
editors use targeted patching.

The TypeScript transaction layer retains backup-and-rollback behavior for
filesystem failures. A failed validation or write leaves the canonical RON,
generated TOML, and runtime JSON at the same confirmed revision.

## Migration strategy

Migration proceeds in independently reviewable dataset batches.

### Foundation

Add the Rust crate, toolchain pin, manifest, Node orchestration, deterministic
serializer, staging validation, ignore rules, clean-checkout generation test,
and build/dev/review integration. The manifest initially declares TOML-backed
datasets as migration inputs without changing their canonical files.

### Representative proof

Prove the full pipeline with three noncanonical conversion fixtures modeled on:

- `draft.toml`, for compact nested configuration;
- `cards.toml`, for a large ordered record catalog, Unicode, optional fields,
  inline art data, and multiline rules text; and
- `exploration.toml`, for nested arrays, action records, compatibility key
  mappings, and editor-shaped changes.

The proof must establish cross-platform deterministic TOML, structured errors,
staged TypeScript validation, content-aware publication, and source-preserving
edits before production datasets move. A synthetic source-schema fixture uses
named structs, enum variants, tuples, options, ranges, typed map keys, chars,
byte strings, and numeric edge cases to prove that rich RON values pass through
typed adapter lowering rather than a TOML-shaped generic value restriction.

### Read-only catalogs

Convert small read-only configuration first, followed by interdependent Atlas,
economy, reward, profile, and signature catalogs. Each conversion commit adds
the canonical RON, activates its manifest entry, makes the TOML path an ignored
generated target, materializes that target, and proves downstream parity.

### Editor-backed catalogs

Add editor operations and convert editor-backed datasets in increasing order of
save complexity: simple field catalogs and registries, cards and Dreamsigns,
Dream Avatars and Dreamscapes, glossary and tutorial, then Exploration and its
candidate catalog.

Editor UI and API source terminology changes in the same dataset batch as its
canonical source. A mixed migration build can serve editors for both source
formats through explicit manifest state; each individual editor points at only
one canonical source.

### Convergence

After all manifest entries are RON-backed, normal builds contain only the RON
source path and RON-to-TOML compiler. `migrate` remains an explicitly invoked
maintenance utility only if it still has demonstrated value. Current
documentation names RON as authored data and TOML as generated compatibility
data, and `.git-blame-ignore-revs` lists the mechanical migration commits.

## Migration parity

Every dataset cutover uses the pre-migration TypeScript output as a temporary
oracle:

1. parse the tracked TOML through the current pipeline;
2. convert it mechanically to RON while retaining record order, values, and
   meaningful comments;
3. generate compatibility TOML from RON;
4. run that TOML through the same TypeScript pipeline; and
5. deep-compare normalized compiler results and byte-compare deterministic JSON
   artifacts where the current pipeline is deterministic.

Differences are classified before the cutover. Formatting and the generated
header may differ in TOML; parsed values, compiler outputs, UUID references,
record order, string code points, and runtime artifacts must agree. Filesystem-
dependent art discovery is compared through stable logical asset references,
not machine-specific absolute paths or symlink metadata.

These production-data comparisons are migration commands and review evidence,
not permanent CI tests. Permanent tests use synthetic fixtures so routine game
data changes do not fail tests by changing mutable production values.

The TOML-to-RON migration utility carries leading, field, inline, and
record-boundary comments through a syntax-aware TOML document model. A review
report lists comments it cannot attach unambiguously. The dataset does not cut
over until those cases are intentionally placed in RON.

## Failure behavior and diagnostics

All failures identify the dataset and canonical RON source. Syntax errors
include line and column. Schema and compatibility failures include a structured
field path. TypeScript domain failures retain their established semantic path
and add the originating RON dataset.

Failure behavior is operation-specific:

- startup and build fail before TypeScript consumes incomplete data;
- watch mode retains the last valid generated TOML and reports the candidate
  error;
- editor saves roll back the complete transaction and return the confirmed
  server value;
- `check` exits nonzero without writing; and
- a batch conversion publishes none of its outputs when any dataset fails.

Compiler diagnostics and timings go to development/build logs. They do not
enter `logs/journey-log.jsonl`, because conversion is a development and release
operation rather than production game behavior.

## Verification

### Rust tests

Synthetic unit and property tests cover:

- typed deserialization and lowering for named structs, every enum shape,
  tuples, options, ranges, chars, byte strings, typed map keys, heterogeneous
  enum lists, numeric edge cases, and enabled official extensions;
- deterministic serialization and stable ordering;
- compatibility-field and variant coverage plus collision rejection;
- quoted, raw, multiline, Unicode, and delimiter-containing strings;
- integer and floating-point boundaries;
- atomic batch staging and content-aware publication;
- manifest path containment and duplicate detection;
- structured syntax/schema diagnostics; and
- source-preserving field and record edits across comments and nested values.

Official RON parser fixtures are included or referenced at their pinned version.
Dataset tests demonstrate each rich construct that the source schema uses and
its exact compatibility representation.

### TypeScript and integration tests

Synthetic fixtures cover:

- orchestration of Rust staging, TypeScript validation, and publication;
- clean-checkout generation before build and tests;
- focused validation against staged paths;
- rollback after Rust, TypeScript, JSON, or filesystem failure;
- debounce and watcher convergence without reload loops;
- targeted HMR after a valid RON edit;
- last-valid-data behavior after an invalid RON edit;
- editor reads from generated TOML and writes canonical RON;
- stable-ID edit routing and stale-revision rejection; and
- path traversal and undeclared-dataset rejection.

Existing compiler and editor tests migrate to synthetic RON inputs where they
exercise authoring behavior. Tests whose contract is TypeScript parsing of the
compatibility layer continue to use synthetic TOML. Production catalogs remain
available to reference-integrity validation run by the diff-aware review, but
unit tests do not assert mutable names, copy, counts, or tuning values.

### Repository validation

Implementation is complete when:

- a clean checkout can materialize all ignored TOML and run
  `npm run review:full`;
- `npm run regenerate-assets` succeeds from canonical RON;
- `npm run build` succeeds with an empty generated-TOML cache;
- the deployment path fails before external changes when RON is invalid;
- every migrated dataset passes its one-time parity report;
- generated TOML is absent from `git ls-files` and present after generation;
- editing a generated TOML produces a warning and is overwritten by the next
  compile; and
- all local editors complete their normal save, refresh, validation, and
  rollback workflows against canonical RON.

Browser screenshot QA is not required for read-only format conversions. Editor
source/API changes receive focused browser QA through the normal desktop editor
workflow, including a successful save, a validation error, and recovery, with
the browser error buffer remaining empty.

## Acceptance criteria

- All scoped game data is tracked as RON with one canonical source per dataset.
- TypeScript and browser code read generated TOML or existing generated JSON,
  not RON.
- Generated TOML uses current paths and compatibility schemas and is excluded
  from version control.
- Supported entry points generate and validate TOML before reading it.
- Local RON changes produce focused validated TOML and runtime refreshes.
- Invalid changes preserve the last valid local runtime artifacts and produce
  actionable RON diagnostics.
- Build and deployment fail before external effects when generation or
  validation fails.
- Conversion is deterministic across supported development and CI platforms.
- Canonical sources may use the full typed RON model supported by the pinned
  parser when their dataset source schema and adapter define the lowering.
- Editor saves update canonical RON by stable ID and preserve unrelated source
  bytes.
- RON, TOML, and derived JSON editor writes publish atomically or roll back
  together.
- Migration parity demonstrates unchanged runtime data, record order, UUID
  references, and generated artifacts.
- Permanent tests use synthetic stable fixtures and the repository review suite
  passes from a clean checkout.

## Alternatives considered

### Parse RON directly in TypeScript

This would eliminate the compatibility TOML but make every Node, Vite, browser,
test, and editor path depend on a TypeScript RON implementation. The available
JavaScript ecosystem has a smaller compatibility and maintenance surface than
the official Rust implementation, and comment-preserving editor writes would
still require separate syntax tooling.

### Generate JSON directly from RON

RON-to-JSON would be a shorter serialization path, but the current TypeScript
compilers perform substantial normalization, cross-reference validation, asset
discovery, and editor preview construction from TOML-shaped inputs. Moving that
boundary would broaden the migration into a data-pipeline rewrite.

### Track generated TOML

Tracking both formats would make clean checkouts immediately usable by Node,
but every data edit would produce two review surfaces and require a permanent
drift gate between two committed representations. Ignored deterministic TOML
keeps source ownership unambiguous.

### Edit generated TOML and convert it back to RON

Reverse conversion would create competing authoring paths and make RON comments,
raw-string choices, and formatting unstable. Semantic editor operations against
canonical RON provide one directional flow and transactional validation.

### Convert every dataset atomically

An all-at-once cutover would shorten the mixed-format period but combine about
20,000 lines of mechanical data conversion with compiler, watcher, build, and
editor changes. Dataset batches preserve parity evidence and localize failures
while the manifest enforces one source of truth for every migrated catalog.

## Risks and costs

- Rust becomes a required development, CI, and deployment toolchain. The pinned
  toolchain, Cargo cache, and narrow crate reduce but do not erase that cost.
- The compatibility adapters are an intentional second schema boundary. Total
  field and variant coverage plus parity tests make that boundary explicit
  rather than relying on generic case- or value-conversion heuristics. Rich RON
  constructs add adapter code where their compatibility representation is not
  direct.
- Source-preserving RON editing is more involved than pure serialization. It is
  required to retain the editors' established preservation and rollback
  contracts.
- Ignored generated TOML can surprise developers running low-level scripts.
  Supported entry points materialize it, generated headers explain ownership,
  and bypassed scripts fail with a direct recovery command.
- Watch mode spans Rust conversion, TypeScript validation, TOML publication,
  JSON generation, and HMR. Dataset-level debounce, content-aware writes, and
  staging prevent loops and partially published states.
- Large syntax-conversion commits affect history navigation. Dedicated
  mechanical commits and `.git-blame-ignore-revs` keep later blame useful.

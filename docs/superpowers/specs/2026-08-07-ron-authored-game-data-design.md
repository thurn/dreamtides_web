# RON-Authored Game Data with Generated TOML

Date: 2026-08-07  
Status: proposed design; conversion feasibility assessed; editor gate required

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

The repository has 26 tracked game-data TOML files: 25 under `data/tabula/` and
`data/exploration_candidates.toml`. Together they contain approximately 20,000
lines. It also has three production-shaped RON candidates beside their TOML
counterparts: `draft.ron`, `cards.ron`, and `exploration.ron`. These files are
the starting point for the migration rather than disposable syntax examples.

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

## Feasibility assessment against the current RON files

The three candidates establish that this design needs a typed compiler, not a
schema-blind format converter. Their current shapes and required lowerings are:

- Draft is a 1.2 KB anonymous root with enum-keyed `rarity_caps` and
  `strategies` maps. The adapter converts rarity map entries to
  `[[rarity-caps]]`, converts the `Tides4` key and value to
  `default-strategy = "tides4"` plus `[pool.tides4]`, and maps snake_case fields
  to kebab-case.
- Cards is a 304 KB catalog of 521 `CardDefinition` records using
  `implicit_some`, `Fixed`, `Variable`, `FixedAndVariable`, `Character`,
  `Event`, optional crop data, and omitted defaults. The adapter materializes
  the established flat TOML card record, including card type, subtype, spark,
  speed booleans, blank rarity, empty tags, art defaults, and explicit field
  mappings.
- Exploration is a 65 KB `ExplorationCatalog` with 34 typed effect definitions,
  29 encounters, 58 actions, effect enums with unit and struct variants,
  predicate enums, typed defaults, and dynamic template metadata. The adapter
  lowers effect and policy enums to their established IDs, flattens each
  action-effect variant into `effect-kind` plus its fields, and maps
  `TemplateInvocation` to template IDs, variables, and selection tables.

A scratch feasibility harness using `ron` 0.12.2 and Serde-derived source
types with unknown-field rejection deserialized all three complete documents.
On the local development machine, Draft parsed in under 1 ms, Cards in about
22 ms, and Exploration in about 6 ms. The typed results contained 521 cards,
34 effect definitions, 29 encounters, and 58 actions. These timings are
diagnostic evidence, not performance test thresholds.

The card UUIDs, encounter card UUIDs, and action IDs in RON exactly match the
TOML counts and order. Full semantic parity still requires the real adapters
and the existing TypeScript compilers; successful RON deserialization alone is
not a parity result.

The compiler must deserialize directly into dataset source types. The official
`ron::Value` representation does not retain enum identities. For example, a
unit variant becomes an undifferentiated unit value and a newtype variant loses
its variant name. That makes a generic RON-value-to-TOML-value walk incapable
of distinguishing `Legendary` from another unit variant or `Fixed(2)` from a
different newtype variant. Typed Rust enums retain exactly the information the
adapters need. Narrow metadata leaves such as Exploration template variables
may use a dynamic value type when their schema deliberately permits strings,
integers, booleans, and small string-keyed objects.

The current Cards candidate intentionally normalizes two historical TOML
representations. The energy cost for UUID
`29d25251-8b42-4d3d-97e6-6c3abaabd9a2` and the spark for UUID
`229ab3a1-3720-41a2-924c-8fe112188f8e` are quoted numeric strings in TOML but
are `Fixed(2)` in RON. Both representations produce the same existing
TypeScript card result. Cards parity therefore compares the output of the
existing card compiler, including energy and spark normalization, rather than
requiring raw parsed TOML types to match. Other datasets use parsed-value
parity unless their adapter documents an equally specific semantic
normalization.

The candidates are sufficient for read/build conversion but are not complete
editor schemas. The Cards editor can assign per-card tides, which Cards schema
version 1 cannot represent. The Exploration editor can author a per-action
selection policy, which Exploration schema version 1 cannot represent. Their
editor cutovers therefore use the version 2 source additions defined in Editor
operation vocabulary while retaining the existing TOML compatibility schemas.

Read, build, review, watch, and deployment conversion are feasible with the
official parser and explicit adapters. Source-preserving editor mutation is the
highest-risk portion. The official parser supplies semantic values and spanned
errors rather than a lossless concrete syntax tree. In an August 2026 spike,
`ron-edit` 0.2 parsed Draft but failed on the named `CardDefinition` records,
while `tree-sitter-ron` 0.2 parsed Draft and the Exploration body after a
preamble shim but reported an error on the raw Unicode rules strings in Cards.
Neither dependency is an acceptable editor foundation as-is. The editor phase
therefore starts with a dedicated span-indexing prototype against all three
production candidates and does not cut over an editor-backed dataset until that
prototype passes the preservation tests in this document.

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
source, source SHA-256, compiler build version, adapter version, and
regeneration command. It is valid input to `smol-toml` and makes accidental
direct edits obvious. The warning is the only compiler-added content; data
ordering and values come from RON.

A clean checkout may have no generated game-data TOML. Supported development,
review, build, and deployment entry points materialize it before TypeScript
needs it.

## Dataset manifest

The tracked `data/game-data-manifest.ron` manifest defines the complete
conversion graph. It records, per dataset:

- stable dataset ID;
- canonical RON path;
- generated TOML path;
- accepted dataset `schema_version` values;
- registered Rust source-schema and adapter ID;
- compatibility-adapter version;
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

Source structs reject unknown fields. Omitted values are accepted only where
the source type declares an explicit option or schema default; the Cards
defaults are examples. The compiler validates dynamic leaves such as
Exploration template metadata recursively and rejects value kinds outside that
leaf's declared vocabulary. These schema checks preserve author intent while
allowing every typed construct that has a defined adapter lowering.

Every canonical document carries its dataset field `schema_version`. This is
the version of the typed source schema and adapter contract. The manifest lists
the versions accepted by the compiled adapter, and compilation fails on an
unsupported version before lowering.

The compatibility adapter decides whether and how that source version appears
in TOML. Draft and Exploration schema version 1 map `schema_version` to the
established `schema-version = 1`. Cards schema version 1 is source-only because
`cards.toml` has no schema marker. Source and compatibility versions need not
advance together: the editor-capable Exploration source schema version 2 still
emits compatibility `schema-version = 1` because its new optional field lowers
into the existing TOML contract. A separate per-document RON format version
would duplicate the source-schema contract and is not required. Parser behavior
is pinned by the Cargo lockfile and toolchain; a parser upgrade is reviewed and
tested as a compiler change.

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
- fields omitted from compatibility output, such as Cards
  `schema_version`; and
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

The first three adapters have concrete contracts:

- Draft iterates the ordered rarity and strategy maps. Each rarity key becomes
  the `rarity` string in one `[[rarity-caps]]` entry. `Tides4` becomes the
  `"tides4"` default strategy and the `[pool.tides4]` table. The adapter rejects
  a default strategy without a matching strategy definition.
- Cards maps `rules` to `rendered-text`, `mtg_origin` to `mtg-name`, `number` to
  `card-number`, and the art fields to `image-number`, `art-owned`, and `art`.
  `Fixed(n)`, `Variable`, and `FixedAndVariable(n)` become `n`, `"X"`, and
  `"n,X"`. `Event` and `Character` materialize `card-type`, subtype, and spark.
  The default speed emits both speed flags as false, `Fast` emits
  `is-fast = true` and `is-interrupt = false`, and `Interrupt` emits both flags
  as true. Omitted rarity, tags, art ownership, crop, and character spark use
  the compatibility defaults already present in `cards.toml`.
- Exploration maps each effect-kind, mechanic, policy, control, resource, and
  predicate enum through an explicit exhaustive match. Effect definitions
  become `[[effect-kind]]` entries; typed default wrappers such as `Integer(1)`
  and `Text("character")` become ordinary TOML values. Each action-effect
  variant becomes its kebab-case `effect-kind` plus the fields valid for that
  variant. `TemplateInvocation.id`, `variables`, and `selections` become
  `template-id`, `template-variables`, and `selection`; an omitted variables
  map materializes as `{}` because that is the established TOML shape. Field
  key enums use the current camelCase editor keys, not a generic case rule.

The compatibility models use ordered vectors and maps or a deliberate TOML
document builder. Source models use ordered maps for document-order-sensitive
data, including the enum-keyed Draft maps and recursive Exploration template
objects. Hash-map iteration, key sorting that changes authored order, and
serializer-dependent table ordering are outside the output contract.

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
- `stage-edit`: apply one editor operation or ordered operation batch to staged
  RON sources and produce the corresponding staged TOML.

The binary accepts the repository root explicitly for tests and worktrees. It
resolves and validates every path before reading or writing and refuses targets
outside manifest-approved roots. Machine callers request structured JSON
diagnostics; interactive use receives concise human-readable diagnostics. The
Node launcher builds the locked crate on cache miss and invokes the cached
binary directly for subsequent watch and editor operations.

Compilation reports dataset ID, source path, dataset schema version,
compatibility-adapter version, source hash, generated hash, duration, and
whether the output differs. It never emits game data values or authored copy
into routine logs.

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
changed files are moved into place with same-filesystem atomic renames. A
repository lock, transaction journal, and backups coordinate multi-file
publication. An in-process failure rolls back completed replacements; startup
recovers an interrupted journal before any reader runs. Watch and HMR events
are released only after the journal commits.

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

### Revisions and write serialization

Every editor load returns the confirmed compatibility data and a
`sourceRevision`. This is a SHA-256 over the ordered bytes of every canonical
writable source represented by that editor surface. The Cards revision covers
the card catalog plus its tag and tide registries. The Exploration revision
covers the catalog plus the encounter-template source. It is distinct from the
existing `clientRevision`, which remains an echoed browser request number used
only to ignore an old response.

Every save includes both revisions. The browser maintains one promise queue per
selected source and sends saves in order, updating `sourceRevision` after each
confirmation. Optimistic UI may continue while a save is queued. A failed save
pauses that queue, discards later unsubmitted operations, and reloads confirmed
data before accepting another edit.

The middleware also serializes writes by dataset and acquires the repository
transaction lock. After acquiring the lock it rereads the canonical sources and
recomputes `sourceRevision`. A mismatch returns HTTP 409 with
`STALE_SOURCE`, the current revision, and the current confirmed record or
editor payload. It performs no automatic merge and writes no files. This makes
manual edits, a second browser tab, and another local process deterministic.

### Editor operation vocabulary

The browser API retains its current compatibility-facing field names. The Node
middleware validates those values, then translates them into a closed,
dataset-specific Rust operation. `stage-edit` accepts one operation or an
ordered batch as JSON on standard input and writes only beneath the supplied
staging root. It never edits the working tree itself.

The initial Cards operations are:

- `set_card_field`, identified by card UUID, for `name`, `rules`,
  `energy_cost`, `card_type`, `subtype`, `spark`, `tags`, `tides`,
  `image_number`, and `art_crop`;
- `upsert_facet`, identified by facet kind and target name, to add an entry or
  update its color; and
- `delete_facet`, identified by facet kind and name, which removes the registry
  entry and that exact value from every affected card in the same staged batch.

The middleware maps `rendered-text` to `rules`, `energy-cost` to
`energy_cost`, `image-number` to `art.image`, and `art` to `art.crop`.
`energy_cost` accepts exactly the source model's `Fixed(n)`, `Variable`, and
`FixedAndVariable(n)` shapes; the browser accepts `n`, `X`, and `n,X` and sends
the typed operation. `name`, rules, tags, image, and crop update their direct
source fields. Empty tags and tides are written explicitly as empty lists by
the editor rather than deleting an authored field.

Card type, subtype, and spark are three views of the single `kind` value:

- changing Character to Event replaces the complete `Character(...)` value
  with `Event`; generated subtype and spark become their established blank
  compatibility values;
- changing Event to Character creates `Character(subtype: "", spark: None)`;
- changing subtype or spark on a Character patches that nested field;
- blank Character spark writes explicit `None`, which is valid with
  `implicit_some`; and
- nonblank subtype or spark edits on an Event fail with
  `FIELD_NOT_APPLICABLE`. The migrated UI disables those controls for Events.

The current `cards.ron` candidate has no `tides` field, while the Cards editor
already exposes per-card tides. Cards source schema version 2 adds a defaulted
`tides: Vec<String>` field and the adapter emits the compatibility key when it
is nonempty. The compiler may accept version 1 for read-only conversion during
the transition, but the manifest enables Cards editor capability only for
version 2. Tag and tide registry files become manifest datasets with stable
registry-entry operations; they are not edited as unregistered sidecar paths.

The existing registry PUT endpoint may remain compatibility-shaped. The
middleware diffs its submitted ordered list against the confirmed registry and
translates it into an ordered upsert/delete batch. A removed name retains the
current cascade behavior; a newly named entry is an addition rather than an
implicit rename.

The initial Exploration operations are:

- `set_encounter_prose`, identified by encounter card UUID;
- `replace_action`, identified by encounter card UUID, slot 0 or 1, and the
  expected current action ID; and
- `replace_template`, identified by template ID, with the complete set of
  affected normalized actions included in the same operation batch.

`replace_action` accepts the current compatibility-shaped editor action after
TypeScript normalization. Rust exhaustively maps `effectKind` and its allowed
fields to one typed action-effect enum variant. Unknown fields, a missing
required field, or a field belonging to another variant fail before patching.
It maps the template ID, variables, and selections into one
`TemplateInvocation`. The current action ID must equal the request's expected
action ID, so a reordered or replaced slot cannot be overwritten accidentally.

The current `exploration.ron` candidate does not carry per-action selection
policy overrides, while the Exploration editor exposes that control. Before
editor cutover, Exploration source schema version 2 adds a defaulted optional
`selection_policy` enum to `ActionDefinition`. The compiler may compile version
1 read-only, while editing requires version 2. The adapter emits
`selection-policy-id` when authored. `canonicalMechanicId` remains derived from
the selected effect definition: Rust validates a compatibility request's value
when present but does not duplicate it in RON.

Template text remains in its existing template source. A template save first
uses the current TypeScript template logic to compute every affected action's
effect text, variables, and selections. The transaction stages that template
source and sends the resulting ordered `replace_action` batch to Rust. One
invalid action rejects the complete template save.

### `stage-edit` execution contract

For each operation batch, the middleware and Rust tool perform these steps:

1. Node validates the HTTP body, references, and editor-level normalization.
2. Under the transaction lock, Node verifies `sourceRevision` and copies every
   writable canonical source to the staging root.
3. Rust strictly deserializes the staged RON into the versioned dataset type and
   rejects duplicate identities before locating a target.
4. Rust applies the operation to an in-memory clone to produce the exact
   intended typed result.
5. The span index creates a non-overlapping byte replacement plan against the
   original staged source and applies replacements from highest offset to
   lowest.
6. Rust strictly deserializes the patched source and requires it to equal the
   intended typed result. It also verifies that bytes outside the declared
   replacement ranges are unchanged.
7. Rust compiles staged TOML; Node runs the existing TypeScript compilers,
   reference checks, and derived-JSON generation against the staged paths.
8. The publication transaction commits all canonical RON, template or registry
   sources, generated TOML, and derived JSON, then returns a new
   `sourceRevision` and the confirmed compatibility record.

Any failure before publication leaves working-tree sources unchanged. A
publication failure follows the journal and recovery contract in Deterministic
conversion. Watch and HMR notifications are emitted only after confirmation.

### Span index and patch rules

The span index is a lossless, byte-oriented companion to the official semantic
parser. Its lexer recognizes the pinned RON grammar: extension attributes,
identifiers, every numeric form, characters, ordinary and raw strings, byte
strings, range tokens, commas, whitespace, line comments, and nested block
comments. Its delimiter tree records exact spans for structs and enum payloads,
sequence elements, map entries, named fields, field values, separators, and
leading and trailing trivia. UTF-8 byte offsets are converted to line and
column only for diagnostics.

Schema-specific traversal interprets that tree. Cards are located only as
elements of root `cards` whose direct `id` field equals the requested UUID.
Exploration encounters are located only in root `encounters` by direct
`card_id`; actions are then selected by validated slot and action ID. A UUID
inside comments, prose, rules, template metadata, or a nested object is never a
locator. Missing and duplicate targets are errors.

Patch construction follows fixed rules:

- An existing scalar, collection, enum, or struct field edit replaces only the
  field's value span. The field name, comma, indentation, and surrounding
  comments remain untouched.
- A nested edit, such as Character spark or art crop, replaces the narrowest
  existing nested value. A variant change replaces the containing enum value,
  not the complete card record.
- A missing field is inserted according to the source schema's canonical field
  order, immediately before the next present field's leading trivia. If there
  is no later field, it is inserted before the struct's trailing trivia and
  closing delimiter. Indentation and newline style come from sibling fields.
- Editor operations write explicit `None` or empty collections for edited
  default values. They do not delete fields, so a save cannot orphan a field
  comment.
- Exploration action saves replace only the values of `label`, `effect_text`,
  `effect`, `selection_policy`, and `template`, inserting the optional policy
  field when required. The action ID and other top-level field trivia remain
  untouched. An attempted action-ID change is rejected.
- If a replacement span itself contains a comment, the patch proceeds only
  when the operation can update narrower child values and retain that comment.
  A shape change that would discard or ambiguously relocate it fails with
  `COMMENT_CONFLICT` and names the source path. There is no whole-document or
  whole-record serialization fallback.
- A semantic no-op returns the existing bytes and does not trigger TOML, JSON,
  watcher, or HMR writes.

New values use dataset formatting rules. Card rules use a raw string with the
minimum safe hash delimiter. One-line prose, labels, and effect text use escaped
strings; multiline values use raw strings. Tags and tides remain inline string
lists, crop remains an inline anonymous struct, and named enum or struct
payloads use four-space indentation with trailing commas. Existing values keep
their authored spelling and layout until that value is edited.

Before editor migration begins, the span index must reproduce all three current
RON candidates byte-for-byte and pass mutation fixtures covering every rule
above. A third-party lossless parser may replace it only after passing the same
corpus and mutation suite.

### Editor error contract

Editor failures use stable codes and source paths:

- `STALE_SOURCE` (409) for a revision mismatch;
- `RECORD_NOT_FOUND` (404) for a missing stable identity;
- `FIELD_NOT_APPLICABLE` or `INVALID_EDIT` (400) for an invalid operation;
- `COMMENT_CONFLICT` (409) when preservation prevents a shape-changing edit;
- `MALFORMED_SOURCE` or `COMPATIBILITY_VALIDATION_FAILED` (422) for RON,
  adapter, TOML, or TypeScript validation failures; and
- `PUBLICATION_FAILED` (500) for a transaction failure, with recovery status
  included in the response.

Diagnostics include dataset ID, canonical source, record locator, semantic
field path, and RON line and column when available. They do not include full
authored records or copy.

## Migration strategy

Migration proceeds in independently reviewable dataset batches.

### Foundation

Add the Rust crate, toolchain pin, manifest, Node orchestration, deterministic
serializer, staging validation, ignore rules, clean-checkout generation test,
and build/dev/review integration. The manifest initially declares TOML-backed
datasets as migration inputs without changing their canonical files.

### Representative proof

Implement the first three source modules and adapters against the checked-in
`draft.ron`, `cards.ron`, and `exploration.ron` candidates while their TOML
counterparts remain the tracked compatibility oracle. This proof covers compact
enum-keyed configuration, the complete 521-card catalog, and the complete typed
Exploration catalog rather than smaller look-alike fixtures.

The proof must establish deterministic TOML on macOS and Linux, structured
errors, staged TypeScript validation, content-aware publication, and full
semantic parity before any of the three files becomes canonical. Draft can cut
over after this read/build proof. Cards and Exploration additionally require the
editor feasibility gate and editor integration tests.

A synthetic source-schema fixture covers typed constructs absent from these
three catalogs, including tuple variants, explicit options, ranges, typed map
keys, chars, byte strings, heterogeneous enum collections, and numeric edge
cases. It proves that rich RON values pass through typed adapter lowering rather
than a TOML-shaped generic value restriction.

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
canonical source. A mixed migration build uses explicit manifest state; each
individual editor points at only one canonical source.

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
2. use the checked-in RON candidate or mechanically create one while retaining
   record order, domain values, and meaningful comments;
3. generate compatibility TOML from RON;
4. run that TOML through the same TypeScript pipeline; and
5. deep-compare dataset-defined semantic projections and byte-compare
   deterministic JSON artifacts where the current pipeline is deterministic.

Differences are classified before the cutover. Formatting and the generated
header may differ in TOML. Compiler outputs, UUID references, record order,
string code points, and runtime artifacts must agree. Parsed TOML values also
agree except for adapter-declared normalizations that the existing TypeScript
compiler maps to the same result, such as the two numeric-string Card values
represented by `Fixed(2)`. Filesystem-dependent art discovery is compared
through stable logical asset references, not machine-specific absolute paths or
symlink metadata.

These production-data comparisons are migration commands and review evidence,
not permanent CI tests. Permanent tests use synthetic fixtures so routine game
data changes do not fail tests by changing mutable production values.

For remaining datasets, the TOML-to-RON migration utility carries leading,
field, inline, and record-boundary comments through a syntax-aware TOML document
model. A review report lists comments it cannot attach unambiguously. The
dataset cuts over after those cases are intentionally placed in RON.

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
- byte-identical span indexing for every current production RON source;
- direct and nested field replacement, canonical insertion, explicit defaults,
  non-overlapping batch application, and semantic no-ops;
- stable-identity lookup that ignores UUID-like text in comments and values;
- Cards field-to-domain transformations, including every energy and kind
  variant plus the version 2 defaulted tides field;
- Exploration prose and action transformations across unit and struct effect
  variants plus the version 2 action selection policy;
- comment preservation plus deterministic `COMMENT_CONFLICT` rejection for
  unsafe shape changes.

Official RON parser fixtures are included or referenced at their pinned version.
Dataset tests demonstrate each rich construct that the source schema uses and
its exact compatibility representation.

### TypeScript and integration tests

Synthetic fixtures cover:

- orchestration of Rust staging, TypeScript validation, and publication;
- clean-checkout generation before build and tests;
- focused validation against staged paths;
- rollback after Rust, TypeScript, JSON, or filesystem failure;
- startup recovery of an interrupted publication journal;
- debounce and watcher convergence without reload loops;
- targeted HMR after a valid RON edit;
- last-valid-data behavior after an invalid RON edit;
- editor reads from generated TOML and writes canonical RON;
- source and client revision separation, per-source browser queuing, confirmed
  revision advancement, and stale-source rejection;
- stable-ID edit routing, action slot plus ID validation, registry diffing, and
  facet-removal cascades;
- ordered template resynchronization as one all-or-nothing operation batch;
- structured editor error responses and confirmed-data reload after a failed
  save; and
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
- Draft, Cards, and Exploration pass typed-deserialization and adapter parity
  against their checked-in RON candidates;
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
- A source construct is never rejected solely because TOML lacks a direct
  representation; its dataset adapter supplies the compatibility encoding.
- Editor saves update canonical RON by stable ID and preserve unrelated source
  bytes.
- Every editor save is a declared dataset operation with an expected source
  revision; stale writes fail without mutation.
- Shape-changing edits preserve comments through narrower patches or fail with
  `COMMENT_CONFLICT`; serialization is never used as a silent fallback.
- RON, TOML, and derived JSON editor writes use atomic per-file replacement and
  a recoverable transaction that rolls back failures.
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
- Source-preserving RON editing requires a maintained lexer, span index, and
  closed operation vocabulary in addition to Serde models. Each new editor
  control needs an explicit source operation and comment-safe patch strategy.
  `COMMENT_CONFLICT` makes the unsupported cases visible instead of risking
  source loss.
- Per-source save queues trade parallel field writes for deterministic revision
  handling. Saves are local and small, and the measured RON parse cost leaves
  ample latency budget for serialization.
- Ignored generated TOML can surprise developers running low-level scripts.
  Supported entry points materialize it, generated headers explain ownership,
  and bypassed scripts fail with a direct recovery command.
- Watch mode spans Rust conversion, TypeScript validation, TOML publication,
  JSON generation, and HMR. Dataset-level debounce, content-aware writes, and
  staging prevent loops and partially published states.
- Large syntax-conversion commits affect history navigation. Dedicated
  mechanical commits and `.git-blame-ignore-revs` keep later blame useful.

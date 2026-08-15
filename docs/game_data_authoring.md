# Game data authoring

The canonical game-data catalogs are the manifest-declared `.ron` files under
`data/`. `data/game-data-manifest.ron` assigns each dataset its source schema,
compatibility adapter, dependencies, generated TOML path, refresh behavior,
editor capability, and stable-identity strategy.

The pinned Rust compiler in `tools/game-data/` uses the official `ron` and
Serde implementations. It lowers canonical sources to deterministic TOML at
the established compatibility paths. TypeScript tools and browser code consume
that generated TOML or the JSON artifacts built from it.

Datasets with representation changes use bespoke Rust source models and
adapters. Atlas, Cards, Draft, Dream Guides, and Exploration are in this category: their
adapters exhaustively map enums, variants, defaults, and compatibility field names.
Shape-preserving catalogs use the manifest-declared compatibility-document
adapter. That adapter retains the parsed ordered TOML value exactly, avoiding a
second hand-maintained schema beside the production TypeScript compiler. The
same staged TypeScript validators that build runtime artifacts remain
authoritative for those catalogs' field and cross-catalog contracts.

Field-level guidance carried by the catalogs is retained in
[`game_data_schema_notes.md`](game_data_schema_notes.md). Keep durable semantic
guidance there because whole-document editor serialization preserves values and
collection order rather than comment placement.

## Commands

```bash
npm run game-data:list        # inspect the resolved manifest
npm run game-data:compile     # validate and publish generated TOML and JSON
npm run game-data:check       # verify visible generated data is current
npm run game-data:rust-test   # compiler, adapter, and edit-operation tests
npm run game-data:clean-test  # generation with an empty TOML cache
npm run regenerate-assets     # complete repository asset regeneration
```

Normal development, review, build, regeneration, and deployment entry points
run the generation gate before consuming game data. Generated TOML carries a
header with the source hash, compiler build fingerprint, adapter version, and
manifest fingerprint. Generated TOML is gitignored and is replaced by the next
compile, so edits belong in the manifest-listed RON source.

Vite watches the canonical RON paths. A valid save is compiled and validated in
a staging root, published atomically, and handed to the existing focused data
refresh. An invalid save keeps the confirmed TOML and runtime JSON in place and
reports the dataset, source, and RON parser or compatibility error. Correcting
the source resumes the same watch path.

Player-facing text changes in canonical RON require the ordinary
`npm run review` authoring check. Vite builds a current English localization
catalog in a temporary workspace for development. Localization reports and
runtime bundles are ignored release artifacts produced by
`npm run trox:release` and by the deployment pipeline.

## Editor writes

Local browser editors load generated compatibility data and submit semantic
operations with a SHA-256 `sourceRevision`. Middleware serializes writes under
the repository game-data lock, verifies the revision, stages the declared
operation through Rust, runs TypeScript validation, and publishes canonical
RON, generated TOML, and owned JSON as one recoverable transaction. A stale
revision returns `STALE_SOURCE` without writing.

Cards uses UUID-routed card-field operations and ordered tag/tide registry
diffs. Exploration uses UUID plus action-slot/action-ID routing. Each action
stores its label, effect text, optional followup copy, and typed effect together
in `data/exploration_site.ron`. Selection policy and canonical mechanic values are
derived from the typed effect variant.

Shape-preserving editor catalogs reuse their established endpoint-specific
request validation and mutation logic inside the isolated staging root. Rust
adopts the resulting compatibility document only after its staged hash is
confirmed; the shared pipeline then runs the production TypeScript validators
and publishes the RON, TOML, and derived artifacts as one transaction. This
keeps one domain schema while retaining the same editor behavior.

The official serializer formats a complete document after a semantic edit.
Typed values, stable identities, strings, and collection order are preserved;
arbitrary whitespace is not an editor contract. Durable authoring guidance
belongs in schema documentation or this guide.

If a process stops during publication, the next compiler or editor invocation
uses `.game-data-transaction.json` and its private backup directory to restore
the confirmed transaction before continuing.

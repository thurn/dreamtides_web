# Game data migration parity

The RON migration covers every dataset declared in
`data/game-data-manifest.ron`. `npm run game-data:parity` compiles current RON,
parses each generated compatibility document through the production TOML
parser, compares it with the tracked pre-migration document at the master merge
base, preserves array order, and checks tracked runtime JSON artifacts byte for
byte.

The parity command validates all 26 catalogs: affiliations, Apollyon
incarnations, Atlas, Augury, Cards, card tags, card tides, Draft, Dream Avatars,
Dream Guides, Dreamscapes, Dreamsign profiles, Dreamsign signatures,
Dreamsigns, Dreamsign tags, Dreamwell, economy, Exploration, Exploration
candidates, Figments, glossary, opponents, reward selection, sites, tutorial,
and the tutorial journey pool.

Two established Cards values had unambiguous numeric spelling errors. Runtime
semantics remain numeric in both cases:

- Card UUID `29d25251-8b42-4d3d-97e6-6c3abaabd9a2`: `energy-cost` is integer 2.
- Card UUID `229ab3a1-3720-41a2-924c-8fe112188f8e`: `spark` is integer 2.

The reviewed RON formatting uses the pinned official serializer for editor
round trips. Durable catalog comments and their compatibility-field anchors are
collected in [`game_data_schema_notes.md`](game_data_schema_notes.md); bespoke
adapter contracts are additionally represented by typed source field names and
Rust schema definitions. Record order, UUID
references, string code points, parsed compatibility values, and deterministic
runtime artifacts are parity contracts.

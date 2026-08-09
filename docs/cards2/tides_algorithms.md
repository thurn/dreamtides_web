# Tides4 draft-pool construction

Tides4 builds each Dream Avatar's 150-card draft pool from preconstructed decks
called tides. Designers curate tide identities, card membership, and Dream
Avatar pool composition directly in `data/tides.ron` and
`data/dream_avatar_tide_pools.ron`. Tide, card, and Dream Avatar references use
UUIDv4 identities.

## Tide catalog

The catalog defines three tide roles:

- A signature tide captures the stable core for one signed Dream Avatar.
- Facet tides capture coherent leans sampled for run-to-run variety.
- Neutral tides provide broad, reusable fill for every pool.

Each tide contains its player-facing display name and description, color, role,
and an ordered list of card UUIDs with copy counts. `data/tides.ron` is a flat
top-level list of these definitions. `data/dream_avatar_tide_pools.ron` is a
flat top-level list of per-avatar signature, facet, and neutral composition.
The game-data compiler validates UUIDs, role-correct pool references, complete
Dream Avatar coverage, and card-catalog references, then generates one TOML
projection for each source. The tides and Dream Avatar editors publish
revision-checked semantic operations to the owning canonical RON source.

## Runtime construction

`src/draft/pool/variant-tides4.ts` performs the seeded runtime deal:

1. Join the selected Dream Avatar's signature tide. A signatureless avatar
   borrows a seeded signature archetype.
2. Draw a seeded subset of that archetype's facet tides, bounded by the current
   `maxFacets` tuning.
3. Join neutral tides until the combined decks contain enough dealable copies.
4. Shuffle the combined card bag and deal 150 cards while enforcing the
   configured per-card copy cap.

Journey seeds are hashed with the Dream Avatar UUID, so a pool is reproducible
for a fixed journey seed and avatar. Runtime provenance records the joined tide
UUIDs, tuning, per-tide contribution, and each card's primary source tide.

## Data flow

`scripts/setup-assets.mjs` composes generated `data/tides.toml` and
`data/dream_avatar_tide_pools.toml` into `public/tides4-data.json`. Runtime
loading validates that browser projection in `src/draft/pool/tides4-io.ts`
before pool construction.

## Historical archive

Historical draft-pool implementations and their supporting data, tools, and
design notes are archived by Git commit
`0457e320ad07813934f5c4683eb9da7cd28994f1`. Inspect that commit's parent to read
their final source, or the commit diff to see the complete retirement.

# Tides4 draft-pool construction

Tides4 builds each Avatar's 150-card draft pool from preconstructed decks
called tides. Designers curate tide identities, card membership, and Dream
Avatar pool composition directly in `data/tides.ron` and
`data/avatars.ron`. Tide, card, and Avatar references use UUIDv4
identities.

## Tide catalog

The catalog defines three tide roles:

- A signature tide captures the stable core for one signed Avatar.
- Facet tides capture coherent leans sampled for run-to-run variety.
- Neutral tides provide broad, reusable fill for every pool.

Each tide contains its player-facing display name and description, an Augury
package reference localized as a complete grammatical phrase, resonance, kind,
and an ordered map of card UUIDs to copy counts. `data/tides.ron` also owns the
universal top-band selection fraction and minimum. Every Avatar owns its
signature, facet, and neutral composition in its `tide_pool` field. The
game-data compiler validates UUIDs, kind-correct pool references, complete Dream
Avatar coverage, and card-catalog references. The tides and Avatar editors
publish revision-checked semantic operations to the owning canonical RON source.

## Runtime construction

`src/draft/pool/variant-tides4.ts` performs the seeded runtime deal:

1. Join the selected Avatar's signature tide. A signatureless avatar
   borrows a seeded signature archetype.
2. Draw a seeded subset of that archetype's facet tides, bounded by the current
   `maxFacets` tuning.
3. Join neutral tides until the combined decks contain enough dealable copies.
4. Shuffle the combined card bag and deal 150 cards while enforcing the
   configured per-card copy cap.

Journey seeds are hashed with the Avatar UUID, so a pool is reproducible
for a fixed journey seed and avatar. Runtime provenance records the joined tide
UUIDs, tuning, per-tide contribution, and each card's primary source tide.

## Data flow

`scripts/setup-assets.mjs` composes generated `data/tides.toml` and
`data/avatars.toml` into `public/tides4-data.json`. Runtime
loading validates that browser projection in `src/draft/pool/tides4-io.ts`
before pool construction.

# Tides4 draft-pool construction

Tides4 builds each Dream Avatar's 150-card draft pool from preconstructed decks
called tides. The committed artifact is `data/tides4.jsonc`; its readable card
lists are generated in `docs/cards2/tides4_decklists.md`.

## Artifact construction

`npm run bake-tides4` derives the artifact deterministically from the canonical
card catalog, Dream Avatar signatures, and adapted draft records. The bake builds
an availability-corrected pick corpus keyed by card UUID and emits three tide
roles:

- A signature tide captures the stable core for one signed Dream Avatar.
- Facet tides capture coherent leans around individual signature anchors.
- Neutral tides provide broad, reusable fill for every pool.

Authored membership adjustments live in `data/tides4-overrides.jsonc`. Display
names, descriptions, colors, and claims are preserved by tide id across bakes.
Run `npm run check-tides4` to verify that the committed artifact matches a fresh
bake, and `npm run check-tide-annotations` to validate its player-facing labels.

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

`scripts/regenerate-assets.sh` bakes the artifact, copies it to the browser's
generated `public/tides4-data.json`, regenerates the readable decklists, and runs
the freshness and annotation checks. Runtime loading validates the artifact in
`src/draft/pool/tides4-io.ts` before pool construction.

## Historical archive

Historical draft-pool implementations and their supporting data, tools, and
design notes are archived by Git commit
`0457e320ad07813934f5c4683eb9da7cd28994f1`. Inspect that commit's parent to read
their final source, or the commit diff to see the complete retirement.

# Dream Merchant — explainability logging

This system makes the Dream Merchant's offer decisions reconstructable from
`logs/journey-log.jsonl` alone. For a given game (filter by `gameId`) a reader can
answer, without opening source:

1. **Why is this dreamsign here?** — which sign was offered, which pool tier it
   came from, its match score and coverage, the band, and the candidates it
   outscored.
2. **How did these cards get picked?** — for every grant/draft offer, the scored
   candidate set with component breakdowns and any cold-start fallback.

## Where the work happens

The builders (`src/journey_v2/archetypes/*.ts`) stay pure: each one computes its
scores, then assembles a {@link MerchantOfferTrace} (`src/journey_v2/trace/`)
from the score maps it already has — no clock, no RNG, no logger. The trace
rides on the `MerchantOfferDraft` through encounter assembly. The React boundary
(`src/components/ScreenRouter.tsx`) is the only place that writes log lines.

## Events

Two events, emitted once per encounter signature (cross-linked by
`encounterSignature`):

### `merchant_encounter_generated`

The encounter-level summary. Fields:

- `siteId`, `encounterSignature`, `offerCount`.
- `deck` — a {@link MerchantDeckSnapshot}: `size`, sorted `cardNumbers`, a
  content `hash`, and `features` (per-type / per-subtype / per-cost-band /
  per-keyword tallies). This is the exact deck the scorers ran against, emitted
  once because both offers share it. Per-offer lines back-reference it by
  `deckSize` + `deckHash`.
- `debug` — eligibility and the roll sequence: `eligibleArchetypeIds`, the final
  `rolledA` / `rolledB`, and `rollsA` / `rollsB`, the ordered build attempts per
  slot. A `{ built: false }` entry is a **dead roll** — an eligible builder that
  returned null and was dropped before the slot redrew — so dead rolls are not
  invisible. `forcedArchetypeId` records a debug-forced slot-A archetype.

### `merchant_offer_built`

One per offer (`A` and `B`). Fields:

- `siteId`, `encounterSignature` (join key), `offerId`, `archetypeId`, `family`,
  `targetKey`, `isChooser`.
- `deckSize`, `deckHash` — back-reference to the encounter's deck snapshot.
- `trace` — a {@link MerchantOfferTrace} (below).

## The trace shape

Every archetype is a `score → band → sample` pipeline, so one candidate shape
serves all of them; what differs is captured by a small `decision` tag and a few
optional fields.

- `decision` — how the target was chosen (groups generators that decide alike):
  - `scored_cards` — grant family; blends quality/fit over the unowned grant
    pool. Components: `quality`, `fit`.
  - `dreamsign_match` — dreamsign family; ranks a tiered coverage pool.
    Components: `meanCoverage`, `featureCount`, `qualityWeight`, `featureless`.
    The tier is in `dreamsignTier` (`covered` / `generic` / `fallback`).
  - `deck_entry_rank` — `duplicate` (blends `quality`/`fitLoo`) and `purge`
    (ranks by `misfit`, with a starter bonus and a leave-one-out threshold) rank
    existing deck entries.
  - `entry_modification` — improve family; picks an (entry, modification) pair.
    `transfigure` blends `benefit`/`centrality`; `tribal_change` ranks by
    `centrality`; `keyword_mod` and `starter_transfigure` sample uniformly.
  - `uniform` — `add_site` samples a site type with equal weight.
- `keyKind` — what a candidate `key` denotes: `cardUuid`, `dreamsignId`,
  `entryId`, `entryModification` (`${entryId}:${variant}`), or `siteType`.
- `band` — `poolSize`, `bandSize`, `bandFraction`, `bandMinimum`,
  `selectedCount`. `bandSize` mirrors `bandSample`'s sizing, so the `inBand`
  flags match what the builder actually sampled from.
- `candidates` — scored candidates sorted by score descending. Each has `key`,
  optional id fields (`cardUuid` / `cardNumber` / `dreamsignId` / `entryId`), an
  optional non-authoritative `displayName`, `score`, optional `components`,
  `inBand`, and `selected`.
- `candidateCount` / `truncated` — large grant pools (hundreds of cards) keep
  every selected candidate plus the top runners-up (cap 12). `candidateCount` is
  the full pre-truncation size; `truncated` flags that the list was bounded.
- `coldStartQualityFallback` — grant blends fell back to quality-only because the
  deck was below `minDeckForFit`.
- `blend` — the tuning blend weights actually applied to the score.
- `notes` — free-form, for sub-decisions that don't fit the candidate grid:
  - `category_draft_known`: the chosen `category`, its `deckAffine` flag, sample
    weight, and the offerable-category count.
  - `card_bundle`: `bundleSize`, the `seed` card, and the `grown` card UUIDs
    (the trace's candidate grid is the **seed** decision; growth uses a separate
    co-occurrence band per step).
  - `purge` / `purge_replace`: `looThreshold`, `purgeMisfitFraction`,
    `starterPurgeBonus`, and (for `purge_replace`) the fixed removal target.
  - `transfigured_draft`: the chosen `${cardUuid}:${transfiguration}` per pick.
  - `tribal_change`: the active tribes. `starter_transfigure` / `keyword_mod` /
    `add_site`: `uniform`.

## Why this grouping

A flat per-archetype schema would either bloat (every generator carrying every
other generator's fields) or under-serve (a shared field meaning different things
in different rows). Instead, the five `decision` values are the *actual* distinct
decision procedures in the builder set, and the candidate grid is their common
denominator — every generator ranks keyed candidates by a number. Components,
branch flags, and `notes` carry the per-generator specifics on top. The deck
snapshot lives on the encounter event (shared by both offers) and the score
*inputs* that the snapshot derives (coverage, fit, quality) ride on each
candidate's `components`, so a single offer line is self-explanatory while the
raw deck tallies are one join away.

## Worked queries

Isolate one game first; every line carries the ambient `gameId`.

**"Why is this dreamsign here?"**

```bash
grep '"gameId":"<id>"' logs/journey-log.jsonl \
  | grep '"event":"merchant_offer_built"' \
  | grep '"archetypeId":"dreamsign"'
```

The line's `trace.dreamsignTier` says which pool the sign came from
(`covered` = a genuine deck match), `trace.candidates` lists every sign
considered with its `score` and coverage `components` (so you see what the
selected sign — `"selected":true` — outscored), and `trace.band` shows the
sampling band. For the raw deck features that drove coverage, join to the
encounter line by `encounterSignature` and read its `deck.features`.

**"How did these cards get picked for game id 123?"**

```bash
grep '"gameId":"123"' logs/journey-log.jsonl \
  | grep '"event":"merchant_offer_built"' \
  | grep '"family":"grant"'
```

Each line's `trace.decision` is `scored_cards`; `trace.candidates` gives the
scored set with `components` (`quality`/`fit`) and `selected` flags, and
`trace.coldStartQualityFallback` flags a small-deck quality-only ranking.
`trace.candidateCount` vs `trace.candidates.length` (and `trace.truncated`) tell
you whether the candidate list was bounded.

**Which rolls died before the offer landed?**

```bash
grep '"gameId":"123"' logs/journey-log.jsonl \
  | grep '"event":"merchant_encounter_generated"'
```

`debug.rollsA` / `debug.rollsB` list each build attempt in order; `built:false`
entries are eligible archetypes whose `build` returned null and were redrawn.

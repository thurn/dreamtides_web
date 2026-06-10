# Tides and tides2 draft-pool algorithms

Two draft-pool algorithms build a Dreamcaller's 200-card draft pool by combining
a small number of preconstructed decks called **tides**. Both are selectable
with the `?algo=` URL parameter (`?algo=tides`, `?algo=tides2`) and exist side by
side so they can be compared directly:

| | `tides` | `tides2` |
| --- | --- | --- |
| Tide decks | `data/tides.jsonc` (32, ~160 copies each) | `data/tides2.jsonc` (32, ~70 copies each) |
| Relationships | none | `data/tides2_relationships.jsonc` |
| Lead tide | one of the Dreamcaller's *favored* tides | drawn from the Dreamcaller's curated *tide pool* |
| Fill tides | drawn uniformly at random | the lead's curated *allied tides* |
| Bake | `npm run bake-tides` | `npm run bake-tides2` + `npm run seed-tide-relationships` |
| Runtime module | `src/draft/pool/variant-tides.ts` | `src/draft/pool/variant-tides2.ts` |
| Rendered decklists | `docs/cards2/tide_decklists.md` | `docs/cards2/tides2_decklists.md` |

Each algorithm has two halves: an **offline construction** step that bakes the
committed tide lists from real draft data, and a **runtime** step that combines
those lists into one pool. This document covers both halves for both algorithms.

## 1. Shared foundations

Both algorithms rest on the same primitives.

### The decklist corpus and IDF cosine

`scripts/setup-assets.mjs` bundles every real player decklist from
`docs/draft_records_adapted/` into `public/decklists-data.json` (one inner array
of card names per deck). `idfCorpus` (`src/draft/pool/variant-idf.ts`) filters
those decks by size and computes an **inverse document frequency** weight for
each card: a card in too few or too many decks carries no similarity signal,
while a card that is distinctive of some decks carries a high weight. The
similarity between two card collections is the **IDF-cosine**: the dot product of
their IDF-weighted vectors over shared cards, divided by the product of their
norms. This is the same corpus and similarity the `idf`/`idf2`/`idf3` pool
variants grow from, so a tide deck approximates the kind of pool `idf3` grows.

### The tide-deck artifact

A tide deck is a decklist with a stable id (`tide-01`, ...), a human-readable
name, and a list of cards. Cards are keyed by **stable cards_v2 UUID**; the
`name` field is informational and refreshed at bake time, so renaming a card
never invalidates a tide. The schema and its validation live in
`src/draft/pool/tides-io.ts` (`TideDecksJson`, `validateTideDecks`). Both
`data/tides.jsonc` and `data/tides2.jsonc` use this schema. The artifact also
carries `favoredTidesByDreamcaller` (used by `tides`; baked but unused by
`tides2`).

### Pool size, the copy cap, and `dealable`

A pool is 200 copies with at most **2 copies** of any one card
(`POOL_TARGET_SIZE = 200`, `cap = 2`). When deciding whether enough tides have
joined to deal a full pool, the algorithms count **`dealable`** copies — the
copies the deal can actually use, i.e. `min(2, total copies of a card across the
joined tides)` summed over cards — not the raw size of the combined bag. This
matters because overlapping tides share cards: two tides that each run a card at
2 copies contribute only 2 dealable copies of it, not 4, so the combined bag can
be far larger than the dealable count.

### Determinism and the seed

`generatePoolFromData` (`src/draft/pool/generate.ts`) seeds a mulberry32 RNG from
a numeric seed and passes it to the selected variant; every random draw a variant
makes comes from that one RNG in a fixed order. At quest time the seed is
`hash(questSeed:dreamcallerId)`, so a Dreamcaller's pool is reproducible per
`(questSeed, Dreamcaller)`. The offline bake and seed scripts use **no**
randomness at all (deterministic tie-breaks throughout), so re-running them on the
same inputs produces byte-identical files.

## 2. `tides`

### 2.1 Constructing the tide lists (`scripts/bake-tides.mjs`)

`npm run bake-tides` writes `data/tides.jsonc` and the rendered
`docs/cards2/tide_decklists.md`. It is a pure function of the bundled decklists
and Dreamcaller signatures:

1. **IDF corpus.** Build the IDF corpus over the filtered real decklists.
2. **Cluster the corpus into 32 groups.** Deterministic **k-medoids** under
   distance `1 − IDF-cosine`: pick the most central deck as the first medoid,
   add medoids farthest-first until there are `clusters` (32) of them, then
   alternate assignment and recentering until stable. The clusters are then
   **density-balanced** (`balanceClusters`): clusters with fewer than
   `minClusterMembers` (6) decks are dissolved into their nearest neighbour, and
   the largest clusters are split until the count is back to 32. Dense regions of
   the corpus end up with several tides, so the share of tides covering an
   archetype tracks the share of real decks that play it.
3. **Turn each cluster into a tide.** Within a cluster, rank cards by
   `frequency × idf^idfRankWeight` (`idfRankWeight = 2`, which concentrates each
   tide on its cluster's *distinctive* cards), dropping cards below a small
   per-cluster frequency floor. Walk that ranking, giving a card **2 copies**
   when at least `doubleShare` (0.35) of the cluster's decks run it and 1 copy
   otherwise, until the tide reaches about `tideSize` (**160**) copies. The
   tide's name is its medoid deck's two highest-IDF cards.
4. **Favored tides per Dreamcaller.** For each signatured Dreamcaller, score
   every tide by the IDF-cosine of the Dreamcaller's signature cards against the
   tide's card multiset (`probeTideCosine` — the same probe `idf3` uses to find
   its anchor decks) and keep the top `favoredPerDreamcaller` (4), most-similar
   first, as `favoredTidesByDreamcaller[dreamcallerId]`. About 20 of the 32
   Dreamcallers have signatures; the rest ("neutral") get no favored entry.

All dials live in the `TUNING` block at the top of `scripts/bake-tides.mjs`.

### 2.2 Building the pool at runtime (`generateTides`)

`src/draft/pool/variant-tides.ts` reads `poolData.tideDecks` and:

1. **Lead.** Shuffle a copy of the Dreamcaller's `favoredTidesByDreamcaller`
   list and take `favoredDraw` (**1**) favored tide. A neutral Dreamcaller (no
   favored entry) takes no favored lead.
2. **Fill.** Shuffle the remaining tides and join them **uniformly at random**,
   one at a time, until `dealable ≥ 200`.
3. **Deal.** Collect every copy of every card across the joined tides into one
   bag (mapping each UUID to its current name via `poolData.cardNameById`,
   skipping cards no longer in the catalog), Fisher-Yates shuffle the bag once,
   and take cards in bag order — skipping any already at 2 copies — until the
   pool reaches 200.

The result's `selected` label records the algorithm and the joined tide ids for
debugging. (`TIDES` tuning: `favoredDraw 1`, `dealSize 200`, `cap 2`.)

## 3. `tides2`

`tides2` keeps the same deck-bake pipeline but bakes **smaller, purer** tides,
and replaces random fill with **affinity-based selection** driven by a separate,
curated relationship file. The two changes work together: smaller tides carry
fewer off-theme tail cards (so a build-around payoff is less likely to land in a
pool that cannot support it), and affinity fill reinforces the lead's theme
instead of diluting it.

### 3.1 Constructing the tide lists

#### Tide decks (`npm run bake-tides2`)

The same `scripts/bake-tides.mjs` pipeline (section 2.1) writes
`data/tides2.jsonc` and `docs/cards2/tides2_decklists.md`, run with
`--tide-size 70`. The smaller cut keeps each tide focused on the cards most
characteristic of its cluster and drops the long tail of incidental cards that a
160-copy tide would include. The bake derives the variant (`tides` vs `tides2`)
from the output path, so the committed file's header and the rendered doc carry
the correct story. `favoredTidesByDreamcaller` is still baked, but `tides2` does
not read it — its selection comes entirely from the relationship file below.

#### Relationships (`npm run seed-tide-relationships`)

`scripts/seed-tide-relationships.mjs` writes `data/tides2_relationships.jsonc`,
which holds two curated maps (schema and validation in
`src/draft/pool/tide-relationships-io.ts`):

- **`alliesByTide`** — for every tide, an ordered list of allied tides (best
  first), the decks that combine well with it. A pool fills from this list.
- **`tidePoolByDreamcaller`** — for every Dreamcaller (UUID), the tides its lead
  is drawn from.

This script is the **only** place `data/buildaround_support.json` (the
per-card build-around payoff/support metadata) is read. It is run once to seed
the relationships, after which the file is hand-curated and never overwritten by
routine tooling. It refuses to overwrite an existing file without `--force`. It
is deterministic (no randomness; sorted tie-breaks; fixed replay seeds).

**Allies, with trap repair.** For each tide:

1. **Rank by similarity.** Rank the other 31 tides by cosine over their card-id
   multisets (copies as weights). The top `repairCandidates` (18) form the
   candidate window; the cosine top `allies` (6) are the starting ally set.
2. **Repair toward fewer traps.** A *trap* is a build-around payoff that lands in
   a pool which cannot support it — formally, a payoff card whose best needed
   theme has support share below `TRAP_TAU` (0.35) × the theme's demand target
   (10% / 18% / 25% of the pool for tier 1 / 2 / 3). The seeder greedily swaps
   allies in and out of the candidate window, keeping any swap that lowers the
   **mean realized traps** objective, and finally orders the chosen allies so the
   lowest-trap ally leads. "Realized traps" is measured by **replaying the exact
   runtime fill** (section 3.2 — shuffle the ally window, join lead plus allies
   until the pool is full, breadth-first fallback) over `evalSeeds` (24)
   deterministic seeds and counting traps with the build-around metadata. This
   makes the seeder optimize the metric the runtime is actually scored on. Every
   repaired lead is logged.

**Dreamcaller tide pools.**

- **Signatured Dreamcallers** get the top `poolWidthSignatured` (8) tides by
  signature-probe IDF-cosine (`probeTideCosine`), most-similar first — the same
  probe the favored-tide bake uses.
- **Neutral Dreamcallers** get a diverse, representative spread of
  `poolWidthNeutral` (10) tides by **farthest-point sampling** over the tide
  similarity matrix (greedily add the tide least similar to those already
  chosen), with the starting tide rotated per neutral Dreamcaller so each has its
  own overlapping identity.

After writing the JSON, the seeder appends the `Allied tides` and `Tide pools by
Dreamcaller` tables to `docs/cards2/tides2_decklists.md` (after the marker the
bake leaves), so the player-facing decklist file shows the relationships too.

All dials live in the `TUNING` block at the top of
`scripts/seed-tide-relationships.mjs`.

**Validation and the staleness guard.** `validateTideRelationships` requires
every ally id and every tide-pool id to name an existing tide, every tide to have
an ally entry, no tide to ally itself, and every Dreamcaller pool to be
non-empty. Because the relationships are curated against a specific baked set of
tides, re-baking `data/tides2.jsonc` (which can change tide ids or contents)
**invalidates** the relationships: the validator throws on any dangling tide id,
so a stale combination cannot ship silently. Re-baking the decks therefore
requires re-seeding (`--force`) and re-curating.

### 3.2 Building the pool at runtime (`generateTides2`)

`src/draft/pool/variant-tides2.ts` reads `poolData.tides2Decks` and
`poolData.tides2Relationships` and:

1. **Lead.** Shuffle a copy of the Dreamcaller's `tidePoolByDreamcaller` entry
   and take the first id. A missing entry (no Dreamcaller, or stale data) falls
   back to a shuffled draw over every tide so the variant still produces a pool;
   load-time validation flags missing entries, so this should not happen in
   production.
2. **Fill order.** Take the lead's allies, shuffling the front
   `allyShuffleWindow` (6) for run-to-run variety, then the remaining allies in
   baked order. If those cannot fill the pool, continue **breadth-first through
   allies' allies** (each tide deduplicated so it joins at most once). Every
   joining tide is justified by a published relationship — the Dreamcaller's tide
   pool for the lead, the allies lists for the fill — never a uniform-random draw.
3. **Join until full.** Join the lead, then the fill order one tide at a time,
   until `dealable ≥ 200`.
4. **Deal.** Identical to `tides`: build the bag (UUID → current name), one
   Fisher-Yates shuffle, deal 200 with at most 2 copies of any card.

The `selected` label records the algorithm and the joined tide ids. (`TIDES2`
tuning: `allyShuffleWindow 6`, `dealSize 200`, `cap 2`.) The shuffle of the ally
window is what gives a Dreamcaller pool-to-pool variety for a fixed lead, while
the allies' trap-repaired ordering keeps the expected pool low on traps.

## 4. Artifacts, scripts, and served assets

| Artifact | Produced by | Served as (gitignored) | Read at runtime by |
| --- | --- | --- | --- |
| `data/tides.jsonc` | `npm run bake-tides` | `public/tides-data.json` | `tides` |
| `data/tides2.jsonc` | `npm run bake-tides2` | `public/tides2-data.json` | `tides2` |
| `data/tides2_relationships.jsonc` | `npm run seed-tide-relationships` | `public/tides2-relationships-data.json` | `tides2` |

`scripts/setup-assets.mjs` copies each committed `.jsonc` (stripping comments) to
its served path. The browser fetches the served copies through loaders in
`src/data/cards-v2-database.ts` (`loadTideDecks`, `loadTides2Decks`,
`loadTides2Relationships`); `src/data/quest-content.ts` and the
`src/draft_test/DraftTestApp.tsx` harness fetch them only for the variant that
needs them. The metric harnesses
(`scripts/buildaround-support-experiment.mjs`,
`scripts/tides-similarity-experiment.mjs`) read the committed `.jsonc` files
directly.

### Re-bake / re-seed workflow

```bash
# tides
npm run bake-tides            # rewrites data/tides.jsonc + the rendered doc
npm run setup-assets          # copies it to public/

# tides2 (re-seed after any deck re-bake — the validator throws on a stale combo)
npm run bake-tides2                       # rewrites data/tides2.jsonc + the doc
npm run seed-tide-relationships --force   # re-seeds relationships, then re-curate
npm run setup-assets                      # copies both to public/
```

## 5. How they differ in practice

`tides` is the human-legible counterpart of `idf3`: a favored tide plus random
tides reproduces idf3's broad, archetype-mixed distribution. `tides2` trades that
breadth for concentration — smaller, purer tides combined by affinity — to
produce pools that better support the build-around payoffs they contain.

Measured over a 200-seed real-draft simulation (every Dreamcaller, full
signatures; idf3 reference in parentheses), `tides2` improves on `tides` and
`idf3` across the pool-quality metrics:

| Metric | `tides` | `tides2` | `idf3` |
| --- | --- | --- | --- |
| Expected traps per pool | 2.57 | **0.47** | 2.49 |
| Build-around adequacy | 92.9 | **94.0** | 92.9 |
| Diversity headline | 89.2 | **94.6** | 94.4 |
| Survivors buildable rate | 3% | 16% | 16% |

Because `tides2` concentrates each pool on a coherent archetype, its per-card
**frequency similarity to idf3** is lower than `tides`' (it is a stronger
generator, not an idf3 mimic). Run the comparisons with:

```bash
npm run buildaround-metric -- --variant tides2 --seeds 200 --metric traps
npm run buildaround-metric -- --variant tides2 --seeds 200            # adequacy
npm run buildaround-metric -- --variant tides2 --seeds 100 --metric diversity
npm run tides-similarity   -- --a tides2 --b idf3 --seeds 100
```

**Validation independence.** The `tides2` seeder used
`data/buildaround_support.json` once to repair ally lists, so the adequacy and
trap metrics — which score against that same metadata — are not fully independent
validation of `tides2`. The similarity metric and the card-utilization half of
the diversity metric do not read that metadata and remain independent.

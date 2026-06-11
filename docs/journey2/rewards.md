# Dream Merchant Encounter System

The dream merchant in `src/journey_v2` offers the player two free, immediate,
permanent rewards per visit. The player accepts one offer or declines. All
generation is deterministic for a given (quest seed, site id, deck state), and
variance is a measurable, tunable property verified by the metrics harness.

## Encounter Structure

Every generated encounter has exactly two offers, `A` and `B`. Both are free;
there is no pricing, locked state, or payment step. The player accepts at most
one offer or declines; either action completes the site.

Offer selection is a two-stage seeded lottery:

- **Stage 1 — archetype roll.** Eligibility predicates filter the 17 registered
  archetypes against the current deck state. Slot A draws from the eligible set
  by weighted sampling. Slot B draws from the eligible set whose *family* differs
  from slot A's family, ensuring the two offers always pull in materially
  different directions.
- **Stage 2 — target sampling.** Each archetype builds a ranked candidate list
  and band-samples the target (or chooser set) within the top fraction of that
  list.

Any chooser shown to the player contains at most four items. Every offer is
face-up: a draft shows all of its curated candidate cards in the offer body
(each previewable on hover), and the player accepts with a single
accept-with-optional-choice mutation. Picking a draft opens a chooser panel to
select one of the shown cards.

### Regenerate-and-validate

On accept, the encounter is regenerated from current state and validated before
applying the reward. The validation checks encounter signature, offer id, and
archetype id (plus choice membership when the offer carries a chooser). Stale
signatures are rejected without state mutation.

## Seeded Randomness and Band Sampling

All sampling uses SHA-256 over string parts, mapped to uniform floats. Every
draw salts the hash with `(quest seed, site id, slot, purpose)`, keeping draws
independent and reproducible.

**Band sampling** is the target-selection primitive used throughout:

1. Rank candidates by the stated signal, descending.
2. Keep the top `bandFraction` fraction, with a floor of `bandMinimum`
   candidates when the pool is large enough (defaults: `bandFraction = 0.25`,
   `bandMinimum = 5`).
3. Sample uniformly within the band, without replacement when picking multiple
   items.

The band floor delivers "plausibly want it"; uniform sampling within the band
delivers "never know what you'll get". Individual archetypes override
`bandFraction` as noted below.

## The 17 Offer Archetypes

Tunable weights and constants live in `src/journey_v2/tuning.ts`. The weight
`w` below is the stage-1 lottery weight. Archetypes are grouped by the six
families; slot B is always from a different family than slot A.

### Grant family

**`fit_card_grant`** (w=10) — Receive one named card that fits the deck.
Candidates: non-starter pool cards not already in the deck. Signal: fit-model
score against the current deck. Band-sample 1. Face-up. Eligible when deck size
≥ 6.

**`fit_card_draft`** (w=10) — Draft 1 of 4 cards that fit the deck. Same
candidate pool and signal; band-sample 4 without replacement. Face-up chooser.
Eligible when deck size ≥ 6 and the band has ≥ 4 cards.

**`copies_draft`** (w=6) — Draft 1 of 4 cards and receive 2 copies of the pick.
Candidates: non-starter, unowned pool cards (the shared grant pool); the
accepted card is added twice. Signal: `copiesBlend.fit * fitNorm +
copiesBlend.quality * qualityNorm`, so the doubled card is both a deck fit and
genuinely strong; below `minDeckForFit` it falls back to corpus quality alone so
the archetype is live on a small deck. Band-sample 4 as a face-up chooser.
Eligible when the band has ≥ 4 cards.

**`strong_card`** (w=8) — Receive one powerful card chosen with the deck in
mind. Candidates: all non-starter, unowned pool cards. Signal:
`strongBlend.quality * qualityNorm + strongBlend.fit * fitNorm` (0.7 / 0.3) — a
genuinely strong card that still leans toward what the deck is building, so an
off-archetype bomb is pulled below a comparably strong on-archetype card.
Band-sample 1 with `bandFraction = 0.15`. Face-up. Always eligible.

**`category_draft_known`** (w=10) — Draft 1 of 4 cards within a named category
(e.g. "Draft a Warrior", "Draft a cheap Event", "Draft from the Cradle of Storms
package"). Category construction is described below. Within the sampled category,
candidates are non-starter pool cards; signal: fit score; band-sample 4. Face-up
chooser — both the category and the four cards are shown. Eligible when at least
one category has ≥ 8 non-starter pool cards.

**`card_bundle`** (w=8) — Gain 2–3 cards that work together and with the deck.
Band-samples a seed card from the fit candidate band (quality band when deck
< 6); grows 1–2 more using `0.5 * affinityToSeed + 0.3 * affinityToBundle +
0.2 * fitNorm`, sampling each addition from the top 5 by that score. Bundle
size is seeded. All bundle cards are granted on accept. Face-up. Always eligible.

**`transfigured_draft`** (w=6) — Draft 1 of 4 cards that arrive already
transfigured. Candidates: non-starter pool cards with ≥ 1 eligible
transfiguration; signal: fit score (quality when deck < 6). Band-sample 4; each
candidate is paired with its highest-benefit eligible transfiguration and
displayed as the transfigured preview. Face-up chooser. Eligible when the band
has ≥ 4 such cards.

### Improve family

**`transfigure`** (w=10) — Permanently improve a deck card. Candidates: every
(deck entry, eligible transfiguration) pair where the entry carries no
transfiguration yet and benefit > 0. Starters are excluded while any non-starter
pair exists. Signal: `0.7 * benefit + 0.3 * centrality`. Band-sample 1 pair.
Face-up with a before/after preview. Eligible when ≥ 1 pair exists.

**`starter_transfigure`** (w=6) — Improve 1–2 starter cards. Candidates:
untransfigured starter entries with ≥ 1 eligible transfiguration. Seeded-sample
1–2 entries uniformly; each gets a seeded-sampled eligible transfiguration
(uniform over its eligible list, benefit > 0). Face-up with previews. Eligible
when ≥ 1 such starter exists.

**`keyword_mod`** (w=8) — Add Reclaim to an event / make an event fast / reduce
a Reclaim cost. Candidate pairs: every deck Event without base or modified Reclaim
pairs with `add_reclaim`; every non-fast deck Event pairs with `add_fast`; every
deck Event with Reclaim cost > 1 pairs with `reduce_reclaim`. Seeded-sample 1
pair uniformly. Face-up with preview. Eligible when ≥ 1 pair exists.

**`tribal_change`** (w=6) — Change a character's subtype to the deck's active
tribe (Warrior, Spirit Animal, Survivor, or Outsider). A tribe is active when
the deck holds ≥ 4 Characters of that subtype. Candidates: (entry, tribe) pairs
where the tribe is active, the entry is a Character whose effective subtype
differs from the tribe, and the entry has no prior type change. Signal: centrality.
Band-sample 1 pair (`tribalBandFraction = 0.25`, `tribalBandMinimum = 2`).
Face-up with preview. Eligible when ≥ 1 pair exists.

### Remove family

**`purge`** (w=8) — Remove a weak card from the deck. Candidates: starter-rarity
entries, plus non-starter entries in the bottom 20% of leave-one-out misfit
whose card has corpus signal (df ≥ minDf). Banes are excluded. Signal: misfit,
with a +0.25 bonus for starters. Band-sample 1 from the worst band. Face-up.
Eligible when deck size ≥ 8 and ≥ 1 candidate exists.

**`purge_replace`** (w=8) — Remove a weak card and draft 1 of 4 replacements.
Removal target selected exactly as `purge`; replacements are a face-up
`fit_card_draft`-style band sample of 4. Both halves apply on accept. Eligible
when both halves are individually eligible.

### Duplicate family

**`duplicate`** (w=8) — Duplicate a deck card (pick 1 of up to 3). Candidates:
non-starter deck entries. Signal: `duplicateBlend.quality * qualityNorm +
duplicateBlend.fitLoo * fitLooNorm` — duplicate the player's strongest, most
synergistic card, blending the entry card's corpus quality with its
leave-one-out fit within the deck. Band-sample up to 3 as a face-up chooser; a
single candidate renders as a direct offer. Eligible whenever the deck holds ≥ 1
non-starter entry.

### Dreamsign family

**`dreamsign`** (w=8) — Gain a dreamsign suited to the deck. Candidates: unheld
dreamsigns. Signal: profile match score (see below). Band-sample 1 with
`bandFraction = 0.4` (small population). Face-up. Eligible while ≥ 1 unheld
dreamsign exists.

**`dreamsign_draft`** (w=6) — Pick 1 of 2–4 dreamsigns. Same candidates and
signal; band-sample up to 4 (minimum 2). Face-up chooser. Eligible while ≥ 2
unheld dreamsigns exist.

### Site family

**`add_site`** (w=6) — Add a site to the current dreamscape. Seeded-samples a
site type uniformly from: Shop, Specialty Shop, Purge, Transfiguration, Dreamsign
Offering, Dreamsign Draft, Duplication, Reward, Essence. The new site
appears immediately on the current dreamscape map. Face-up (the offer names the
site type). Always eligible.

## Corpus Signals

All card understanding is mechanical; cards are identified by UUID throughout.
Signal computation is in `src/journey_v2/signals/`.

- **Fit** — `FitModel` from `src/draft/replay/fit-model.ts` (neighbor-CF + IDF
  co-occurrence + prior; recall@4 ≈ 80%). `fitNorm` is min-max normalized over
  the candidate pool for the current deck. `fitPrior` and `fitCooccurrence` are
  the model's component signals.
- **Quality** — the conditional-logit quality term from
  `src/draft/pool/variant-pickchoice.ts` (taken-over-passed strength), fit
  offline over the adapted records and baked. `qualityNorm` is min-max
  normalized over the pool.
- **Misfit (leave-one-out)** — for deck entry `e` with card `c`:
  `fitLoo(e) = mean over other distinct deck cards d of coocNorm[d][c]`,
  computed at runtime from the baked affinity matrix. Entries whose card lacks
  corpus signal (df < minDf) are excluded from misfit-based candidacy.
- **Multiplicity** — `m(c) = |{corpus mainboards with ≥ 2 copies of c}| /
  |{corpus mainboards with ≥ 1 copy of c}|`, computed offline; `m(c) = 0` when
  fewer than 5 mainboards contain the card.
- **Clusters** — offline deterministic label propagation over the affinity
  graph, keeping each card's top 10 affinity edges; clusters with ≥ 8 members
  are retained. Each cluster's flagship is the member with maximal
  `idf(c) * quality(c)`.
- **Centrality** — `clamp01(0.65 * fitPrior(c) + 0.35 * fitCooccurrence(c, deck))`;
  fallback `0.25 + 0.15 * (spark ≥ 3)` for cards without corpus signal.

### Baked corpus artifact

`data/merchant_corpus.json` holds quality ratings, multiplicity, df, and cluster
assignments for each corpus card, keyed by UUID. The file is committed and kept
in sync via:

```
npm run bake-merchant-corpus    # regenerate from docs/draft_records_adapted/
npm run merchant-corpus-parity  # validate committed artifact against live rebuild (exits 0 on match)
```

The bake script is `scripts/bake-merchant-corpus.mjs`. The parity script imports
`computeMerchantCorpus()` from the same module, ensuring both use one
implementation. The runtime loader (`src/data/merchant-corpus.ts`) fetches the
committed JSON and maps it into `MerchantCorpus` (UUID-keyed Maps).

## Category Construction (`category_draft_known`)

The category universe is built from two tag-free sources at encounter time:

1. **Hard card data** — card type (Character, Event); each subtype with ≥ 12
   non-starter pool cards; cost bands cheap (≤ 1 energy), mid (2–3), big (≥ 4);
   fast cards (when ≥ 12 exist).
2. **Corpus clusters** — each retained cluster, presented as "the *<flagship>*
   package".

A category is **deck-affine** when the deck contains ≥ 2 cards in it (≥ 1 for
clusters). The encounter's category is seeded-sampled: 75% weight on deck-affine
categories, 25% on the full universe — usually relevant, occasionally a curveball.

## Dreamsign Profiles

`data/tabula/dreamsign_profiles.toml` is the one curated data file in the
system. Each dreamsign has a profile row recording the hard deck features its
ability rewards, plus a quality tier judgment:

```toml
[[dreamsigns]]
id = "<dreamsign uuid>"
subtypes = ["Warrior"]         # hard subtypes this dreamsign rewards
card-types = []                # Character and/or Event
cost-bands = []                # "cheap", "mid", "big"
keywords = []                  # e.g. ["reclaim", "fast"]
quality = 2                    # 1 = premium, 2 = solid, 3 = niche
```

Each feature (subtype match, card type match, cost band, or keyword presence —
all hard fields) contributes a graded coverage `min(1, matchingDeckCards / 3)`:
zero when the deck holds no matching card, full at three. The match score is the
mean coverage across the profile's features times `qualityWeight` (1.2 / 1.0 /
0.8 for quality 1 / 2 / 3). A profile whose features the deck does not support
sinks toward zero, so it is never offered as "suited to your deck"; a featureless
profile scores `0.4 * qualityWeight`, keeping generic dreamsigns offerable
everywhere without beating a genuinely suited one. The `dreamsign` /
`dreamsign_draft` builders sample only from the deck-suited pool (signs with
positive score) whenever any exists.

The loader is `src/data/dreamsign-profiles.ts`. Profiles are populated in
`QuestContent` and passed through `buildMerchantContext` into `dreamsignMatch.ts`.

## Dialogue

Each encounter renders exactly one merchant line for one seeded-chosen offer.
The merchant speaks only in cryptic, poetic dream-imagery: he never names a
card, a creature, or a game term, and every line gestures at the *shape* of the
offer rather than its contents. Each archetype has a small slot-free template
bank, so the words never spoil what is on the table. One short poetic accept
reaction fires after the player accepts. No other dialogue.

Template selection is seeded, so the same encounter always produces the same
line.

## Running the Metrics Harness

```
npm run merchant-metric
```

The harness script is `scripts/merchant-experiment.ts`, run via `vite-node` so
it imports `src/journey_v2` directly. It simulates deck states as prefixes of
real adapted draft records at picks 0/5/10/20 (defaults: 60 records × 40
seeds), then measures:

1. **Distinct outcomes** — distinct (archetypeA, targetKeyA, archetypeB,
   targetKeyB) tuples and perplexity per deck-stage bucket. Target: ≥ 50 at
   picks 0 and 5.
2. **Desirability** — per archetype, offered target's signal percentile in its
   candidate population. Target: median ≥ 75th percentile, floor ≥ 50th (relaxed
   to 65/40 for dreamsign/dreamsign_draft due to their tie-heavy flat signal).
3. **Repetition** — probability two distinct seeds give identical offer pairs for
   the same deck state. Target: < 2%.
4. **Archetype coverage** — empirical share per archetype vs weight-implied share,
   modelling both offer slots and the family-distinctness constraint. Target: each
   eligible archetype within 2× of its expected share.
5. **Content coverage** — transfiguration types (every reachable type appears;
   Rose is structurally unreachable and excluded); dreamsign templates (100% of
   band-reachable templates offered); non-starter pool cards offered (≥ 90%);
   deck-target diversity for targeting archetypes.

The harness writes `merchant-metric-report.json` to the repo root (gitignored)
and prints a summary line `X/5 metric targets met`.

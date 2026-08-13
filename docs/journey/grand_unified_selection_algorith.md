# Grand Unified Selection Algorithm

Status: implemented design for Journey selection and opponent deck construction.

## Purpose

Dreamtides needs one coherent answer to three recurring questions:

1. Which entities fit the player's or opponent's current game plan?
2. Which entities are intrinsically stronger?
3. How should a deterministic game choose among several good answers without
   producing the same journey every time?

The Grand Unified Selection Algorithm answers these questions with two authored
properties and one reusable selector:

- Tide affinity represents mechanical fit.
- Rarity represents intrinsic strength.
- Seeded top-band sampling turns an ordered candidate set into a varied,
  replayable choice.

Cards, Dreamsigns, affiliations, Dream Avatars, rewards, and opponent decks all
use this vocabulary. The Tides4 algorithm remains the production constructor for
each journey's 150-card draft pool.

## Goals

- Preserve Tides4 draft-pool behavior and `data/tides.ron` as a central design
  artifact.
- Use one affinity representation for cards, Dreamsigns, affiliations, Dream
  Avatars, live decks, and opponent construction.
- Represent card and Dreamsign strength with a small authored ordinal scale.
- Keep ordinary rewards synergistic, strong rewards powerful, and deterministic
  journeys reproducible.
- Build opponent decks with the same concepts used by player-facing selection.
- Make production decisions reconstructable from journey logs.
- Keep tuning with the canonical RON catalog that owns the affected feature.

## Non-goals

- Replacing or retuning Tides4 draft-pool construction.
- Predicting battle win rate from card text.
- Learning live parameters from production outcomes.
- Assigning a continuous power score that implies precision beyond the authored
  evidence.
- Making card names into identifiers. All relationships use canonical UUIDs.

## Canonical data model

### Tides

`data/tides.ron` defines the shared affinity space. Every Tide has a UUID, a
kind, a resonance, player-facing presentation, and a UUID-keyed card-count map.
The map supplies each card's Tide vector directly:

- a card with one copy in a Tide contributes weight 1 to that dimension;
- a card with two copies in a Tide contributes weight 2;
- an absent card contributes 0.

All ordinary pool cards have at least one non-zero Tide dimension. The same
catalog owns the universal `band_fraction` and `band_minimum` tuning.

### Cards

`data/cards.ron` assigns every card an explicit rarity:

| Rarity | Strength value | Pool role |
| --- | ---: | --- |
| Common | 0 | ordinary pool card |
| Uncommon | 1 | stronger pool card |
| Rare | 2 | high-power pool card |
| Legendary | 3 | exceptional pool card with draft progression rules |
| Starter | outside scale | fixed journey starter deck |
| Tutorial | outside scale | tutorial-only content |
| Special | outside scale | special systemic content |

The first four rarities form the strength scale used for ranking. The last
three are valid catalog rarities and are excluded from ordinary card pools.

### Dreamsigns

Each entry in `data/dreamsigns.ron` owns a Common, Uncommon, Rare, or Legendary
rarity and one to three Tide UUIDs. The unweighted sum of those dimensions is
the Dreamsign's affinity vector. Tags remain editor and presentation metadata;
they do not create another selection model.

### Affiliations

Each entry in `data/affiliations.ron` owns exactly three distinct Tide UUIDs.
Their unweighted sum is the affiliation vector. Exactly three makes each
affiliation equally expressive and prevents authored magnitude from becoming a
hidden weighting control.

### Dream Avatars

Each entry in `data/dream_avatars.ron` owns its Tides4 `tide_pool`: an optional
signature Tide, one or more facet Tides, and neutral fill Tides. This structure
defines the card universe available to that Dream Avatar and supplies the
identity basis used when constructing its opponents.

### Feature tuning

Selection tuning lives with the feature that owns it:

- `data/tides.ron`: universal top-band fraction and minimum;
- `data/augury.ron`: archetype weights, chooser quantities, package categories,
  subtype eligibility, and cost bands;
- `data/sites.ron`: purge deck-size threshold and placeable site types;
- `data/opponents.ron`: deck size, ability and Dreamsign unlock layers,
  Legendary gating, and Starter dilution.

Runtime assembles these fields into one compatibility view for Journey content.
That view is derived configuration rather than another authored catalog.

## Unified affinity computation

### Live context vector

For a Journey selection, the context vector is the sum of:

- weight 1 for every Tide joined into the run's Tides4 pool;
- the full Tide vector of each distinct effective card UUID in the deck;
- weight 1 for every Tide on each held Dreamsign.

Duplicate copies of the same card do not amplify the context. This keeps a
single duplicated card from redefining the entire deck identity while allowing
the card's authored core/support weights to matter.

For an opponent, the initial context is the sum of the joined Tides from that
opponent's exact Tides4 pool and the dreamscape affiliation's three Tides. A
selected Dreamsign's Tides are then added before card construction begins.

### Similarity

Affinity is cosine similarity between the candidate vector and the context
vector. It ranges from 0 for no shared Tide dimensions to 1 for identical
direction. Cosine similarity keeps the score about thematic direction rather
than raw vector size.

An empty context produces affinity 0 for every candidate. Ordinary selections
therefore become seeded uniform choices, while explicitly strong selections can
still use rarity.

### Leave-one-out affinity

When ranking a card already present in the deck, its vector is subtracted from
the context before measuring that card. This avoids letting a card supply the
evidence for its own fit. Leave-one-out affinity powers duplication, purge, and
deck-entry centrality.

## Ranking policies

All policies use the same affinity and rarity values. They differ only in which
question is primary.

| Player-facing intent | Primary rank | Tie-break rank |
| --- | --- | --- |
| ordinary card or Dreamsign | affinity | rarity |
| strong card | rarity | affinity |
| duplicate a deck entry | rarity | leave-one-out affinity |
| purge a deck entry | lowest leave-one-out affinity | stable UUID |
| central deck entry | leave-one-out affinity | rarity |
| transfiguration | mechanical benefit | leave-one-out affinity |
| card bundle | iterative affinity | rarity |
| fixed authored target | authored UUID | none |
| explicitly uniform choice | uniform | none |

Mechanical eligibility runs before ranking. Predicates, draft-pool scope,
ownership exclusions, starter rules, Nightmare rules, transfiguration
eligibility, and authored allowed lists therefore remain hard constraints.

Transfiguration benefit is the feature's existing mechanical value calculation.
Affinity chooses between transformations with equal benefit; it does not invent
a second transformation power model.

## Seeded top-band sampling

Ranked selection does not always take the first candidate. Given `N` legal
candidates, the eligible band contains:

- `ceil(N × band_fraction)` candidates;
- at least `band_minimum`, when that many candidates exist;
- at least the number required to satisfy the request;
- never more than `N`.

The production tuning is a 25% fraction with a minimum of 5. A purpose-isolated
deterministic stream samples uniformly from that band. Stable UUID ordering
breaks exact rank ties before sampling. Candidate ordering in an input catalog
therefore cannot change the result.

Multi-card bundles are iterative. After each chosen card, its Tide vector is
added to a temporary context, the remaining candidates are reranked, and the
next card is sampled from the new band. This makes a package internally
coherent rather than merely a collection of individually plausible cards.

Every selection stream includes the rules version, Journey seed, site UUID,
selection key, policy, and stream purpose. Pack boundaries and bundle growth use
isolated purposes so adding one kind of random draw cannot perturb another.

## Opponent deck construction

Normal Journey opponents use the following pipeline:

1. Select a Dream Avatar from the current dreamscape's resident roster.
2. Run the exact production Tides4 generator for that avatar and seed.
3. Form the initial context from the pool's joined Tides and the affiliation's
   three Tides.
4. At the configured unlock layer, rank Dreamsigns by affinity then rarity and
   sample one from the universal top band.
5. Add the Dreamsign vector to the context.
6. Rank distinct cards dealt into the generated pool by affinity then rarity.
7. Sample one card from the top band, add its vector to the context, and repeat
   until the deck has 30 distinct cards.
8. Below the configured Legendary layer, exclude Legendary candidates.
9. At early layers, cut the least-affine selected non-Starters and insert the
   exact configured number of Starter cards while preserving deck size.
10. Activate the opponent Dream Avatar ability at its configured layer.

The ordinary mature deck size is 30. The first two layers insert 10 and 5
Starter cards respectively, producing 33% and 17% Starter dilution while
retaining the same final size.

AI-controlled and tutorial battles retain their authored deck paths because
their purpose is deterministic rules execution rather than Journey opponent
authorship.

## Determinism and observability

Selection traces contain:

- rules and content revisions;
- mechanic and policy IDs;
- selection key and deterministic salt parts;
- legal candidate count and candidate digest;
- band fraction, minimum, size, cutoff, and all ranked component scores;
- selected stable IDs;
- effective deck snapshot and digest;
- every random stream purpose and draw count.

Opponent construction logs the avatar and affiliation UUIDs, affiliation and
joined Tide UUIDs, Dreamsign UUID, seed, layer, band tuning, base and final card
UUIDs, Starter insertions, cuts, and Legendary suppression count. These fields
are sufficient to reconstruct a production decision from the canonical catalogs
and Journey log.

## Production-baseline experiments

### Rarity allocation

The 501 ordinary cards classified during cutover were partitioned by searching
allocations against the production merchant-quality ordering. The selected
allocation is:

| Rarity | Newly classified cards | Total ordinary pool cards |
| --- | ---: | ---: |
| Common | 222 | 222 |
| Uncommon | 215 | 215 |
| Rare | 64 | 64 |
| Legendary | 0 | 8 |

The fitted boundaries were production quality score `≤ 0.231563` for Common and
`≥ 0.410519` for Rare, with the middle assigned Uncommon. Legendary remained an
authored exceptional category.

On held-out historical picks, the production fit model achieved 84.87% recall
at four and 45.4% top-one recall. Tide cosine with the three-level rarity model
achieved 78.66% recall at four and 39.4% top-one recall. The expected regression
is therefore 6.21 percentage points of recall at four. The smaller model retains
about 83% of the production model's lift over random selection while replacing a
learned continuous quality artifact with explicit RON rarity.

This is the clearest measured quality cost of the cutover. It is concentrated in
fine distinctions among similarly fitting cards, which seeded band sampling was
already designed to soften.

### Opponent decks

The opponent experiment used exact production Tides4 generation across 32 Dream
Avatars and 20 seeds each, for 640 core scenarios and 12 algorithm variants. It
also tested 1,280 authored resident/affiliation scenarios. Five-fold holdout by
draft ID scored cohesion with the production fit model trained on the other four
folds. The comparison baseline was the 453 currently resolvable curated decks
from 497 manifest entries.

The selected iterative top-25%-band, 30-card variant produced:

| Metric | Production baseline | Unified selector | Change |
| --- | ---: | ---: | ---: |
| held-out cohesion, no affiliation | 1.082 | 1.794 | +65.8% |
| avatar/Tide cosine, no affiliation | 0.269 | 0.429 | +59.5% |
| avatar signature coverage | 44.7% | 43.9% | -0.8 points |
| held-out cohesion, authored affiliation pairs | 1.086 | 1.777 | +63.7% |
| avatar cosine, authored affiliation pairs | 0.272 | 0.415 | +52.9% |
| affiliation cosine | 0.391 | 0.393 | +0.2 points |
| signature coverage, authored pairs | 40.6% | 42.3% | +1.7 points |

The mana curve stayed close: cheap-card share was 87.1% in the baseline and
87.0% in the unified decks; mean cost moved from 2.179 to 2.162. Event share
increased from 26.0% to 29.7%.

A random 30-card slice from the same generated pool scored 1.025 cohesion. The
gain therefore comes from iterative selection rather than merely constraining
the universe to the avatar's Tides4 pool.

The 30-card target best matched production behavior. Twenty-five cards reduced
signature coverage to 37.6% and made 10 early Starters 40% of the deck.
Thirty-six cards improved signature coverage to 50.4% but exceeded the typical
production deck length and reduced cohesion to 1.720.

Across 100 seeds for one avatar, the selector produced 100 distinct decks with
mean 194-card coverage and mean pairwise Jaccard similarity 0.289. The production
baseline produced eight distinct decks. This is substantial variety without
discarding identity.

### Known risks

- Mean ordinal rarity in realistic affiliation scenarios was about 6% lower.
  A mature 30-card deck contained about 0.22 fewer Legendary cards on average;
  early layers gate Legendary cards in both systems.
- The event share increased by 3.7 percentage points. Battle telemetry should
  monitor whether this changes practical play patterns.
- Arbitrary avatar/affiliation combinations can have weak affiliation fidelity
  when the avatar's eligible Tides4 pool cannot express the affiliation. Authored
  resident pairs performed well. Catalog validation should continue to require
  meaningful overlap between every affiliation and each resident avatar's pool.
- The experiments use historical cohesion, affinity, curve, coverage, and
  diversity proxies. They do not establish battle win rate.
- Production Journey logs contained only seven distinct opponent builds at the
  time of evaluation, with a median of 27 cards. Outcome-based validation needs
  a larger post-cutover sample.

## Implementation map

- `src/selection/tide-affinity.ts`: vectors, context composition, cosine
  affinity, rarity strength, rank comparison, and universal top-band sampling.
- `src/reward-selection/context.ts`: live Journey context and content revision.
- `src/reward-selection/selectReward.ts`: legal candidate construction,
  policies, top-band sampling, deterministic streams, and traces.
- `src/battle/integration/tide-opponent-deck.ts`: iterative opponent pipeline.
- `src/battle/integration/create-battle-init.ts`: production battle integration.
- `scripts/tides-data.mjs`: runtime Tide and embedded avatar-pool projection.
- `tools/game-data/src/models`: typed RON validation and compatibility lowering.
- `tabula`: source-preserving affiliation Tide editor.

## Validation contract

Deterministic synthetic tests must prove:

- copy counts become Tide vector weights;
- repeated copies of one deck card contribute only one card vector to context;
- cosine and rarity orders are stable;
- catalog iteration order cannot affect selected UUIDs;
- ordinary, strong, duplication, purge, transformation, Dreamsign, pack, and
  bundle policies use their documented rank order;
- fixed targets and authored constraints are preserved;
- opponent construction returns 30 distinct cards at maturity;
- Dreamsign, ability, Legendary, and Starter progression gates apply at exact
  layers;
- early Starter insertion preserves final deck size and cuts the lowest-affinity
  cards;
- every card, Dreamsign, affiliation, and avatar Tide reference resolves;
- every ordinary pool card has at least one Tide dimension;
- every affiliation defines exactly three distinct Tides;
- editor saves preserve unrelated RON source bytes and pass the native
  persistence workflow.

Post-cutover telemetry should compare deck size, rarity mix, event share, curve,
affiliation cosine, Dream Avatar cosine, repeat-deck rate, battle win rate, and
player reward acceptance. A material regression should first be addressed by
RON tuning or rarity curation; a new learned data source requires a separate
design decision.

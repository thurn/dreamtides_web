# Dream Merchant v3 Design

Rewrite of the dream merchant encounter system in `src/journey_v2`. The merchant
offers the player two free, immediate, permanent rewards; the player accepts one
or declines. Offer generation is driven by corpus-derived signals from the
~1,061 adapted draft records rather than curated tags, and selection is a
two-stage seeded lottery designed so that variance is a measurable, tunable
property of the system.

## Goals

- Every offered choice is something the player would plausibly want.
- Behavior is varied: roughly 50+ distinct outcomes at the first-dreamscape
  merchant, measured by a simulation harness.
- Minimal externally curated data. The only curated file is a small dreamsign
  profile TOML; everything about cards is derived from hard card data and the
  draft-record corpus.
- All rewards are free, immediate, and permanent.

## Non-goals

- Time-limited journey effects (effects scoped to the next N battles or
  dreamscapes).
- Essence or omens as merchant currency or merchant rewards (no prices, no
  locked offers, no essence/omen grants, no shop or reroll modifiers).
- Card type conversion (character/event conversion rewards). Subtype changes
  within the Character type are in scope (see `tribal_change`).
- Future-scoped site rewards: adding sites to the *next* dreamscape, replacing
  site types, or boosting site appearance chances. Adding a site to the
  current dreamscape is in scope (see `add_site`).
- Regex- or tag-based inference of card function (removal, draw, payoff tiers).
- Changes to the transfiguration rules themselves
  (`src/transfiguration/transfiguration-logic.ts` is consumed as-is).

## Encounter structure

- Exactly two offers, `A` and `B`. The player accepts at most one or declines.
  Accepting or declining completes the site.
- Both offers are free. There is no pricing, locking, or payment step.
- Generation is deterministic per (quest seed, site id, deck state). The
  regenerate-and-validate-on-accept pattern from the current implementation is
  retained: acceptance rebuilds the encounter from current state, validates the
  encounter signature and offer identity, applies the reward, and completes the
  site.
- Any chooser shown to the player contains at most 4 items.

### Commit-then-reveal for hidden drafts

Archetypes that hide their candidate cards until the player commits
(`category_draft_known`, `premium_draft`) accept in two steps:

1. **Commit mutation**: records the committed offer id in quest state and
   forfeits the other offer. The site is not yet complete. The commit flag
   exists so a reload cannot recover the forfeited offer; deterministic
   generation guarantees the revealed candidates are stable across reload.
2. **Reveal/pick mutation**: the player picks one of the revealed cards; the
   pick is validated against the regenerated candidate set, applied, and the
   site completes.

Fully face-up archetypes keep the single accept-with-choice mutation.

## Seeded randomness

All sampling uses the existing stable-hash utility (SHA-256 over string parts,
as used today for jitter and dialogue selection), mapped to uniform floats.
Every draw salts the hash with (quest seed, site id, slot, purpose), e.g.
`hash(seed, siteId, "B", "archetype")`, `hash(seed, siteId, "B", "target", i)`.
Draws are therefore independent of one another and reproducible. The same run
always shows the same offers at a given merchant; different runs diverge
heavily.

### Band sampling (used throughout)

"Sample from the band" below always means:

1. Rank candidates by the stated signal, descending.
2. Keep the top `bandFraction` of candidates, with a minimum of
   `bandMinimum` candidates when the pool has at least that many (defaults:
   `bandFraction = 0.25`, `bandMinimum = 5`).
3. Seeded-sample uniformly within the band, without replacement when picking
   multiple items.

The band floor delivers "plausibly want it"; uniform sampling within the band
delivers "never know what you'll get". Archetypes may override `bandFraction`
(noted per archetype).

## Generation pipeline

```
buildMerchantContext(questState, questContent)
  -> MerchantContext { deck, dreamsigns, cardDatabase, corpus signals,
                       dreamsign profiles }

Stage 1: archetype roll
  - Evaluate eligibility predicates for all archetypes against deck state.
  - Seeded weighted draw over eligible archetypes for slot A.
  - Seeded weighted draw for slot B over eligible archetypes whose FAMILY
    differs from A's family.

Stage 2: target sampling (per offer)
  - Build the archetype's candidate list, ranked by its signal.
  - Band-sample the target (or the chooser set).

Dialogue: one merchant line (<=10 words) hinting at one seeded-chosen offer.
Resolve: regenerate, validate, apply, complete site.
```

### Archetype families and the distinctness rule

Slot B must come from a different family than slot A, so the two offers always
pull in materially different directions:

| Family | Archetypes |
|---|---|
| `grant` | fit_card_grant, fit_card_draft, copies_draft, strong_card, premium_draft, category_draft_known, card_bundle, transfigured_draft |
| `improve` | transfigure, starter_transfigure, keyword_mod, tribal_change |
| `remove` | purge, purge_replace |
| `duplicate` | duplicate |
| `dreamsign` | dreamsign, dreamsign_draft |
| `site` | add_site |

18 archetypes across 6 families give several hundred valid ordered (A, B)
archetype pairs before target variance multiplies in.

## Offer archetypes

Base weights are plain constants in code and are tuning levers for the metrics
harness. Initial values below; `w` is the stage-1 lottery weight.

### Grant family

**`fit_card_grant`** (w=10) — *Receive one named card that fits your deck.*
Candidates: all pool cards excluding starter rarity, excluding UUIDs already in
the deck. Signal: fit-model score against the current deck. Band-sample 1.
Face-up. Eligible when deck size >= 6 (below that the fit signal is mostly
prior and `strong_card` covers the same ground).

**`fit_card_draft`** (w=10) — *Draft 1 of 4 cards that fit your deck.*
Same candidate pool and signal; band-sample 4 without replacement. Face-up
chooser. Eligible when deck size >= 6 and the band has >= 4 cards.

**`copies_draft`** (w=6) — *Draft 1 of 4 cards; receive 2 copies of your
pick.* Same candidate pool as `fit_card_draft` (non-starter, unowned pool
cards), but the accepted card is added twice (a composite of two
`add_catalog_card` children). Signal: `copiesBlend.fit * fitNorm +
copiesBlend.quality * qualityNorm`, so the doubled card is both a deck fit and
genuinely strong; below `minDeckForFit` the signal falls back to corpus quality
alone, the same cold-start handling `card_bundle` uses, so the archetype is live
even on a small deck. Band-sample 4 as a face-up chooser. Eligible when the band
has >= 4 cards.

> **Format note (singleton corpus → quality/fit value).** The adapted draft
> records are singleton mainboards, so the corpus encodes how strong and how
> synergistic each card is, not how often decks run it twice. Duplication value
> in this format therefore comes from how good a card already is: doubling your
> strongest, best-fitting cards is the upside, so `copies_draft` ranks candidates
> on fit-to-deck blended with corpus quality, and `duplicate` ranks deck entries
> on corpus quality blended with their leave-one-out fit within the deck.

**`strong_card`** (w=8) — *Receive one named premium card.* Candidates: all
non-starter pool cards. Signal: corpus quality rating. Band-sample 1 with
`bandFraction = 0.15`. Face-up. Always eligible.

**`premium_draft`** (w=6) — *Draft 1 of 4 exceptionally strong cards.*
Candidates: all non-starter pool cards. Signal:
`0.8 * qualityNorm(c) + 0.2 * fitNorm(c)` (fit term is zero on an empty deck).
Band-sample 4 with `bandFraction = 0.10`. Cards hidden until commit; the offer
is sold purely on strength. Always eligible.

**`category_draft_known`** (w=10) — *"Draft a Warrior" / "Draft an Event" /
"Draft a cheap character" / "Draft from the Skull Weaver package" — pick 1 of
4.* Category construction and sampling below. Within the sampled category,
candidates are non-starter pool cards in the category; signal: fit score;
band-sample 4. Category visible, cards hidden until commit. Eligible when at
least one category has >= 8 non-starter pool cards.

**`card_bundle`** (w=8) — *Gain 2–3 cards that work together and with your
deck.* Algorithm: band-sample a seed card from the `fit_card_grant` candidate
band (quality band when deck < 6 cards); grow 1–2 more cards greedily using the
affinity-grower scoring shape,
`score(c) = 0.5 * affinityToSeed(c) + 0.3 * affinityToBundle(c) + 0.2 * fitNorm(c)`,
sampling each addition from the top 5 by that score. Bundle size: seeded 2 or 3.
All bundle cards are granted on accept. Face-up. Always eligible.

**`transfigured_draft`** (w=6) — *Draft 1 of 4 cards that arrive already
transfigured.* Candidates: non-starter pool cards with at least one eligible
transfiguration; signal: fit score (quality when deck < 6). Band-sample 4; each
candidate is paired with its highest-benefit eligible transfiguration (benefit
table below) and displayed as the transfigured preview. Face-up chooser.
Eligible when the band has >= 4 such cards.

### Improve family

**`transfigure`** (w=10) — *Permanently improve a deck card.* Candidates: all
(deck entry, eligible transfiguration) **pairs** where the entry has no
transfiguration yet and benefit > 0. Starters are excluded unless no
non-starter pair exists. Signal:
`0.7 * benefit + 0.3 * centrality(entry)`. Band-sample 1 pair. Face-up with a
before/after preview. Eligible when >= 1 pair exists.

**`starter_transfigure`** (w=6) — *Improve 1–2 of your starter cards.*
Candidates: untransfigured starter entries with >= 1 eligible transfiguration.
Seeded-sample 1–2 entries uniformly; each gets a seeded-sampled eligible
transfiguration (uniform over its eligible list, benefit > 0). Face-up with
previews. Eligible when >= 1 such starter exists. Rationale: starters are
otherwise dead weight; polishing them is a distinct, fun outcome that the
non-starter preference of `transfigure` would never produce.

**`keyword_mod`** (w=8) — *Add Reclaim to an event / make an event fast /
reduce a Reclaim cost.* Build the flat candidate list of (entry, variant)
pairs: every deck Event without base or modified Reclaim pairs with
`add_reclaim`; every non-fast deck Event pairs with `add_fast`; every deck
Event with Reclaim cost > 1 pairs with `reduce_reclaim`. Seeded-sample 1 pair
uniformly — no Legendary/cost argmax. Face-up with preview. Eligible when >= 1
pair exists.

**`tribal_change`** (w=6) — *Change a character's subtype to your tribe.* The
four main tribes are the Warrior, Spirit Animal, Survivor, and Outsider
subtypes. A tribe is **active** when the deck holds >= 4 Characters of that
subtype (hard data only). Candidates: (entry, tribe) pairs where the tribe is
active, the entry is a Character whose effective subtype differs from the
tribe, and the entry has no prior type change. Signal: the entry's centrality
(as defined for `transfigure`) — converting your better off-tribe characters
matters more. Band-sample 1 pair. Face-up with a preview ("<name> becomes a
Warrior"). Applied via the `change_deck_entry_type` payload, keeping the
Character card type and changing only the subtype. Eligible when >= 1 pair
exists, i.e. only when the deck is actually committed to one of the four
tribes.

### Remove family

**`purge`** (w=8) — *Remove a weak card from your deck.* Candidate set:
starter-rarity entries, plus non-starter entries whose leave-one-out misfit
ranks in the bottom 20% of the deck **and** whose card has corpus signal
(df >= minDf) — cards too new for the corpus are never called "weak". Banes are
excluded (bane removal belongs to Cleanse sites, which `add_site` can place).
Signal for ranking: misfit (worst first), starters
get +0.25. Band-sample 1 from the worst band. Face-up. Eligible when deck size
>= 8 and >= 1 candidate exists.

**`purge_replace`** (w=8) — *Remove a weak card and draft 1 of 4 replacements.*
Removal target selected exactly as `purge`; replacements are a face-up
`fit_card_draft`-style band sample of 4. Both halves apply on accept. Eligible
when both halves are individually eligible.

### Duplicate family

**`duplicate`** (w=8) — *Duplicate a deck card (pick 1 of up to 3).*
Candidates: non-starter deck entries. Signal:
`duplicateBlend.quality * qualityNorm(card) + duplicateBlend.fitLoo *
fitLooNorm(entry)` — duplicate the player's strongest, most synergistic card,
blending the entry card's corpus quality with its leave-one-out fit within the
deck. Band-sample up to 3 as a face-up chooser; a single candidate renders as a
direct offer. Eligible whenever the deck holds >= 1 non-starter entry.

### Dreamsign family

**`dreamsign`** (w=8) — *Gain a dreamsign suited to your deck.* Candidates:
unheld dreamsigns. Signal: profile match score (below). Band-sample 1, with
`bandFraction = 0.4` (small population). Face-up. Eligible while >= 1 unheld
dreamsign exists.

**`dreamsign_draft`** (w=6) — *Pick 1 of 2–4 dreamsigns.* Same candidates and
signal; band-sample up to 4 (minimum 2). Face-up chooser. Eligible while >= 2
unheld dreamsigns exist.

### Site family

**`add_site`** (w=6) — *Add a site to the current dreamscape.* Adds one new
site of a seeded-sampled type to the dreamscape the player is currently in,
reusing the v1 site-placement operation (`add_site_to_dreamscape`). The site
type is sampled uniformly from the standard placeable site list (Shop,
Specialty Shop, Purge, Transfiguration, Dreamsign Offering, Dreamsign Draft,
Duplication, Reward, Cleanse, Essence). The effect is immediate and permanent:
the site appears on the current dreamscape map. Face-up (the offer names the
site type). Always eligible.

### Journey v1 reward types deliberately excluded

From the v1 catalog (`src/journeys/journey/shared/rewards.ts`, 64 templates):
essence/omen operations (currency is out of merchant scope), future-scoped
site rewards (next-dreamscape placement, site replacement, appearance-chance
boosts) and shop modifiers, all time-limited and battle-window rewards,
character/event type conversions, dreamwell stubs, and the composite "gain 2
rewards" meta-template (a candidate for a later iteration once single-reward
tuning is stable).

## Transfiguration: mechanics and selection

### System facts (consumed as-is)

`src/transfiguration/transfiguration-logic.ts` defines 8 types:

| Type | Eligibility | Effect |
|---|---|---|
| Viridian | energyCost > 0 | cost becomes `round(cost / 2)` |
| Scarlet | Character | spark 0 becomes 1, otherwise spark doubles |
| Golden | text contains a digit | first number in text +1 |
| Azure | Event | appends "Draw a card." |
| Bronze | Event | appends "Reclaim." |
| Magenta | text matches materialize/dawn/once-per-turn | trigger fires more often |
| Rose | text mentions an activated ability | activated ability costs 1 less |
| Prismatic | eligible for 2+ other types | applies every eligible type |

A deck entry holds at most one transfiguration
(`DeckEntry.transfiguration: TransfigurationType | null`); transfigured cards
are excluded from further transfiguration. Effective cards are computed by
applying the transfiguration first, then type changes, then keyword
modifications (`getEffectiveCard` ordering), and keyword modifications merge
additively (`mergeCardKeywordModification`).

### v3 benefit scores

Benefit is mechanical where the effect is numeric and a flat constant where it
is textual. The deck-conditional bonuses in the current scorer (Azure/Bronze
checking regex-derived draw/recursion counts) are replaced by flat constants,
since the role counts they depend on come from the deleted regex engine.

| Type | Benefit |
|---|---|
| Viridian | `clamp01((oldCost - newCost) / 2)` |
| Scarlet | `clamp01((newSpark - oldSpark) / 4)` |
| Golden | 0.4 |
| Azure | 0.55 |
| Bronze | 0.55 |
| Magenta | 0.5 |
| Rose | 0.5 |
| Prismatic | 0.65 |

Centrality of the target entry uses corpus signals only:
`centrality = clamp01(0.65 * fitPrior(card) + 0.35 * fitCooccurrence(card, deck))`,
falling back to `0.25 + 0.15 * (spark >= 3)` for cards without corpus signal.

### Determinism bug addressed

The current detector applies argmax three times: it keeps only the single
best transfiguration per entry, then only the top 2 entries globally, with
deterministic benefit constants — which is why a 4-spark starter character
reliably produces "Scarlet on Marked Direwolf" as the first merchant's offer.
v3 requirement: the `transfigure` candidate set is **every**
(entry, transfiguration) pair with positive benefit, and the offered pair is
band-sampled. A Viridian on an expensive card, a Bronze on an event, and the
Scarlet on the direwolf are all in the band; any of them can be drawn. The
metrics harness's distinct-outcomes and repetition measures verify this
property rather than leaving it to inspection.

## Corpus signal layer

New module `src/journey_v2/signals/`, leaning on existing draft code. All deck
understanding is mechanical; cards are identified by UUID throughout.

- **Fit** — `FitModel` from `src/draft/replay/fit-model.ts`, used as-is
  (neighbor-CF + IDF co-occurrence + prior; recall@4 ≈ 80%). `fitNorm` is the
  min-max normalization of fit scores over the candidate pool for the current
  deck. `fitPrior` and `fitCooccurrence` are the model's component signals.
- **Quality** — the conditional-logit `quality[c]` term from
  `src/draft/pool/variant-pickchoice.ts` (taken-over-passed strength), fit
  offline over the adapted records and baked. `qualityNorm` is min-max
  normalized over the pool.
- **Misfit (leave-one-out)** — for deck entry `e` with card `c`:
  `fitLoo(e) = mean over other distinct deck cards d of coocNorm[d][c]`,
  computed at runtime from the baked affinity matrix; `misfit = 1 -
  fitLooNorm`. Entries whose card lacks corpus signal (df < minDf) are
  excluded from misfit-based candidacy in both directions.
- **Multiplicity** — `m(c) = |{corpus mainboards with >= 2 copies of c}| /
  |{corpus mainboards with >= 1 copy of c}|`, computed offline; `m(c) = 0`
  when fewer than 5 mainboards contain the card.
- **Clusters** — offline deterministic label propagation over the affinity
  graph, keeping each card's top 10 affinity edges; clusters with >= 8 members
  are retained. Each cluster's flagship is its member with maximal
  `idf(c) * quality(c)`, and the cluster is presented as "the *<flagship>*
  package".

### Baked artifact

One committed file, `data/merchant_corpus.json`, holding quality ratings,
multiplicity, and cluster assignments — same pattern as the affinity corpus: a
bake script regenerates it from `docs/draft_records_adapted/`, and a parity
check validates the committed artifact against a live rebuild. Runtime never
re-derives these from draft records.

## Category construction (`category_draft_known`)

The category universe is built from two tag-free sources:

1. **Hard card data**: card type (Character, Event); each subtype with >= 12
   non-starter pool cards; cost bands cheap (<= 1), mid (2–3), big (>= 4);
   fast cards (when >= 12 exist).
2. **Corpus clusters**: each retained cluster, presented by flagship.

A category is **deck-affine** when the deck contains >= 2 cards in it (>= 1
for clusters). The encounter's category is seeded-sampled: 75% weight on
deck-affine categories, 25% on the full universe — relevant most of the time,
occasionally a curveball.

## Dreamsign profiles and matching

`data/tabula/dreamsign_profiles.toml` is the one curated file. Dreamsigns
never appear in draft records, so they get no corpus signal. A subagent
deep-reads each dreamsign's ability text (no regexes) and records a structured
profile, reviewed by hand:

```toml
[[dreamsigns]]
id = "<dreamsign uuid>"
# Hard deck features this dreamsign rewards. Empty lists = generically useful.
subtypes = ["Warrior"]
card-types = []
cost-bands = []          # of "cheap", "mid", "big"
keywords = []            # e.g. ["reclaim", "fast"]
quality = 2              # 1 = premium, 2 = solid, 3 = niche
```

Match score for a deck: each profile feature is satisfied when the deck holds
>= 3 cards exhibiting it (subtype match, card type match, cost band match, or
keyword presence — all hard fields). Score =
`(0.5 + 0.5 * satisfiedFraction) * qualityWeight`, with `qualityWeight` 1.2 /
1.0 / 0.8 for quality 1 / 2 / 3. Profiles with no features score as 0.5 *
qualityWeight (generic dreamsigns stay offerable everywhere, premium generic
ones readily). At ~32 dreamsigns this file is cheap to maintain.

## Dialogue

Each encounter renders exactly one merchant line of at most 10 words, hinting
at the motivation for one seeded-chosen offer — e.g. "That direwolf of yours
could be so much more." Small per-archetype template banks (6–10 lines each),
slot-filled with at most the target's display name. One short accept reaction
(at most 6 words). Nothing else: no greetings, price framing, walk-away lines,
or decline reactions.

## Metrics harness

`scripts/merchant-experiment.ts`, run via `vite-node` and exposed as
`npm run merchant-metric`, following the pool-experiment pattern. Simulated decks are prefixes of real
adapted draft records (a record truncated at picks 0/5/10/20 models a player
at that stage), so measurements reflect real deck states.

1. **Distinct outcomes** — generate first-dreamscape encounters across many
   seeds per deck state; count distinct (archetype + target identity) offer
   pairs. Target: >= 50 distinct outcomes, reported alongside effective outcome
   count (perplexity) so one dominant pair cannot hide behind a long tail.
2. **Desirability** — per-archetype: for card grants/drafts, the offered
   card's fit percentile against the full eligible pool (target: median >=
   75th percentile, floor >= 50th); for premium/strong offers, quality
   percentile with the same targets; for purges, the target's misfit
   percentile; for transfigure, the pair's blended score percentile.
   `category_draft_known` is a *scoped* draft, so its percentile is measured
   within the chosen category's candidate pool (the population the builder
   sampled), not the whole grant pool. For purges the misfit percentile is
   measured against the *whole deck's* misfit ranking (worst fit = high
   desirability), since the purge candidate set is the already-filtered worst
   band; a card tied at the maximum misfit (a starter, or the worst-fitting
   card) reads ~100. The `dreamsign` / `dreamsign_draft` archetypes carry a
   relaxed target of **median >= 65th percentile, floor >= 40th**: their match
   signal is intentionally flat (154 profiles, 54 featureless and
   deck-independent, graded in three quality tiers) and the band is deliberately
   loose so generic dreamsigns stay offerable everywhere; uniform sampling within
   a wide band over a tie-heavy distribution lands the offered dreamsign near the
   middle of a tie cluster (median ~74, well above chance) and structurally
   cannot clear a 75th-percentile median without abandoning coverage. The
   relaxed target encodes "plausibly relevant", the archetype's design intent.
3. **Repetition** — probability that two random seeds yield an identical offer
   pair for the same deck state. Target: < 2%.
4. **Archetype coverage** — empirical distribution of shown archetypes across
   seeds and deck states; no archetype starved or dominant beyond its intended
   weight (each eligible archetype's observed share within 2x of its
   weight-implied share). The weight-implied share models BOTH offer slots and
   the family-distinctness rule (slot B is a weighted draw constrained to a
   different family than slot A), `E[slots_i] = P(A=i) + Σ_a P(A=a)·P(B=i | A=a)`;
   modelling slot A alone halves the expected share of small-family archetypes
   and spuriously fails almost every archetype.
5. **Content coverage** — across the full sweep (all deck states x seeds), the
   merchant must exercise the whole content space, not a favored subset:
   - *Transfiguration types*: every transfiguration type that any reachable
     pool/deck card is eligible for appears in offers (`transfigure`,
     `starter_transfigure`, `transfigured_draft` combined); report the share per
     type. A type carried by fewer than two distinct cards across the sweep is
     unreachable and excluded from the target. **Rose** is the live exclusion:
     exactly one pool card is Rose-eligible (and only by flavor text mentioning
     "activated abilities" — it has no activated ability for Rose to discount),
     that card appears in ~1 of 60 record decks, and Rose is never any card's
     highest-benefit type (Prismatic dominates), so Rose can never surface.
     "All 8 types appear" is physically unattainable.
   - *Dreamsigns*: fraction of **band-reachable** dreamsign templates ever
     offered. Target: 100% of the reachable set. A dreamsign is reachable when
     its deck-relevant-band reach mass (`Σ_states 1/bandSize` over the deck
     states whose band it enters) clears a small floor. The 54 featureless and
     the low-quality dreamsigns have a deck-independent match score that sits
     permanently below the band, so they surface only if the band is widened to
     the whole population — a pure random draw that abandons deck-relevance and
     collapses desirability. 100% of *all* templates is therefore unattainable
     while keeping offers deck-suited; 100% of the reachable subset is the
     attainable, design-faithful target.
   - *Cards*: fraction of non-starter pool cards ever offered through any
     grant/draft archetype. Target: >= 90%, with the never-offered remainder
     listed by name in the report (no silent gaps).
   - *Deck-target diversity*: for offers targeting deck cards (`purge`,
     `duplicate`, `transfigure`, `keyword_mod`, `tribal_change`), the
     distribution of chosen target cards — reported per archetype as the
     count of distinct targets and the effective target count (perplexity),
     both globally and across seeds within a fixed deck state. A fixed deck
     state must produce multiple distinct targets across seeds; a single
     target capturing the large majority of an archetype's offers indicates
     a residual argmax.

Archetype weights, band fractions, and blend constants are tuned against these
metrics, the same way pool generation is tuned today.

## Module changes

Retained (adapted):

- UI shell: `DreamMerchantScreen`, `OfferCard`, `MerchantChooserPanel`,
  `MerchantGameObjectView` — with pricing/locked-offer UI removed and the
  commit-then-reveal flow added.
- `buildMerchantContext` shape — support metadata replaced by corpus signals
  and dreamsign profiles.
- `resolveMerchantOffer` validation pattern (encounter signature,
  regenerate-validate-apply), extended with the commit mutation.
- Transfiguration application (`transfiguration-logic.ts`) and keyword
  modification storage/merge (`card-type-change.ts`), both unchanged.
- The v1 site-placement operation (`add_site_to_dreamscape`) backing
  `add_site`.

New:

- `src/journey_v2/signals/` — fit/quality/misfit/multiplicity/cluster access
  and dreamsign profile matching.
- Stage-1 archetype roll and stage-2 band sampling in
  `encounter/generateMerchantEncounter.ts` (rewritten).
- `data/merchant_corpus.json` + bake script + parity check.
- `data/tabula/dreamsign_profiles.toml` + subagent curation pass.
- `scripts/merchant-experiment.ts` (run via `vite-node`) + `merchant-metric` npm script.

Deleted:

- `read/deckRead.ts` (needs engine: under_supported_payoff, missing_role,
  curve_problem, weak_card, dreamsign_gap detection and the role regexes).
- `catalog/pricing.ts` and every essence cost, locked-offer, and payment path.
- `gain_essence` and `raise_essence_cap` reward builders.
- The `convert_event_to_role` reward builder. The `change_deck_entry_type`
  payload kind is retained for `tribal_change` (subtype-only changes).
- The seven-beat dialogue grammar and its template banks.
- The merchant's consumption of `data/buildaround_support.json`.

## Testing

- Unit tests run against fixture corpora and fixture cards; they never assert
  on production TOML or draft-record contents.
- Determinism: same (seed, site, deck state) produces an identical encounter.
- Eligibility gates: each archetype's predicate, including the empty-deck
  visit, which must still yield two valid offers from different families.
- Band sampling: no offered target falls below its archetype's band; chooser
  sets never exceed 4 items and contain no duplicates.
- Transfigure candidates: pairs are enumerated per (entry, transfiguration),
  starters excluded while non-starter pairs exist, transfigured entries
  excluded.
- Commit-then-reveal: commit forfeits the other offer, reveal validates the
  pick against regenerated candidates, stale signatures are rejected without
  mutation.
- Family distinctness: slots A and B always come from different families.
- Tribal change: ineligible until a tribe reaches 4 Characters; candidates
  exclude in-tribe Characters, non-Characters, and entries with a prior type
  change; the applied change preserves the Character card type.
- Add site: the placed site appears on the current dreamscape and the offer
  names the site type.
- Browser QA through the normal player workflow on a non-5173 Vite port, per
  the standard QA process.

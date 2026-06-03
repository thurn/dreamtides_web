# Draft Pool Diversity Analysis

This report quantifies how evenly the draft-pool generator
(`src/draft_test/color-pool.ts`) spreads cards and archetypes across pools,
explains why some cards and themes dominate while others are rare, and proposes
ways to flatten the distribution.

The card data is the 509-card `cards_v2.toml` set, of which 31 are flagged
`core`. Two distributions matter, and this report uses both:

- **Unconstrained** (no Dreamcaller seeding) — the bare algorithm. The
  *Root-cause* analysis below uses this to isolate the generator's own biases.
- **Dreamcaller-gated** — the realistic draft-test flow: every pool is produced
  by first choosing a Dreamcaller and seeding from its draft archetypes. Players
  are offered three random Dreamcallers and pick one, which averages to a uniform
  draw over all 32; the 12 Dreamcallers without archetypes roll the unconstrained
  pool. The *Results* for the `diverse` variant are measured on this gated
  distribution, since it is what players actually experience.

Both are reproducible:

```
node scripts/analyze-pool-diversity.mjs --compare                 # gated, default vs diverse
node scripts/analyze-pool-diversity.mjs --unconstrained --seeds 3000   # raw algorithm
```

## Summary

The pool is dramatically front-loaded. Over many pools every card does appear
*eventually* — nothing sits at a literal 0% across 3000 seeds — but the per-pool
experience is governed by a small, fixed-ish set of cards:

- The **31 core cards fill 17.9% of every pool**, identically, every time.
- The **top 50 cards occupy 25% of all pool slots; the top 150 occupy 50%.**
  The remaining ~360 cards share the other half, many at single-digit rates.
- Card inclusion rate rises monotonically with two metadata breadth signals —
  how many **color lists** and how many **draft archetypes** a card belongs to —
  so broadly-tagged cards crowd out narrowly-tagged ones in nearly every pool.
- **Multi-color archetypes are starved**: one-color archetype themes are chosen
  ~4.5% of the time, two-color ~1.6%, three-color ~0.2%, four-color ~0.05%. The
  cards exclusive to those themes inherit that rarity.

In a real session a player sees only a handful of pools, so in practice the
"always there" cards (core + broad staples) and the "never there" cards (narrow,
multi-color, or lightly-tagged) feel like fixed categories even though the long
run is less absolute.

## Root cause: what the unconstrained data shows

The figures in this section come from 3000 **unconstrained** pools, to isolate
the algorithm's own biases. The Dreamcaller-gated flow shows the same skew —
e.g. default gated card inclusion ranges 1.3%–80.9% with 10 cards below 5%, and
78 of 142 archetypes are selected under 1% — because gating only restricts which
archetypes seed each pool; it does not change how the generator weights cards
within a pool.

### Inclusion-rate distribution (3000 unconstrained pools)

| Inclusion rate | Cards |
| --- | --- |
| 100% | 31 |
| 90–99% | 0 |
| 70–90% | 4 |
| 50–70% | 25 |
| 30–50% | 162 |
| 10–30% | 263 |
| 1–10% | 24 |
| <1% (>0) | 0 |
| never (0%) | 0 |

The 100% band is exactly the 31 core cards. There is then a hard gap (nothing
between 90% and 99%) before a long tail centered in the 10–30% range.

### Pool slot concentration

| Top N cards | Share of all pool slots |
| --- | --- |
| 31 | 17.9% |
| 50 | 25.2% |
| 100 | 39.2% |
| 150 | 50.2% |
| 200 | 59.9% |

Average pool size is 202.8 slots, so the top 150 of 509 cards fill half of an
average pool.

### Inclusion rate vs. card metadata

Inclusion rate climbs steadily with how many **color lists** a card is legal in:

| Color lists | Avg inclusion |
| --- | --- |
| 0 | 11.5% |
| 6 | 32.9% |
| 9–10 | ~31% |
| 12 | 40.7% |
| 15 | 65.2% |
| 16 | 66.4% |
| 19 | 91.3% |

…and with how many **draft archetypes** it belongs to:

| Draft archetypes | Avg inclusion |
| --- | --- |
| 0 | 11.6% |
| 5+ | 19.2% |
| 10+ | 29.7% |
| 15+ | 39.2% |
| 20+ | 44.8% |
| 25+ | 49.7% |
| 30+ | 94.3% |

Archetype breadth also inflates **copy counts**: the broadest cards trend toward
two copies (e.g. *Lunar Hart*, 19 color lists / 35 archetypes, averages 1.47
copies when present), while narrow cards stay at 1.00.

### Theme selection

The most- and least-selected themes diverge by two orders of magnitude:

```
most selected:   D:g-big-ramp 12.5%   A:warrior-combo 12.2%   D:u-artifacts 9.0%
                 A:warrior-aggro 8.3%  D:w-weenie 8.3%         A:abandon 7.9%
least selected:  D:urg-storm 0.0%   D:wur-academy 0.0%   D:wubg-value 0.0%   (…)
```

Selection rate of a color-archetype (`D:`) theme collapses with the number of
colors it requires, because the theme is only a candidate when the rolled
identity contains all of its colors:

| Theme colors | Avg selection rate | Themes |
| --- | --- | --- |
| 1 | 4.45% | 22 |
| 2 | 1.59% | 52 |
| 3 | 0.22% | 31 |
| 4 | 0.05% | 5 |

For mechanic (`A:`) themes, raw size is *not* the driver — connectivity is.
*warrior-combo* (90 cards) is chosen 12.2% of the time while the larger
*discard-madness* (114 cards) is chosen 3.2% and *storm* (59) only 2.2%.

### Color identity

Two-color identities dominate (~5% each); mono-color and four-color are rarer
(~2% and ~3%). Only **30 of the 31 possible identities** ever appear — the
five-color `wubrg` identity is never rolled, so content exclusive to it is
unreachable in unconstrained pools.

## Why this happens

Each effect maps cleanly onto a step of the generation algorithm (see
`color_pool_generation_algorithm.md`).

1. **Core injection is a flat tax (the 17.9% floor).** The running tally starts
   with one copy of every core card, and later steps only ever remove *second*
   copies. So all 31 core cards survive into 100% of pools regardless of colors
   or themes. This alone makes ~18% of every pool identical.

2. **Legality breadth bias.** A card is legal only if some on-color color list
   vouches for it (step 2), and the fill step (step 5) ranks filler candidates
   by *how many on-color color lists contain them*. Both reward cards tagged
   into many color combinations: a card legal in 15–22 combos is on-color for
   almost every identity and is a top filler everywhere, while a card in 0–4
   combos rarely qualifies. This is the mechanism behind the color-list table
   above.

3. **Archetype breadth bias (and copy inflation).** Themes are archetype lists,
   and the synergy walk increments a card's count once per selected theme that
   contains it (step 4). A card in 30+ archetypes is in many themes at once, so
   it is "earned" in nearly every pool and accumulates toward two copies. Narrow
   cards are earned only when their one theme is picked.

4. **Rich-get-richer synergy walk.** The walk prefers themes that *overlap* with
   what is already selected, keeping the three best by overlap and weighting by
   overlap score (steps 4, `TOPK=3`, `ALPHA=1.0`). Well-connected themes — those
   sharing cards with many others — are therefore selected far more often than
   equally-sized but isolated themes. This is why connectivity, not size, ranks
   the mechanic themes.

5. **Multi-color theme starvation.** A `D:` theme is a candidate only when the
   rolled identity is a superset of its colors. With identity weights favoring
   two and three colors over only 30 reachable identities, a three-color theme
   is reachable in a handful of identities and a four-color theme in almost none.
   Cards exclusive to those themes are starved as a direct consequence.

6. **Identity weighting (secondary).** The color-count weights
   `{1:0.1, 2:0.5, 3:0.32, 4:0.08}` concentrate pools into two- and three-color
   identities and never roll five colors, compounding effects 2 and 5 for
   mono-color-only and `wubrg`-only content.

A useful distinction: effects 1, 2, 3, and 4 are **algorithmic** — they would
skew the distribution even on perfectly-tagged data. The rarest cards, however,
are partly a **data** artifact: the bottom of the tail is dominated by cards
with `0 color lists / 1 archetype` (e.g. *Liminal Striker* at 1.7%), which can
only enter through a single mechanic tide. Those are likely under-tagged in
`cards_v2.toml` rather than intentionally narrow.

## Recommendations

Ordered roughly by impact-to-effort. Each can be evaluated by re-running
`analyze-pool-diversity.mjs` before and after.

### High impact

1. **Make core inclusion partial and/or single-copy.** Core is the single
   largest lever on "the same cards every time." Options, smallest change first:
   - Cap core cards to one copy each (they already trend low, but this removes
     core 2-ofs from jitter entirely).
   - Include a *random subset* of core per pool (e.g. 60–70%) instead of all 31,
     turning the fixed 18% into a varying slice.
   - Shrink the core set itself and let the most generically useful cards re-earn
     their place through color/archetype membership.

2. **De-bias the fill step.** Ranking fillers by color-list breadth (step 5)
   directly amplifies effect 2. Replace it with uniform-random sampling among
   legal non-theme cards, or with *inverse-frequency* sampling that prefers cards
   not already pulled in by a theme. This widens the tail without touching
   coherence, since fill only runs when the pool is short.

3. **Address multi-color theme starvation.** Pick the color identity *from a
   target archetype* the way Dreamcaller seeding already does (choose a theme
   first, then set the identity to its colors) for some fraction of pools — this
   guarantees three- and four-color archetypes get represented. Alternatively
   raise the three/four-color identity weights, or give multi-color candidate
   themes a selection bonus once their identity is rolled.

### Medium impact

4. **Flatten the synergy walk.** Lower `ALPHA` toward 0 to make the weighted
   pick among the top candidates closer to uniform, and/or raise `TOPK` so more
   themes are eligible at each step. Optionally add a small exploration
   probability that picks a random qualifying theme regardless of overlap, so
   isolated-but-valid themes surface.

5. **Cap per-card dominance.** Limit how many distinct selected themes can count
   toward a single card's copies, or cap the number of fill slots any one broad
   card can win across the pool, so the very broadest cards stop monopolizing
   2-of status.

### Data hygiene

6. **Audit under-tagged cards.** The cards at the bottom of the tail have zero
   color-list membership and a single archetype. Confirm whether that is
   intentional; if not, adding appropriate `colors` / `draft-archetypes` tags is
   the most direct fix for "this card basically never shows up," independent of
   any algorithm change.

### Measurement

7. **Track diversity as a tuning signal.** `analyze-pool-diversity.mjs` already
   reports the inclusion histogram, concentration curve, and metadata
   correlations. Treat its output as the scoreboard when tuning the constants
   above — for example, target a lower core share, a shorter 100% band, and a
   higher selection floor for multi-color themes — and consider a regression
   check that fails if concentration regresses past a chosen threshold.

## Reproducing this analysis

```
node scripts/analyze-pool-diversity.mjs                     # gated default report
node scripts/analyze-pool-diversity.mjs --unconstrained     # raw algorithm report
node scripts/simulate-dreamcaller-pools.mjs --seeds 500     # per-Dreamcaller view
```

## The `diverse` variant

The recommendations above are implemented as a second generation variant,
`diverse`, selectable side by side with `default`. It deliberately leaves core
cards untouched (core is meant to be ever-present) and instead attacks the
non-core skew with two families of intervention from the recommendations:
*flattening* (algorithmic) and *alternate tagging* (reinterpreting how a card's
tags confer membership). Each lever maps to a root cause above.

**Flattening levers**

- **Theme-first identity** — instead of rolling colors first, the identity is
  taken from a chosen color-archetype, so every archetype can seed a pool and
  multi-color identities actually occur (addresses effects 5 and 6). With a
  Dreamcaller, the seed is drawn from that Dreamcaller's archetypes; otherwise
  from all color-archetypes.
- **Inverse-reach seeding** — the opening archetype is weighted by
  `1 / reach^1`, where *reach* is how many identities it can reach. Multi-color
  archetypes (which reach few identities) seed more often, so the multi-color
  identities that their themes need are rolled often enough to lift them out of
  the tail.
- **Inverse-reach theme walk** — the walk picks the next theme weighted by
  `1 / reach^1.5`. Broadly-eligible mechanic and one-color themes are
  down-weighted; niche and multi-color themes surface (addresses effect 4).
- **Theme budget** — a pool draws at most six themes, then fills the rest, so no
  pool is dominated by whichever archetypes happen to be eligible everywhere.

**Alternate-tagging levers**

- **Inverse-breadth card inclusion** — when a theme is added, each card is
  included with probability `min(1, 3 / themeBreadth)`, where *themeBreadth* is
  how many archetype themes the card is tagged into. A card tagged into 30
  archetypes contributes a fraction per theme; a card tagged into one is added
  reliably. This reinterprets multi-membership as *fractional* membership and
  flattens both inclusion rate and 2-of accumulation (addresses effect 3).
- **Inverse-legality fill** — shortfall fillers are sampled weighted by
  `1 / colorBreadth`, where *colorBreadth* is how many color combinations the
  card is legal in, so cards legal in few combos are favored when they are legal
  rather than crowded out by everywhere-legal staples (addresses effect 2).

Pool size still varies across the full 180–220 band (a random target per pool),
and core cards still seed every pool.

### Results

Over 5000 **Dreamcaller-gated** pools — the realistic flow, rotating uniformly
through all 32 Dreamcallers (`analyze-pool-diversity.mjs --compare`). Lower
coefficient of variation (CoV) means a flatter, more balanced distribution.

| Metric | default | diverse |
| --- | --- | --- |
| Non-core card inclusion CoV | 0.35 | **0.17** |
| Non-core card inclusion range | 1.3% – 80.5% | **20.5% – 60.3%** |
| Non-core cards below 5% | 10 | **0** |
| Archetype selection CoV | 1.22 | **0.54** |
| Archetype selection range | 0% – 10.1% | **1.0% – 12.5%** |
| Archetypes never selected | 3 | **0** |
| Archetypes below 1% | 77 | **0–1** |
| Top-50 cards' share of slots | 24.2% | 22.4% |

Under the gated flow every non-core card now appears in at least ~21% of pools
(up from a 1.3% floor), and every archetype is selected ~1% of the time or more
(the default starves 77 of 142 below 1%; under `diverse` only the single rarest
five-color label hovers right at the 1% line). The narrowly-tagged cards the
default variant buries — e.g. *Liminal Striker* (`0 color lists / 1 archetype`)
— rise from ~1.7% to the low tens of percent. The trade-off is coherence: a
diverse pool is a few focused archetypes plus a broad, evenly-sampled remainder
rather than a tight synergy cluster, and it carries more 1-ofs (higher unique
count).

The same comparison on raw unconstrained pools (`--compare --unconstrained`)
is similar: card CoV 0.43 → 0.26, archetype CoV 1.40 → 0.49.

### Residual limits

Two effects survive and are best addressed in the data, not the algorithm:

- The rarest cards (the `0 color lists / 1 archetype` ones) sit at the bottom of
  the ~21–60% gated band. Lifting them to the middle means tagging them into more
  colors/archetypes in `cards_v2.toml`.
- Per-archetype balance across color counts is bounded by color structure: a
  four-color archetype needs a four-color pool, which is intrinsically rarer.
  Inverse-reach seeding lifts every archetype above 1% (gated max 12.5%, median
  ~3.7%) but the higher-color archetypes still cluster toward the lower end.

### Using, tuning, reverting, or promoting the variant

- **In the draft test harness:** append `?algo=diverse` (or `?algo=default`) to
  the `/draft_test` URL, or click the variant chip in the pool header to switch.
  Open the two URLs side by side to compare.
- **In tooling:** `node scripts/generate-color-pool.mjs --variant diverse`,
  `node scripts/analyze-pool-diversity.mjs --variant diverse` (or `--compare`).
- **Tuning:** every knob lives in the `DIVERSE` constant in
  `src/draft_test/color-pool.ts` (`seedExponent`, `reachExponent`, `themeBudget`,
  `inclusionK`, `fillExponent`, `walkExploration`); re-run `--compare` to see the
  effect.
- **Promote to primary:** set `DEFAULT_POOL_VARIANT = "diverse"` in
  `color-pool.ts`. The URL parameter still selects either variant for
  comparison.
- **Revert:** set `DEFAULT_POOL_VARIANT = "default"` (the current default) to
  fall back everywhere, or delete `generateDiverse` and its helpers and the
  `"diverse"` branch in `generatePoolFromData` to remove the experiment entirely.
  The `default` algorithm is untouched by the variant and is covered by the
  byte-for-byte parity test.

# Dreamtides — Synergistic Card Pool Generation

An algorithm that combines the per-archetype card lists into a random card pool
of 180–220 cards, where each card appears at most twice. The pool is randomized
run-to-run but is always a *synergistically coherent* selection of neighboring
archetypes rather than an arbitrary mix.

## Inputs

- **`tides`** in `data/tabula/cards_v2.toml` — grouping cards by their tide base
  name yields 16 archetype lists. Each is a curated, combo-aware grouping that
  corresponds to an archetype in
  [`dreamtides_archetypes.md`](dreamtides_archetypes.md).
- **`core = true`** in `data/tabula/cards_v2.toml` — the ~30 "any-deck" filler
  cards that fit into every pool.

The 16 archetype lists slice a single ~461-card universe by
mechanic/synergy. Their sizes range from 25 (`fading-farewell`) to 126
(`abandon`).

## Design goals and the central tension

1. **Synergy is paramount.** The pool must read as a small set of archetypes
   that actually want to be drafted together, with their two-card combos and
   synergy pieces intact.
2. **Randomness is secondary but required.** Every run must produce a different,
   plausible pool.

These pull against each other. The design resolves the tension by keeping the
two concerns on separate axes:

- **Synergy** comes from *which* lists may combine — only lists that are
  *neighbors* (share cards with what is already selected) are ever added, and
  lists are always added **whole**, so no combo is ever split.
- **Randomness** comes from three card-preserving sources: a random starting
  seed, weighted sampling among the several best neighbors at each step, and a
  per-run jitter that thins the shared 2-ofs to a random target size. None of
  these cuts a card out of a list, so combos stay intact.

## "Neighboring" is measured, not hand-labeled

The synergy between two lists is simply the number of cards they share. This
signal is strong and produces clean clusters. Top neighbor (shared-card count)
of each list:

| List | Strongest neighbors (shared cards) |
| --- | --- |
| `abandon` | warrior-combo (59), wake-the-fallen-combo (50), survivors (31) |
| `warrior-combo` | abandon (59), warrior-aggro (42), wake-the-fallen-combo (39) |
| `wake-the-fallen-combo` | abandon (50), warrior-combo (39), reclaim-combo (19) |
| `spirit-animals` | celestial-reverie-combo (29), cindermarch (15), blink (11) |
| `celestial-reverie-combo` | spirit-animals (29), blink (13), cheap-characters (11) |
| `blink` | outsiders (15), celestial-reverie-combo (13), spirit-animals (11) |
| `events` | storm (23), discard-madness (11), outsiders (9) |
| `storm` | events (23), wake-the-fallen-combo (15), discard-madness (12) |
| `discard-madness` | survivors (33), abandon (25), cheap-characters (16) |
| `survivors` | discard-madness (33), abandon (31), reclaim-combo (11) |

Three natural clusters emerge:

- **Void / aristocrats** — abandon ↔ warrior-combo ↔ wake-the-fallen ↔
  reclaim-combo ↔ fading-farewell ↔ survivors ↔ discard-madness.
- **Creatures / blink** — spirit-animals ↔ celestial-reverie ↔ blink ↔
  outsiders, with cindermarch on the awaken edge.
- **Spells / value** — events ↔ storm, bleeding into discard-madness.

## The algorithm

```
constants:  LO = 180, HI = 220, TOPK = 3, ALPHA = 1.0, JIT = 15

generate():
  selected  = []                         # archetype lists chosen, in order
  count[c]  = multiset; start = core.txt  # core is always the base layer

  seed = uniform-random archetype list
  add seed to selected; count += seed

  # --- 1. grow by neighbor walk ---
  while poolSize(count) < LO:
    union = set of all cards in any selected list
    cands = [ (L, |cards(L) ∩ union|) for L not in selected ]
    cands = [ (L, s) for (L, s) in cands if s > 0 ]   # strict: synergy required
    if cands is empty: break
    take the TOPK candidates with the highest score s
    pick one, with probability ∝ s^ALPHA              # weighted random
    add pick to selected; count += pick

  # --- 2. pick a random target size near the top of the band ---
  cap    = min(poolSize(count), HI)
  target = uniform-random integer in [ max(LO, cap - JIT) , cap ]

  # --- 3. jitter: demote a RANDOM subset of 2-ofs to 1-ofs down to target ---
  twos = shuffle([ c for c in count if count[c] >= 2 ])
  for c in twos:
    if poolSize(count) <= target: break
    count[c] = 1                         # removes a 2nd copy, never the card

  # --- 4. fringe-trim fallback (only if still over, e.g. huge clusters) ---
  if poolSize(count) > target and len(selected) > 1:
    last   = cards of the most recently added list
    others = core ∪ cards of every earlier selected list
    fringe = shuffle([ c in last if c not in others ])  # cards UNIQUE to last
    for c in fringe:
      if poolSize(count) <= max(target, LO): break
      remove c from count

  return selected, count

poolSize(count) = Σ over cards of min(2, count[card])
```

### Copy counts and the 2-copy cap

Before the jitter step, a card's copy count is **the number of selected lists
that contain it, capped at 2** (`core` counts as one of those lists). So a card
shared by two or more selected lists is a candidate 2-of, and a card found in
only one selected list is a 1-of. This weights the staples that multiple
neighboring archetypes share up to a playset of two, while fringe cards stay as
singletons. `poolSize` counts these capped copies, so the 180–220 target is
measured in total cards including duplicates.

### How randomness is injected (steps 2–3)

A neighbor walk alone is nearly deterministic: a given set of lists produces a
fixed card set, so two runs that land on the same cluster yield the same pool.
The jitter step breaks that. Each run rolls a **random target size** within
`JIT` of the cluster's natural ceiling, then **demotes a random subset of the
shared 2-ofs back to single copies** until the pool reaches that size. Two runs
on the same cluster now differ in both their size and *which* staples are kept
as 2-ofs, so identical pools become rare.

Crucially, demotion **never removes a card** — it only drops a second copy — so
every synergy piece and two-card combo in the cluster is still present. This is
strictly safer for combos than cutting cards, which is why it is the primary
size-control mechanism.

### Why the fallback trim is safe for combos

The fringe trim (step 4) only fires for the rare oversized cluster whose unique
cards alone exceed the target even after every 2-of has been demoted. It removes
**only the fringe of the last-added list** — cards that appear in *no other*
selected list and are therefore un-reinforced 1-ofs. Cards shared between
selected lists (the synergy backbone, including every two-card combo whose
halves live in two of the chosen lists) are never eligible for trimming.

### Tunable knobs

- **`TOPK`** — how many of the best neighbors are sampling candidates each step.
  `1` is a deterministic greedy walk (minimum variety); larger values add
  variety while staying inside the cluster. Default `3`.
- **`ALPHA`** — exponent on the overlap weight when sampling. Higher values bias
  harder toward the single best neighbor (tighter synergy); `0` makes the TOPK
  choice uniform (more variety). Default `1.0`.
- **`JIT`** — how far below the cluster's natural ceiling the random target may
  fall. Larger values demote more 2-ofs (more run-to-run variety and smaller,
  lower-duplicate pools); smaller values keep pools near the top of the band
  with more staple 2-ofs intact. Default `15`.
- **Seed weighting** — seeds are chosen uniformly across the 16 lists by
  default, so small fringe archetypes seed as often as large ones. Weighting by
  list size would instead bias toward the large central archetypes.

## Evidence

A reference implementation was run to validate four properties: size in band,
cluster coherence, run-to-run variety, and preserved staple 2-ofs.

### Individual runs (deterministic per-trial seeds, for reproducibility)

```
#0 size=186 uniq=153 2-ofs= 33 | core + warrior-combo + wake-the-fallen-combo
#1 size=208 uniq=175 2-ofs= 33 | core + celestial-reverie-combo + blink + cheap-characters + spirit-animals
#2 size=210 uniq=210 2-ofs=  0 | core + events + storm + discard-madness
#3 size=202 uniq=164 2-ofs= 38 | core + spirit-animals + cindermarch-shadow-soloist-combo + celestial-reverie-combo
#5 size=205 uniq=178 2-ofs= 27 | core + abandon + wake-the-fallen-combo
```

Each pool is a recognizable cluster — a warrior/aristocrats pool, a
creatures/blink pool, a spells/value pool, a creatures/awaken pool, an
aristocrats pool — and none mixes unrelated strategies. (#2 is an all-singleton
pool: the loosely-overlapping spells cluster has few shared staples, and this
run's low target demoted the rest.)

### Distribution over 5,000 random runs

```
runs=5000
size: min=180  p50=206  max=220  in[180,220]=100%
2-ofs per pool: p50=27  max=56  all-singleton runs=645 (13%)
distinct list-combinations: 65
distinct card pools: 4636 (92.7% of runs unique)
exact repeats: 364 (7.3%)
most common single pool: 51 times (1.02%)
```

Interpretation:

- **Size.** 100% of runs land in [180, 220], spread across the upper band
  (median 206). Each pool is `core` (30 cards) plus 2–4 neighboring archetypes.
- **Coherence.** Only 65 distinct list-combinations are ever produced, all
  within-cluster pairings or triples from the three clusters above — no
  cross-cluster noise.
- **Variety.** 92.7% of runs are unique card pools, and the single most common
  pool appears only 1.02% of the time.
- **Staples preserved.** A median of 27 cards are 2-ofs; 13% of runs are
  all-singleton, almost all from the loosely-overlapping spells cluster, which
  has few shared staples to begin with.

### What the jitter step contributes

Steps 2–3 are what produce run-to-run variety, and an ablation shows their
effect. With the jitter disabled (target fixed at the cluster ceiling, no
demotion), a cluster's fixed card set reproduces the same pool every time it is
selected: across 5,000 runs only **2,277** distinct pools appear, **54.5%** of
runs are exact repeats, and the most common single pool recurs **305 times
(6.1%)**. With the default `JIT=15`, distinct pools rise to **4,636 (92.7%
unique)** and the worst-case repeat drops to **51 (1.02%)**, while every pool
stays in band and synergistically coherent.

| Metric | Jitter disabled | `JIT=15` (default) |
| --- | --- | --- |
| Distinct card pools / 5,000 | 2,277 | 4,636 |
| Runs that are unique pools | 45.5% | 92.7% |
| Most common single pool | 305 (6.1%) | 51 (1.02%) |
| In [180, 220] | 99% | 100% |

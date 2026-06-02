# Dreamtides — Synergistic Card Pool Generation

An algorithm that combines the per-archetype card lists into a random card pool
of 180–220 cards, where each card appears at most twice. The pool is randomized
run-to-run but is always a *synergistically coherent* selection of neighboring
archetypes rather than an arbitrary mix.

## Inputs

- **`docs/archetype_lists/*.txt`** — 16 archetype lists, one card name per line.
  Each is a curated, combo-aware grouping that corresponds to an archetype in
  [`dreamtides_archetypes.md`](dreamtides_archetypes.md).
- **`docs/archetype_lists/core.txt`** — 30 "any-deck" filler cards that fit into
  every pool.

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
- **Randomness** comes from a random starting seed plus weighted sampling among
  the several best neighbors at each step — never from cutting cards out of a
  list.

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
constants:  LO = 180, HI = 220, TOPK = 3, ALPHA = 1.0

generate():
  selected  = []                         # archetype lists chosen, in order
  count[c]  = multiset; start = core.txt  # core is always the base layer

  seed = uniform-random archetype list
  add seed to selected; count += seed

  # --- grow by neighbor walk ---
  while poolSize(count) < LO:
    union = set of all cards in any selected list
    cands = [ (L, |cards(L) ∩ union|) for L not in selected ]
    cands = [ (L, s) for (L, s) in cands if s > 0 ]   # strict: synergy required
    if cands is empty: break
    take the TOPK candidates with the highest score s
    pick one, with probability ∝ s^ALPHA              # weighted random
    add pick to selected; count += pick

  # --- trim overshoot (fringe-only) ---
  if poolSize(count) > HI and len(selected) > 1:
    last   = cards of the most recently added list
    others = core ∪ cards of every earlier selected list
    fringe = [ c in last if c not in others ]   # cards UNIQUE to the last list
    shuffle fringe
    while poolSize(count) > HI and fringe not empty:
      remove the next fringe card from count

  return selected, count

poolSize(count) = Σ over cards of min(2, count[card])
```

### Copy counts and the 2-copy cap

A card's copy count in the pool is **the number of selected lists that contain
it, capped at 2** (`core` counts as one of those lists). So a card shared by two
or more selected lists is a 2-of, and a card found in only one selected list is
a 1-of. This naturally weights the staples that multiple neighboring archetypes
share up to a playset of two, while fringe cards stay as singletons.
`poolSize` counts these capped copies, so the 180–220 target is measured in
total cards including duplicates.

### Why the trim is safe for combos

Overshoot is handled by trimming **only the fringe of the last-added list** —
cards that appear in *no other* selected list and are therefore 1-ofs that
nothing else in the pool reinforces. Cards shared between selected lists (the
synergy backbone, including every two-card combo whose halves live in two of the
chosen lists) are never eligible for trimming. Whole lists are never partially
added during the walk; trimming touches only un-reinforced singletons of the
final list, and only as much as needed to reach 220.

### Tunable knobs

- **`TOPK`** — how many of the best neighbors are sampling candidates each step.
  `1` is a deterministic greedy walk (minimum variety); larger values add
  variety while staying inside the cluster. Default `3`.
- **`ALPHA`** — exponent on the overlap weight when sampling. Higher values bias
  harder toward the single best neighbor (tighter synergy); `0` makes the TOPK
  choice uniform (more variety). Default `1.0`.
- **Seed weighting** — seeds are chosen uniformly across the 16 lists by
  default, so small fringe archetypes seed as often as large ones. Weighting by
  list size would instead bias toward the large central archetypes.

## Evidence

A reference implementation was run to validate the three properties: size in
band, run-to-run variety, and cluster coherence.

### Individual runs (deterministic per-trial seeds, for reproducibility)

```
#0  size=193  uniq=153  2-ofs= 40  lists: core + warrior-combo + wake-the-fallen-combo
#1  size=220  uniq=158  2-ofs= 62  lists: core + celestial-reverie-combo + blink + cheap-characters + spirit-animals
#2  size=220  uniq=174  2-ofs= 46  lists: core + events + storm + discard-madness
#3  size=202  uniq=164  2-ofs= 38  lists: core + spirit-animals + cindermarch-shadow-soloist-combo + celestial-reverie-combo
#5  size=220  uniq=169  2-ofs= 51  lists: core + abandon + wake-the-fallen-combo
```

Each pool is a recognizable cluster: a warrior/aristocrats pool, a
creatures/blink pool, a spells/value pool, a creatures/awaken pool, and an
aristocrats pool. None mixes unrelated strategies.

### Distribution over 5,000 random runs

```
runs=5000
size: min=181  p50=219  max=237  in[180,220]=99.0%
lists-per-pool distribution: {2 lists: 2453, 3 lists: 2191, 4 lists: 356}
distinct clusters produced: 65
top clusters by frequency:
   6.1%  discard-madness + survivors
   5.8%  blink + celestial-reverie-combo + spirit-animals
   5.7%  abandon + wake-the-fallen-combo
   5.2%  abandon + warrior-combo
   5.0%  warrior-aggro + warrior-combo
   4.0%  wake-the-fallen-combo + warrior-combo
   3.9%  abandon + survivors
   3.1%  cheap-characters + discard-madness
   3.1%  celestial-reverie-combo + cindermarch-shadow-soloist-combo + spirit-animals
   2.7%  abandon + cheap-characters
   2.6%  blink + outsiders + spirit-animals
   2.6%  discard-madness + events + storm
```

Interpretation:

- **Size.** 99% of runs land in [180, 220]. Each pool is `core` (30 cards) plus
  2–4 neighboring archetypes.
- **Variety.** 65 distinct list-combinations appear, with the most common
  occurring only ~6% of the time — broad spread, no single dominant output.
- **Coherence.** Every frequent combination is a within-cluster pairing or
  triple from the three clusters above; no cross-cluster noise.
- **Residual overshoot.** ~1% of runs finish above 220 (worst observed 237).
  This happens when the last-added list's fringe is too small to trim the pool
  back to 220 — the trim deliberately refuses to touch the shared synergy
  backbone, so it accepts a small overshoot rather than cut a reinforced card.
  Raising the cap to ~240 for these runs, or sampling a smaller neighbor when the
  best one would overshoot, would close the gap if a hard 220 ceiling is needed.

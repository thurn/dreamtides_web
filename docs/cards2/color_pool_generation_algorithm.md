# Dreamtides — Color-Identity Card Pool Generation

An algorithm that builds a random card pool of 180–220 cards by combining three
families of curated card lists around a randomly chosen **color identity**. Each
card appears at most twice. The pool changes every run but is always a
color-coherent, synergistic selection rather than an arbitrary mix.

## Inputs

The generator reads per-card membership metadata from
`data/tabula/cards_v2.toml`. Each card record carries the fields the generator
needs, and three families of lists are reconstructed from them:

- **`core`** — a boolean flag. Cards with `core = true` are the ~30 "any-deck"
  filler cards that seed every pool.
- **`tides`** — the card's mechanic-archetype memberships (abandon, storm,
  spirit-animals, warrior-combo, …). Grouping cards by their tide base name
  yields the 16 *mechanic* archetype lists, each a curated, combo-aware grouping
  of cards that want to be played together for a mechanical reason. (The
  `… Splash` tide variants are membership annotations for the card editor and do
  not form separate lists.)
- **`colors`** and **`draft-archetypes`** — the card's *color* list memberships.
  Each list name is a **color-identity prefix** drawn from the five colors
  `w u b r g`, optionally followed by an archetype suffix:
  - **Bare-color lists** (`colors`: `b`, `wu`, `ubr`, `wubrg`, …) — broad pools
    of cards legal in that color identity. These range from ~70 cards (mono) to
    ~378 (all five colors).
  - **Color+archetype lists** (`draft-archetypes`: `br-aristocrats`, `ur-storm`,
    `wu-blink`, `g-ramp`, …) — focused archetype slices constrained to a color
    identity.

Inverting these fields across all cards reconstructs `core`, 16 mechanic
archetype lists, and 157 color lists, spanning a universe of **509 distinct
cards**.

## Why color identity is the organizing principle

A limited-format card pool is most naturally defined by *color identity*: a
two- or three-color pool that a player can commit to and draft within. The
`colors` and `draft-archetypes` list names encode exactly this structure, and
the data shows it is a strong, independent axis:

- **Color nesting is real but soft.** A smaller color identity's cards are
  mostly contained in a larger one that includes it (`b` ⊆ `br` ≈ 0.90; a
  color+archetype slice sits ~0.75–1.0 inside its bare-color list), so lists
  that share colors share cards — but the lists are independently curated, not
  literal supersets.
- **Color is independent of mechanics.** Each mechanic archetype maps only
  weakly onto any single color list (best-match Jaccard 0.12–0.42). The void
  "abandon" theme leans black/red, the "spirit-animals" theme leans green, and
  so on, but no color list *is* a mechanic archetype. Color identity is
  therefore a genuinely separate dimension that can gate which mechanic
  archetypes are allowed to share a pool.

The generator uses color identity as the **backbone** (which cards are legal
together) and the mechanic archetypes as **themes** layered on top (what the
pool is trying to do).

## Design goals

1. **Color coherence.** Every card in a pool is legal in one chosen color
   identity, so the pool reads as a real two/three-color draft environment.
2. **Synergy.** Within that identity the pool is built from a few overlapping
   themes, with their two-card combos and synergy pieces intact.
3. **Randomness.** Every run produces a different, plausible pool.

## The algorithm

```
constants:  LO = 180, HI = 220
            K_WEIGHTS = {1: .10, 2: .50, 3: .32, 4: .08}  # colors per pool
            T_ON  = 0.55      # archetype "on-color" threshold
            TOPK  = 3,  ALPHA = 1.0,  JIT = 15

prefix(list)      = leading run of w/u/b/r/g in the list name ('' if none)
poolSize(count)   = Σ over cards of min(2, count[card])

generate():
  count = multiset; start = core              # core is always the base layer

  # --- 1. choose a color identity C ---
  k = weighted-random size from K_WEIGHTS
  C = random k-subset of {w,u,b,r,g}

  # --- 2. legal card pool + candidate themes for this identity ---
  onColorDraft = [ D in color lists : prefix(D) ⊆ C and prefix(D) ≠ '' ]
  legal        = core ∪ ⋃ { cards(D) : D in onColorDraft }   # everything in-identity

  themes = {}
  for each mechanic archetype A:
      if |cards(A) ∩ legal| / |cards(A)| ≥ T_ON:    # A fits these colors
          themes[A] = cards(A) ∩ legal              # restricted to legal cards
  for each D in onColorDraft with an archetype suffix:
      themes[D] = cards(D)                          # color+archetype slices

  # --- 3. synergy walk among themes (overlap-weighted), staying on-color ---
  seed = random theme; add seed to selection; count += seed
  while poolSize(count) < LO and unused themes remain:
      union = cards of all selected themes
      cands = [ (Theme, |cards(Theme) ∩ union|) ] for unused themes, score > 0
      take the TOPK highest-scoring; pick one with probability ∝ score^ALPHA
      add pick to selection; count += pick

  # --- 4a. if still short, fill with on-color staples ---
  if poolSize(count) < LO:
      freq[c] = number of onColorDraft lists containing c
      add not-yet-present cards as 1-ofs in descending freq until poolSize ≥ LO

  # --- 4b. jitter to a random target near the ceiling ---
  cap    = min(poolSize(count), HI)
  target = random integer in [ max(LO, cap - JIT), cap ]
  demote a RANDOM subset of 2-ofs to 1-ofs until poolSize(count) ≤ target
  if still above target: trim fringe cards unique to the last theme (fallback)

  return C, selection, count
```

### How the three families combine

The most important thing to understand is that **a bare-color list is never
poured into the pool as a unit.** The unit of selection is a *color identity*,
not a file, and each family plays a distinct role:

- **`core`** is always the base layer, guaranteeing a spine of universally useful
  cards in every pool.
- **Bare-color draft lists** (`u`, `ub`, `ubr`, …) are **never themes** — they
  carry no archetype, so adding one wholesale would just be "every blue-black-red
  card," which is both incoherent and far too large (a single three-color list
  can exceed the 220 cap on its own). Instead they play two supporting roles:
  1. **They define `legal`.** The union of every on-color bare list, plus core,
     is the set of cards permitted in the chosen identity. A card can only ever
     enter the pool if it is in `legal`.
  2. **They are the fill reservoir.** When the themed pool comes up short
     (step 4a), cards are drawn from these lists ranked by how many on-color
     lists contain each one — i.e. the most generically good on-color cards
     first.
- **Color+archetype draft lists** (`ur-welder`, `br-aristocrats`, …) and
  **on-color mechanic archetypes** are the **themes** (step 3) that give the
  pool its synergistic identity — the cards that actually get added. A bare-color
  list's cards therefore reach the pool only when they are *also* in a chosen
  theme, or when they are pulled as fill. A mechanic archetype qualifies as a
  theme only when at least `T_ON` of its cards are legal in the chosen colors, so
  a green creature theme never surfaces in a blue-black-red pool.

So a card's path into the pool is always: it must be `legal` (a bare-color list
vouches for its color), **and** it must be earned by a selected theme or drawn
as fill. The bare lists set the boundary; the themes and fill populate inside it.

### Copy counts and the 2-copy cap

A card's copy count is the number of selected sources (core, themes) that
contain it, capped at 2. A card shared by two or more selected sources is a
2-of; a card from a single source — or added as a fill staple — is a 1-of.
`poolSize` counts these capped copies, so the 180–220 target is measured in
total cards including duplicates.

### How randomness is injected

Variety comes from four card-preserving sources, none of which cuts a card out
of a theme:

1. **The color identity** — both how many colors (`K_WEIGHTS`) and which ones.
2. **The seed theme** and the **weighted walk** among the top neighbors at each
   step.
3. **Which on-color staples** are drawn during fill.
4. **The per-run jitter target**, which then **demotes a random subset of the
   shared 2-ofs to single copies** to reach that size.

The jitter is essential: a fixed identity and theme set otherwise produces a
fixed card set. Rolling a random target within `JIT` of the cluster's natural
ceiling and demoting a random subset of 2-ofs makes two runs on the same
identity differ in both size and *which* staples are kept as 2-ofs.

### Why size control is safe for combos

Demotion (the primary size-control step) removes a *second copy*, never a card,
so every synergy piece and two-card combo in the selected themes stays present.
The fringe trim is a fallback that fires only for the rare oversized identity
whose unique cards alone exceed the target; it removes only cards unique to the
last-added theme (un-reinforced 1-ofs), never cards shared between themes.

### Tunable knobs

- **`K_WEIGHTS`** — distribution over how many colors a pool spans. Defaults
  favor two- and three-color identities, matching typical draft environments.
- **`T_ON`** — how on-color a mechanic archetype must be to qualify as a theme.
  Higher values keep pools more strictly within their colors; lower values let
  more cross-color themes in.
- **`TOPK` / `ALPHA`** — breadth and bias of the theme walk. `TOPK = 1` is a
  deterministic greedy walk; higher `ALPHA` biases harder toward the single best
  neighbor.
- **`JIT`** — how far below the natural ceiling the random target may fall.
  Larger values demote more 2-ofs (more variety, smaller pools); smaller values
  keep pools near the top of the band with more staple 2-ofs intact.

## Worked example: a blue-black-red (`ubr`) pool

Suppose step 1 rolls the three-color identity `C = {u, b, r}`.

**Step 2 — gather the on-color lists.** 37 draft lists have a color prefix that
is a subset of `{u, b, r}`. Seven are bare-color lists, and these define the
boundary of the pool (they are *not* added as themes):

```
bare-color lists (define `legal` and the fill reservoir):
   246  ubr      208  br       130  u       69  b
   226  ur       180  ub        98  r
```

Their union with `core` is `legal` = **406 cards** — every card playable in
U/B/R. Note the `ubr` list alone is 246 cards, already larger than the 220-card
pool; this is exactly why bare lists are boundaries, not themes.

The remaining 30 on-color draft lists carry archetype suffixes and *are*
eligible themes (`ur-welder`, `br-aristocrats`, `ub-storm`, `ubr-control`, …).
Alongside them, the mechanic archetypes are filtered by the `T_ON = 0.55`
on-color test:

```
qualify as themes (≥55% on-color): abandon 87%, storm 98%, events 95%,
   fading-farewell 96%, survivors 92%, warrior-aggro 91%, warrior-combo 91%,
   outsiders 87%, discard-madness 85%, wake-the-fallen 85%, …
excluded (too off-color): spirit-animals 39%, cheap-characters 54%
```

**Steps 3–4 — build the pool.** One run (with a fixed seed) walks:

```
STEP 0  core ................................ poolSize 30
STEP 1  seed theme  D:u-artifact-control ..... poolSize 57
STEP 2  + A:warrior-aggro   (overlap 17) ..... poolSize 124
STEP 3  + D:ur-welder       (overlap 53) ..... poolSize 239   ← over the cap
JITTER  target 206; demote 33 of 63 2-ofs .... poolSize 206
FINAL   size 206 · 176 unique · 30 two-ofs
```

The walk found a U/R artifact-and-welder shell, overshot 220, and the jitter
demoted 33 randomly-chosen second copies down to a random target of 206 —
removing duplicate copies, never whole cards, so every combo piece survives.
(Fill was not needed here because the walk already overshot; it would run only
if the walk had stopped below 180.)

**Where the `ubr` list ended up.** Of its 246 cards, **109 appear in this pool** —
the ones that happened to belong to the chosen artifact/welder/warrior themes
(or were vouched for as legal and reinforced into 2-ofs). The other 137 were
off-theme for this particular shell and simply did not get added. A different
seed under the same `{u, b, r}` identity would land on, say, a storm or
aristocrats shell and pull a different ~100–120 of those 246 cards. That is
where the run-to-run variety within a single color identity comes from: the
identity fixes the 406-card boundary, and the themes choose which slice of it
becomes the pool.

## Evidence

A reference implementation was run to validate the four properties: size in
band, color coherence, synergistic themes, and run-to-run variety.

### Sample runs (deterministic per-trial seeds, for reproducibility)

Themes are labelled `A:` (on-color mechanic archetype) and `D:` (color+archetype
draft slice). The bracket is the chosen color identity.

```
#0 [ruw ] size=214 uniq=196 2of=18 | D:wr-artifact-aggro + D:wr-aggro
#1 [bw  ] size=219 uniq=212 2of= 7 | A:wake-the-fallen-combo + D:wb-weenie
#2 [gruw] size=214 uniq=197 2of=17 | D:ur-academy + D:wr-artifacts + D:wr-artifact-aggro
#3 [gu  ] size=181 uniq=135 2of=46 | D:g-big-ramp + D:ug-lands-soup
#5 [buw ] size=208 uniq=178 2of=30 | D:wu-weenie + D:w-weenie + D:wub-artifact-control
#6 [ruw ] size=183 uniq=142 2of=41 | A:cheap-characters + A:wake-the-fallen-combo + A:warrior-combo
#7 [ru  ] size=188 uniq=156 2of=32 | D:u-welder + D:ur-welder
```

Each pool is a recognizable color-and-strategy environment: a red-white artifact
aggro pool, a green ramp/lands pool, a blue-red welder pool, and so on. Every
selected theme is legal in the bracketed identity.

### Distribution over 5,000 random runs

```
runs=5000
size: min=180  p50=207  max=220  in[180,220]=100%
2-ofs per pool: p50=34  max=83  all-singleton runs=799 (16%)
distinct color identities produced: 30  (top: uw, bg, rw, bu, gr, gw)
colors-per-pool: {1: 513, 2: 2486, 3: 1616, 4: 385}
distinct card pools: 4807 (96.1% unique)
most common single pool: 87 times (1.74%)
reachable universe: 509 / 509 cards over 3,000 runs, incl. all
                    cards that appear only in draft lists
```

Interpretation:

- **Size.** 100% of runs land in [180, 220], spread across the upper band
  (median 207).
- **Color coherence.** All 30 reachable color identities appear, weighted toward
  the two- and three-color pools that make the best draft environments.
- **Variety.** 96.1% of runs are unique card pools; the single most common pool
  appears only 1.74% of the time.
- **Reach.** The pools collectively use all 509 cards in the universe,
  including every card that exists only in the color lists — the color corpus
  meaningfully widens what a pool can contain.
- **Staples preserved.** A median of 34 cards are 2-ofs. About 16% of runs are
  all-singleton, mostly the small or loosely-overlapping color identities whose
  themes share few cards to begin with.

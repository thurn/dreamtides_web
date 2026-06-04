# Draft Pool Construction Algorithms

The draft test mode (`draft_test`) builds a card pool that a player drafts
from. The pool is assembled by one of three interchangeable construction
algorithms, selected with the `?algo=` URL parameter: `default`, `diverse`, and
`decklists` (for example, `draft_test?algo=decklists`). All three live in
`src/draft_test/color-pool.ts`. This document explains, in detail, how each one
works.

This document is the canonical description of the three algorithms. It also
documents a fourth, experimental construction — the merged-archetype-lists
algorithm — which lives in `scripts/merged-archetype-pool-experiment.mjs` and is
evaluated against `decklists` by simulation rather than exposed as a production
`?algo=` variant.

## Shared foundations

Before any algorithm runs, the generator reconstructs a small set of inputs from
the card database and exposes a handful of common concepts that all three
algorithms build on.

### Where the data comes from

Nothing the algorithms read is invented at run time; every input is resolved
from a source file through a fixed pipeline. It is worth following that pipeline
once, because the rest of this document refers to these stores by name.

- **The card records** start in `data/tabula/cards_v2.toml`, a list of
  `[[cards]]` entries. Each entry carries the fields the generator cares about:
  `name`, `core` (a boolean staple flag), `tides` (mechanic tags such as
  `"Abandon"` or `"Storm"`), `colors` (the bare color-combo lists the card is
  legal in, e.g. `["b", "br", "wbr"]`), and `draft-archetypes` (the
  color-plus-archetype slices it belongs to, e.g. `["br-aristocrats",
  "wb-aristocrats"]`). The build step `scripts/setup-assets.mjs` parses that
  TOML, renames kebab-case keys to camelCase (`draft-archetypes` becomes
  `draftArchetypes`), and writes `public/cards_v2-data.json`. At run time
  `loadCardsV2Database` (in `cards-v2-database.ts`) fetches that JSON into a
  `Map<number, CardData>` keyed by card number.

- **The Dreamcaller records** start in `data/tabula/dreamcallers_v2.toml`, a list
  of `[[dreamcaller]]` entries. Each may carry a `draft-archetypes` list. The
  same build step writes `public/dreamcallers-v2-data.json`, and
  `loadDreamcallersV2` (in `dreamcallers-v2-database.ts`) fetches it into
  `DraftDreamcaller[]`. Crucially, a Dreamcaller's **theme** is *not* in the
  TOML: `loadDreamcallersV2` attaches it after fetching, by looking the
  Dreamcaller's name up in the hardcoded `DREAMCALLER_THEMES` map in
  `dreamcallers-v2-database.ts` (so `Kragg` resolves to `["abandon"]`). That map
  is the single source of truth for which mechanic a Dreamcaller pulls toward.

- **The real decklists** start as plain-text files in `docs/drafts_dt/` — one
  file per drafted deck, one card name per line. `scripts/setup-assets.mjs`
  reads every `*.txt`, keeps only the lines whose names exist in `cards_v2`
  (so the bundle never references unknown cards), drops empty files, and writes
  `public/decklists-data.json` as an array of arrays of names. `loadDecklists`
  (in `cards-v2-database.ts`) fetches it into `string[][]`, or returns an empty
  array if the bundle is missing.

The draft test page (`DraftTestApp.tsx`) loads all three at startup, then calls
`buildPoolData` once to fold the card records (and the decklists) into the single
`PoolData` structure described next. When the player picks a Dreamcaller, the
page calls `generatePoolFromData` with that `PoolData`, the chosen variant, and
the Dreamcaller's `draftArchetypes` and `themeArchetypes`. The pool the
algorithm returns is a multiset of card *names*; `resolvePool` then maps those
names back to card numbers (via a name-to-number index) for the draft engine to
consume.

### The reconstructed inputs

`buildPoolData` (in `color-pool.ts`) walks every card record once and folds it
into the structure all three algorithms consume — the `PoolData`:

- **Core cards** (`PoolData.core`). The set of card names whose record has
  `core = true`. These always seed every pool regardless of algorithm or colors
  — they are the universally playable staples.
- **Archetype lists** (`PoolData.archLists`). A map from each mechanic archetype
  to the set of card names in it. It is built from each card's `tides` field:
  every tide base name is mapped through the fixed `TIDE_TO_ARCHETYPE` table in
  `color-pool.ts` to a stable slug (`"Abandon"` to `abandon`, `"Storm"` to
  `storm`), and the card is added to that slug's set. These slugs are exactly the
  keys the `DREAMCALLER_THEMES` map uses, which is what lets a Dreamcaller's
  theme name a key in `archLists`.
- **Draft lists** (`PoolData.draftLists`). A map keyed by both *bare color
  combinations* (from each card's `colors` field, e.g. `ub`) and
  *color-plus-archetype slices* (from each card's `draftArchetypes` field, e.g.
  `ubr-control`). A bare color list has a name made purely of color letters; a
  color-plus-archetype list has a color prefix, a hyphen, then an archetype name.
- **Decklists** (`PoolData.decklists`). The `string[][]` of real decks, passed
  straight through from `loadDecklists`. Used only by the `decklists` algorithm;
  when absent it falls back to `default`.

The archetype and draft lists are re-keyed into a fixed, filename-style sort
order so that the order in which an algorithm visits themes is deterministic and
reproducible.

### Colors and color identity

The game uses five colors, abbreviated w, u, b, r, and g. A pool is built around
a **color identity** — a set of one to four of those colors. A list's *color
prefix* is the leading run of color letters in its name; a list is "on-color"
for a chosen identity when every letter of its prefix is one of the identity's
colors. The legal card pool for an identity is the union of the core cards and
every card in an on-color draft list.

### Themes

A **theme** is a named bundle of cards that an algorithm can fold into the pool
as a unit. Two kinds of theme exist:

- **Mechanic-archetype themes** (labeled `A:`), such as `A:storm`. A mechanic
  archetype becomes a candidate theme for an identity only when a sufficient
  fraction of its cards (at least 55%) are legal in that identity — this keeps
  off-color mechanic themes out. The theme's card set is intersected down to
  only the legal cards.
- **Color-plus-archetype themes** (labeled `D:`), such as `D:ubr-control`. These
  come directly from the on-color color-plus-archetype draft lists.

If an identity somehow has no qualifying themes, the algorithm falls back to
treating every on-color draft list as a theme so it always has something to
work with.

### Reproducibility and the copy cap

Each generation is driven by a seedable pseudo-random number generator. Passing
a seed reproduces a previous pool exactly; omitting it picks a fresh random seed
and records it on the result so the pool can be reproduced later. Across all
three algorithms, a card is capped at two copies in the final pool — every count
is clamped to at most two before the pool is returned, and the pool's reported
size counts copies with that cap applied.

### Dreamcaller seeding

In the normal draft-test flow the player first chooses a Dreamcaller, and that
choice feeds two optional pieces of guidance into pool construction. The two
come from *different* sources, which matters:

- **Seed archetypes** — the Dreamcaller's `draftArchetypes`, read from its
  `draft-archetypes` list in `dreamcallers_v2.toml`. These are
  color-plus-archetype list names (e.g. `br-aristocrats`), the same names that
  key `PoolData.draftLists`. Only those that exist in `draftLists` and carry a
  color prefix are eligible. They constrain the pool's color identity and (in the
  theme-based algorithms) which color-plus-archetype themes are allowed.
- **Theme archetypes** — the Dreamcaller's mechanic-archetype tide slugs (e.g.
  `abandon`), *not* read from the TOML but attached at load from the
  `DREAMCALLER_THEMES` map keyed by Dreamcaller name. These are the same slugs
  that key `PoolData.archLists`. They bias the `decklists` algorithm toward the
  Dreamcaller's mechanical theme; the `default` and `diverse` algorithms ignore
  them.

A Dreamcaller with no archetypes produces an unconstrained pool.

---

## The `default` algorithm

The `default` algorithm builds a pool around a single color identity and then
grows it by repeatedly adding the theme that overlaps most with what it has
already chosen — a "rich get richer" synergy walk that produces coherent,
strategy-focused pools.

### Choosing the color identity

If the Dreamcaller supplied eligible seed archetypes, the algorithm picks one of
them at random and adopts its color prefix as the identity. It remembers that
seed archetype as the opening theme, and it restricts the pool's allowed
color-plus-archetype themes to the Dreamcaller's list (on-color mechanic themes
still join freely).

Without seeding, the algorithm first chooses *how many* colors the identity
will have, drawn from a weighted distribution that strongly favors two-color
identities (a 50% chance), then three (32%), with mono-color (10%) and
four-color (8%) much rarer. It then picks that many colors at random.

### Assembling candidate themes

With an identity fixed, the algorithm computes the legal card set and gathers the
candidate themes: every on-color mechanic archetype that clears the 55%
legality bar, plus every allowed on-color color-plus-archetype list.

### The overlap-weighted synergy walk

The pool starts with the core cards (one copy each). The algorithm then opens the
walk by adding a theme — the seeded archetype's theme when there is one,
otherwise a random theme. Adding a theme means incrementing the copy count of
every card in it, so a card shared by several added themes accumulates toward two
copies.

It then repeats the following until the pool reaches the size floor (180 copies):
it forms the union of all cards already contributed by selected themes, scores
each remaining theme by how many of its cards fall in that union (its overlap
with what is already chosen), keeps the three highest-overlap candidates, and
picks among them with probability proportional to their overlap score. The
chosen theme is added, and the loop continues. Because selection is weighted by
overlap with the running union, each new theme tends to reinforce the existing
strategy, which is what makes the pool feel coherent. The walk stops early if no
remaining theme shares any card with the current selection.

### Filling, jitter, and trimming

Three finishing passes shape the final size and texture:

- **Fill.** If the walk ended below the floor, the algorithm fills with the
  most broadly shared on-color cards — ranking cards by how many on-color draft
  lists contain them and adding the top ones as single copies until the floor is
  reached.
- **Jitter.** To vary the size run to run, it picks a random target somewhere in
  a band up to 15 copies below the current size (never below the floor), then
  demotes a random subset of two-copy cards down to single copies until it hits
  that target. This gives pools that vary rather than always pinning to a fixed
  size.
- **Fringe trim (rare fallback).** If the pool is still over target, it removes
  cards that were contributed *only* by the last theme added — the most
  expendable, least-synergistic cards — until the target or the floor is reached.

The result is a pool centered on one color identity and a handful of mutually
reinforcing strategies, landing in the rough 180–220 range.

---

## The `diverse` algorithm

The `diverse` algorithm keeps the same color-identity skeleton as `default` but
deliberately *flattens* the distribution, so that cards and archetypes appear
across pools far more evenly. It was built to counter several biases in the
`default` walk: multi-color archetypes being starved, broadly tagged cards
showing up in nearly every pool, and the overlap walk's rich-get-richer
concentration. It does this at four points: seeding, walking, card inclusion,
and filling. Each is governed by a tuning knob.

### Inverse-reach seeding

The `diverse` algorithm seeds its identity from a single archetype just as
`default` does (and respects Dreamcaller seed archetypes the same way), but the
choice is no longer uniform. It computes each archetype theme's **reach** — the
expected number of pools in which that theme would be an on-color candidate,
weighted by how often each color identity comes up. Themes eligible in many
identities (mechanic themes and one-color themes) have high reach; multi-color
and niche themes have low reach. The seed is then weighted by the inverse of
reach (one over reach, raised to a tuning exponent), so the otherwise-starved
multi-color identities get seeded much more often.

### The inverse-reach walk

Instead of `default`'s overlap-weighted walk, the `diverse` walk normally picks
each next theme weighted by inverse reach again — pushing selection toward themes
that are eligible in fewer identities, countering the dominance of broadly
eligible mechanic and one-color themes. A tuning knob controls how strongly the
walk leans on this: at full strength every step is chosen by inverse reach; dialed
down, it falls back step by step to `default`'s overlap-weighted walk. The walk
also caps how many themes a pool draws (a budget of six by default) before it
stops adding themes and lets the uniform fill carry the rest, which further
flattens archetype usage.

### Inverse-breadth card inclusion

When `default` adds a theme it takes *all* of the theme's cards. The `diverse`
algorithm instead includes each card probabilistically. It computes each card's
**theme breadth** — how many archetype themes the card is tagged into — and
includes a card with probability equal to a small constant divided by that
breadth (capped at certainty). A card tagged into many themes is therefore
included only sometimes per theme, while a narrowly tagged card stays reliable.
This flattens both how often a card appears at all and how often it reaches two
copies.

### Inverse-color-breadth fill

After the walk, the `diverse` algorithm fills to a target size chosen uniformly
across the whole 180–220 band (not pinned near the floor). The fill samples
legal cards that are not yet in the pool, weighted by the inverse of each card's
**color breadth** — how many bare-color lists the card is legal in. This favors
cards legal in fewer color combinations, which are otherwise rarely fill
candidates, countering the bias toward cards that are legal almost everywhere.
The sampling is done without replacement using a weighted-key technique.

Two cleanup passes finish the job: if the legal set was too small to reach the
target with single copies, random single copies are promoted to two-ofs; and if
theme inclusion overshot the target, random two-ofs are demoted back down. The
outcome is a pool that still has a recognizable color identity and a few
archetypes, but whose card and archetype usage is markedly more even across many
generated pools.

---

## The `decklists` algorithm

The other two algorithms *synthesize* a pool by stacking up themes — bundles of
cards that share a tag. The `decklists` algorithm does something different: it
grows a pool out of **real, human-built decklists**. The premise is that real
decks already encode which cards actually play well together, so a pool grown
from them feels like a curated, single-archetype experience rather than a
tag-driven scoop. In one sentence: it picks one real deck to start from, then
repeatedly folds in the real decks most *similar* to it until the pool is full.
If no usable decklists are bundled, it falls back entirely to `default`.

### Vocabulary: the four moving parts

Most of the confusion in this algorithm comes from four terms that sound alike
but are distinct things. They are introduced here in the order they depend on
each other; the rest of the section is just these four spelled out.

- **Theme** — a *persistent bias*, fixed for the whole run, that pulls every
  later decision toward the Dreamcaller's mechanic. It is never a single choice;
  it is a gravity well. It comes from the Dreamcaller's *theme archetypes* — its
  mechanic-archetype slugs like `abandon` or `storm` (see Shared foundations) —
  and is expressed as a set of cards plus a 0-to-1 "how theme-dense is this deck"
  score. A Dreamcaller with no theme archetypes has no theme, and every bias
  below switches off.

- **Strategy** — a *single choice made once per run*: exactly one of the
  Dreamcaller's *seed archetypes*. A seed archetype is a color-plus-archetype
  draft list like `br-aristocrats` — a broad "these colors, this drafted
  archetype" grouping. The algorithm rolls one of the Dreamcaller's seed
  archetypes to be this pool's strategy; that single pick sets the pool's color
  identity and decides which real deck becomes the starter.

- **Starter** — *one real decklist*: the concrete seed the whole pool orbits.
  The strategy chooses it (the real deck that best embodies the rolled strategy),
  and everything afterward is measured by similarity to it.

- **Spine** — *a set of mechanic archetypes* (like `abandon`, `discard-madness`)
  that growth is allowed to absorb cards from. It is read off the starter (its
  dominant mechanics) plus the theme, and it acts as a gate on what later decks
  may contribute.

The key thing to hold onto is that **theme and spine live in one vocabulary —
mechanic archetypes — while strategy lives in another — color-plus-archetype
draft lists.** Each real card carries both kinds of tag: *what it mechanically
does* (its mechanic archetypes) and *which drafted color-archetypes it belongs
to*. The strategy is chosen in the second vocabulary; the spine and theme
operate in the first.

These four chain together: the **theme** biases which **strategy** gets rolled;
the strategy selects the **starter**; the starter's dominant mechanics (together
with the theme) define the **spine**; and the spine gates the snowball that
grows the pool. The theme also keeps a thumb on the scale at the starter and
snowball steps. The rest of this section walks that chain in order.

### Setup: the decklist corpus and what "similar" means

Before any of that, the algorithm prepares its corpus of real decklists, cached
per data set. It first drops unusable decks: those too small (fewer than 16
cards — partial or near-empty files with too little signal to anchor or match
on) and those too large (more than 34 cards — a few aggregate files that are not
really drafted decks and would swamp any similarity score).

Over the surviving decks it computes an **inverse-document-frequency (IDF)**
weight for every card: the log of the inverse of the fraction of decks the card
appears in. A card that shows up in nearly every deck gets a weight near zero; a
card that appears in only a handful of decks gets a high weight. Every measure
of "similar" and "fits" in this algorithm is a cosine over these IDF-weighted
card vectors. That is what makes "similar" mean *shares the distinctive cards*
rather than *shares the popular staples* — two decks both running the
near-omnipresent Abandon staples are not counted as similar on that account,
whereas two decks sharing the same rare payoff are. Each deck's vector length is
precomputed so these cosines are cheap.

### The theme: a card set and a density score

If the Dreamcaller has theme archetypes, the algorithm turns them into two
things it will reuse at every later step:

- The **theme card set** — the union, across the Dreamcaller's theme slugs, of
  the card sets stored at those slugs in `PoolData.archLists` (which were built
  from each card's `tides`). For an `abandon` Dreamcaller this is every Abandon
  card; for a `["storm", "events"]` Dreamcaller it is every Storm card plus every
  Events card.
- The **theme density** of a deck (the "theme cosine") — a 0-to-1 measure of how
  heavily that deck draws on the theme card set, IDF-weighted so distinctive
  theme cards count for more than ubiquitous ones.

When the Dreamcaller has no theme archetypes, the theme card set is empty, every
deck's theme density is zero, and every theme-bias multiplier below becomes one
— i.e. the pool is built with no theme bias at all.

### Step 1 — Roll the strategy

The algorithm now picks the pool's strategy: exactly one of the Dreamcaller's
seed archetypes (its `draftArchetypes`, which name keys in `PoolData.draftLists`)
that exist in `draftLists` and carry a color prefix. It does not pick uniformly —
it weights each candidate by how much that draft list (its card set in
`draftLists`) overlaps the theme card set, so a candidate full of theme cards is
rolled far more often than an off-theme one. Concretely, an
Abandon Dreamcaller whose seed archetypes include an aristocrats list and a
green-ramp list will roll aristocrats most of the time, because aristocrats
shares many cards with the Abandon theme and ramp shares few. (The strength of
that pull is a tuning exponent.)

The rolled strategy carries two things forward: its **color prefix becomes the
pool's color identity** (e.g. `br`), and its **card list becomes the yardstick
for choosing the starter** in the next step. A Dreamcaller with no seed
archetypes has no strategy — the identity is left open and the starter is simply
a random real deck.

### Step 2 — Pick the starter

The **starter** is the one real decklist the finished pool will orbit. With a
strategy in hand, the algorithm scores every real deck by its **fit** to the
strategy: the total IDF weight of the cards that deck shares with the strategy's
card list (so a deck that shares the strategy's distinctive cards scores far
above one that merely shares its staples). That fit is then multiplied by the
deck's theme density, so among equally-fitting decks the more theme-dense one is
preferred.

Rather than always taking the single best-scoring deck — which would make the
strategy produce the same pool every time — it keeps the top 25 by score and
samples one of them, weighted toward the higher scores. This is the algorithm's
main source of run-to-run variety: the same rolled strategy yields a different
starter, and therefore a different pool, each time. With no strategy rolled, the
starter is just a random deck.

### Step 3 — Read off the spine

The starter is a whole real deck, and real decks are not perfectly pure — a
br-aristocrats deck still carries a few off-archetype cards. If growth absorbed
every card of every similar deck, the pool would smear across many archetypes.
The **spine** prevents that: it is the set of mechanic archetypes that growth is
allowed to draw cards from, so the pool's card list stays one coherent strategy.

The spine is assembled from two sources. First, the Dreamcaller's theme
archetypes always go in, so a themed pool can never gate out its own theme —
this matters for splashy themes (like outsiders) that are rarely any single
deck's *dominant* mechanic. Then the algorithm looks at the starter, counts how
many of the starter's cards fall into each mechanic archetype, and adds the
most-represented ones until the spine holds its budget (two archetypes by
default, or more if the theme alone already needed more). The result is a spine
that captures the starter's primary and secondary mechanics plus the theme. A
card is "on the spine" if it belongs to any spine archetype; if the spine somehow
ends up empty, the gate is open and every card qualifies.

### Step 4 — Snowball similar decks onto the starter

Now the pool is grown. It begins seeded with the core staples (one copy each)
plus *every* card of the starter — the starter is added in full, unfiltered;
only the *neighbor* decks added next are spine-gated.

Each remaining real deck gets a **growth score**: its IDF-cosine similarity to
the *starter* — not to the pool as it grows, which keeps the whole pool orbiting
the one fixed starter instead of drifting — multiplied by that deck's theme
density, so the snowball keeps pulling in theme-dense decks rather than wandering
into whatever else happens to share the colors.

The algorithm then loops until the pool reaches its target size: it ranks the
unused decks by growth score, keeps the top ten, and samples one with a
low-temperature softmax — so it almost always takes the single most similar deck
but occasionally reaches a bit wider. From the chosen deck it folds in cards in
shuffled order (shuffling lets it stop exactly at the target), but **only the
cards that are on the spine**, bumping each card's count. A card reaches two
copies only when two different folded-in decks both contain it. The loop stops
early if it goes 30 iterations without adding anything (for example, when every
similar deck's on-spine cards are already present).

The target size is deliberately smaller than the other two algorithms — about
150 copies with a small random wobble — because this pool is meant to play as a
focused single-archetype pool, not a broad 180–220 draft pool.

### Identity and labels

Finally the algorithm settles what to display. When a strategy was rolled the
color identity is simply its color prefix, matching the other algorithms. For an
open pool (no strategy) it instead takes the colors that a meaningful share of
the finished pool actually sits in (at least 18% of the unique cards), so the
identity reflects the real decks rather than every color a lone splash card
touches. For the theme labels it records the rolled strategy and the single
mechanic archetype most represented in the finished pool.

### Worked example: building Kragg's pool

To make the chain concrete, here is one full run for the Dreamcaller **Kragg**,
with every value traced to where it is stored. (The exact decks and scores below
depend on the random seed; the data sources and the order of operations do not.)

**Setup — what Kragg brings.** The player picks Kragg. From
`dreamcallers_v2.toml`, Kragg's `draft-archetypes` are loaded as his
`draftArchetypes`: `b-aristocrats`, `bg-midrange`, `bg-midrange-reanimator`,
`br-aristocrats`, `brg-lands-monsters`, `brg-midrange`, `ug-cheaty-ramp`,
`ug-sneak`, `wb-aristocrats`, `wbg-midrange`, `wbg-value-midrange`,
`wbr-aristocrats`, `wbrg-aristocrats`, `wubg-value`, and `wubrg-value` — these
are his **strategy candidates**. Separately, `loadDreamcallersV2` looks up
`"Kragg"` in the `DREAMCALLER_THEMES` map and attaches `themeArchetypes =
["abandon"]` — his **theme**. The draft page calls `generatePoolFromData` with
the prebuilt `PoolData`, the `decklists` variant, those `draftArchetypes` as the
seed archetypes, and `["abandon"]` as the theme archetypes.

**The theme card set.** The algorithm looks up `abandon` in `PoolData.archLists`
— the set of every card whose `cards_v2.toml` record carried `"Abandon"` in its
`tides`. That set becomes Kragg's **theme card set**, and every deck in the
corpus gets a 0-to-1 theme density measuring how heavily, IDF-weighted, it leans
on those Abandon cards.

**Step 1 — roll the strategy.** Each of Kragg's fifteen seed archetypes that
exists in `draftLists` and has a color prefix is a candidate. Each is weighted by
how many of its cards (its set in `PoolData.draftLists`) are in the Abandon theme
card set: the four aristocrats lists (`b-aristocrats`, `br-aristocrats`,
`wb-aristocrats`, `wbr-aristocrats`, `wbrg-aristocrats`) are dense in Abandon
payoffs and so carry far more weight than, say, `ug-cheaty-ramp`, which shares
almost no Abandon cards. Suppose the weighted roll lands on **`br-aristocrats`**.
That fixes the pool's color identity to **`br`**, and the card set stored at
`draftLists.get("br-aristocrats")` becomes the yardstick for the starter.

**Step 2 — pick the starter.** Every real deck in the corpus (from
`PoolData.decklists`, the filtered `docs/drafts_dt` files) is scored by its fit
to `br-aristocrats`: the total IDF weight of the cards it shares with that list,
then multiplied by the deck's Abandon theme density. The black-red sacrifice
decks in `docs/drafts_dt` (the `*-br-*.txt` files, say) score highest. Rather
than always taking the single best, the algorithm keeps the top 25 and samples
one weighted toward the top scores; suppose it draws a particular BR sacrifice
deck. That deck is the **starter**.

**Step 3 — read off the spine.** The spine begins with Kragg's theme,
`abandon` (so the pool can never gate out its own Abandon cards). The algorithm
then counts, for each mechanic archetype in `archLists`, how many of the
starter's cards fall in it; the starter's most-represented mechanics — say
`abandon` (already in) and `discard-madness` — fill the spine up to its budget of
two. So the spine is `{abandon, discard-madness}`. A card counts as on-spine if
it appears in either of those `archLists` sets.

**Step 4 — snowball.** The pool is seeded with the core staples (`PoolData.core`,
one copy each) plus *every* card of the starter, unfiltered. Then, repeatedly:
each unused real deck is scored by its IDF-cosine similarity to the fixed
starter, multiplied by its Abandon theme density; the top ten are kept and one is
drawn with a low-temperature softmax (so it almost always takes the most similar
BR sacrifice deck). From that deck only the **on-spine** cards — its Abandon and
discard-madness cards — are folded in, one copy each, in shuffled order, until
the pool hits its jittered target of about 150 copies. A card hits two copies
only when two folded-in decks both ran it. The loop ends at the target, or early
if thirty picks in a row add nothing new.

**Result.** Kragg's pool comes out as a roughly 150-copy black-red sacrifice
pool: a `br` identity, a card list dominated by Abandon and discard payoffs,
grown from genuine BR sacrifice decklists rather than synthesized from tags. For
display it is labelled with the rolled strategy (`br-aristocrats`) and the
single mechanic archetype most represented in the finished pool (`abandon`).
Finally the dispatcher caps every card at two copies, and `resolvePool` maps the
card names back to `cards_v2` card numbers for the draft engine.

---

## How the three are dispatched

When a pool is requested, the dispatcher reads the chosen variant and routes to
the matching algorithm — `diverse` and `decklists` to their respective
functions, anything else to `default`. The Dreamcaller's seed archetypes are
passed to all three; its theme archetypes are passed through but only the
`decklists` algorithm uses them. Whatever the algorithm returns, the dispatcher
caps every card at two copies, derives the ordered color-identity string, and
returns the pool together with its identity, chosen themes, copy counts, the seed
used, the final size, and which variant produced it.

---

## The merged-archetype-lists algorithm (experimental)

The `decklists` algorithm earns its complexity by doing all of its work at run
time: it holds the full corpus of real decks in memory and, every time a pool is
built, searches that corpus with IDF-weighted cosine similarity to find a starter
and its neighbors, gates them through a spine, and snowballs them with a softmax.
The **merged-archetype-lists** algorithm starts from a single observation: almost
none of that machinery is about the player's pool — it is plumbing for *finding
decks that belong together* inside a large, unlabeled pile. If that grouping is
done **once, offline**, the run-time step collapses to something a paragraph can
describe: roll one archetype, keep the lists that share its colors, and shuffle a
few of them together.

This algorithm is implemented in `scripts/merged-archetype-pool-experiment.mjs`
and is evaluated against the `decklists` algorithm by simulation (see *How it is
measured*, below). It is a candidate simplification, not a production `?algo=`
variant.

### Two phases: an offline collapse, then a trivial run-time pick

The algorithm has two clearly separated phases, and the data flows strictly from
the first into the second:

- **Phase 1 (offline, built once).** Collapse the real decks into a small set of
  **merged archetype lists** — one list per drafted archetype, each holding the
  cards that recur across that archetype's real decks. This is the set of lists
  the run-time step draws from. It is the only "curation" the algorithm does, and
  it is fully mechanical.
- **Phase 2 (run time, once per pool).** Given a Dreamcaller, choose a subset of
  those lists and shuffle them into a pool. Every per-pool decision is a plain
  weighted random pick; there is no similarity search.

### Where the data comes from

This is the part most worth slowing down on, because the inputs arrive from four
different places and one of them is recovered in an unusual way.

- **The merged lists are built from the raw decklist files in `docs/drafts_dt/`,
  read directly — not from the `decklists-data.json` bundle.** The reason is the
  archetype label. Each drafted deck is saved as `<date>-<label>-<uuid>.txt`,
  where the label is the drafter's own name for the deck (`br-aristocrats`,
  `ur-storm`, `g-big-ramp`, …). `scripts/setup-assets.mjs` keeps only the card
  names when it writes `decklists-data.json`, so the bundle carries no label.
  Phase 1 therefore reads the `*.txt` filenames itself to recover each deck's
  label, then groups by it.
- **The set of valid card names** comes from `public/cards_v2-data.json`; a line
  in a decklist file is ignored unless it names a known card.
- **The core staples and the theme card set** come from the same `PoolData` the
  other three algorithms use (`buildPoolData`): `PoolData.core` is the set of
  `core = true` cards, and the theme card set is read out of `PoolData.archLists`
  (built from each card's `tides`) using the Dreamcaller's theme slugs, exactly as
  in `decklists`.
- **The Dreamcaller's seed archetypes** — the candidate archetypes it may lead
  with — are its `draftArchetypes`, from the `draft-archetypes` list in
  `dreamcallers_v2.toml`. These are the same color-plus-archetype names that label
  the decks and key the merged lists, which is what lets a Dreamcaller's list of
  archetypes line up with the merged lists by name.

### Phase 1 — collapsing the decks into merged archetype lists

`buildMergedLists(threshold)` walks every file in `docs/drafts_dt/` and produces a
map from archetype label to a set of card names:

1. **Parse the label.** A filename is matched against `<YYYY-MM-DD>-<label>-<uuid>`;
   files that do not match (or are not `.txt`) are skipped.
2. **Keep only archetype labels.** The label must begin with a color run *and*
   carry an archetype name after it: `br-aristocrats` is kept; a bare color like
   `ur` is dropped (it names no archetype); a colorless `c-…` label is dropped
   (its head is not a color).
3. **Read and clean the deck.** The file's lines are trimmed and filtered to known
   card names. A deck is dropped unless it holds between 16 and 34 distinct cards —
   the same window `decklists` uses, which excludes partial files and the few
   oversized aggregate files.
4. **Group and threshold.** Decks are grouped by label. A label with fewer than
   three real decks is dropped (too little signal to merge). For each surviving
   label, the algorithm counts, for every card, how many of that label's decks
   contain it, and keeps the cards that appear in at least `threshold` decks
   (default two). The survivors — most frequent first, capped at 100 — become that
   label's merged list.

On the current data set, the default threshold yields **49 merged lists**,
averaging about 46 cards each (all within the 100-card cap), and every themed
Dreamcaller has at least one of its archetypes represented.

The threshold is the quiet but important step. Because a card has to **recur
across several real decks** of an archetype to survive, the merged list holds "the
cards this archetype keeps playing" rather than "every card legal in these
colors." That recurrence test is itself a co-occurrence filter, which is what lets
these compact lists stand in for whole real decks (see *How it is measured*).

### The tuning knobs

Phase 2 is governed by a handful of knobs (the experiment sweeps them; the
parenthesized value is the setting that reproduces the `decklists` output):

- **`targetSize` / `targetJitter`** — the pool aims for `targetSize` copies with a
  small random wobble (150 ± 8), matching `decklists`.
- **`themeExp`** — the exponent applied to a candidate's theme overlap when rolling
  the primary archetype (1.5). Higher leans the roll harder toward the
  Dreamcaller's mechanic.
- **`weighting`** — how each *next* list is chosen during the snowball: `overlap`
  (favor lists that share cards with what is already chosen, for coherence),
  `theme` (favor theme-dense lists), or `uniform`. (`overlap`.)
- **`includeProb`** — when a list is folded in, each of its cards joins the pool
  with this probability (0.7). Below one, each list contributes a *partial* view,
  which raises run-to-run variance and lowers how completely any one archetype is
  handed over.
- **`themeCoreFrac`** — the per-Dreamcaller **core**: the fraction of the on-color
  theme cards that are always seeded into the pool (1.0 to match `decklists`; lower
  for a less theme-saturated, more varied pool).
- **`themeKeep`** — when true, theme cards ignore the `includeProb` dropout and are
  always taken when a list is folded (true). Together with `themeCoreFrac` it is
  the lever that keeps a themed pool on its mechanic.

### Phase 2 — building a pool

Given a Dreamcaller's seed archetypes and theme slugs, plus the merged lists from
Phase 1, `generateMerged` builds one pool:

1. **Roll the primary archetype.** Among the Dreamcaller's seed archetypes, the
   **eligible** ones are those that have a merged list and a color prefix. Each is
   weighted by `(1 + how many of its cards are theme cards) ^ themeExp`, and one is
   drawn — so a theme-dense archetype is rolled far more often than an off-theme
   one. The chosen archetype's color prefix becomes the pool's **color identity**
   (e.g. `br`). A Dreamcaller with no eligible archetype produces an open pool,
   where the primary is just a random merged list.
2. **Gather the on-color candidates.** Every merged list whose color prefix fits
   inside the identity (every letter of its prefix is an identity color) is a
   candidate to fold in. A `br` identity admits the `b`, `r`, and `br` lists but
   not, say, `bg-midrange` — its `g` is off-color — even when that is one of the
   Dreamcaller's own archetypes.
3. **Seed the pool.** The pool's copy counts start with the core staples at one
   copy each. Then the **theme core** is laid down: the theme cards that appear in
   at least one on-color list are each seeded (one copy) with probability
   `themeCoreFrac`. This is the always-present spine of the Dreamcaller's mechanic
   — the "core list for this Dreamcaller," derived automatically from its theme and
   chosen colors rather than authored by hand.
4. **Fold in the primary.** The primary list's cards are added in shuffled order,
   each kept with probability `includeProb` (theme cards always kept when
   `themeKeep`), bumping copy counts, until the target size is reached.
5. **Snowball the rest.** While the pool is below target, the algorithm repeatedly
   picks one unused on-color list — weighted by `weighting`, by default by how much
   it overlaps what is already chosen — and folds it in the same way. It stops at
   the target, or early if thirty picks in a row add nothing new.
6. **Cap and label.** As with the other algorithms, every card is capped at two
   copies, so a card reaches two only by appearing across several of the seeded and
   folded lists. The pool's identity is the rolled archetype's colors.

### Worked example: building Kragg's pool

To make the chain concrete, here is one run for the Dreamcaller **Kragg**, the
same Dreamcaller the `decklists` worked example uses, so the two can be compared
directly.

**Setup — what Kragg brings.** As before, from `dreamcallers_v2.toml` Kragg's
`draftArchetypes` are his **seed archetypes** (the aristocrats, black-midrange,
and ramp lists such as `br-aristocrats`, `b-aristocrats`, `bg-midrange`,
`ug-cheaty-ramp`, …), and `loadDreamcallersV2` attaches `themeArchetypes =
["abandon"]`. The **theme card set** is every Abandon card in
`PoolData.archLists`.

**Phase 1 is already done.** Offline, `buildMergedLists` has produced the ~49
merged lists. Several of Kragg's archetypes are among them — the aristocrats lists
(`b-aristocrats`, `br-aristocrats`, `wb-aristocrats`, …) and the black-midrange
lists each have enough real decks to merge. Each is a compact set of the cards
that recur across that archetype's real decks.

**Step 1 — roll the primary.** Kragg's eligible archetypes are weighted by how
many Abandon cards each merged list holds, raised to 1.5. The aristocrats lists are
dense in Abandon payoffs, so one of them is rolled far more often than, say, a ramp
list that shares almost no Abandon cards. Suppose the roll lands on
**`br-aristocrats`**; the identity is **`br`**.

**Step 2 — on-color candidates.** The candidate lists are the merged lists whose
colors fit inside `{b, r}`: `b-aristocrats`, `br-aristocrats`, and any black or red
lists such as `r-burn` or `b-tempo`. A `bg-midrange` list is excluded — its green
is off-color — even though it is one of Kragg's archetypes.

**Step 3 — seed.** The core staples go in at one copy each. Then the Abandon theme
core: the Abandon cards that appear in some on-color (black or red) merged list are
each seeded, so the pool leads with its sacrifice payoffs no matter which lists are
folded next.

**Step 4–5 — fold and snowball.** The `br-aristocrats` list is folded in (its
Abandon cards always kept), then the algorithm repeatedly folds the on-color list
that overlaps most with what is already chosen — pulling in the other black-red
sacrifice and aristocrats cards — until the pool reaches its ~150-copy target.

**Result.** Kragg's pool comes out as a roughly 150-copy black-red sacrifice pool:
a `br` identity, led by Abandon payoffs from the theme core, fleshed out with the
cards that recur across real BR aristocrats decks. As with `decklists`, the exact
lists folded depend on the seed; the data sources and the order of operations do
not.

### How it is measured

Because this is a candidate rather than a shipped variant, the experiment script
judges it the way the `decklists` work was judged: it imports the real
`generatePoolFromData` as an oracle and runs both algorithms over the same 20
themed Dreamcallers and 10 fixed seeds, reporting four numbers per pool, averaged:

- **recall** — the fraction of the pool's unique cards that carry the
  Dreamcaller's theme tide. A coherence measure: how on-theme the pool is.
- **coverage** — the fraction of the on-color theme-tide set that the pool actually
  contains. A "hand-fed" measure: near 1.0 means the player is handed essentially
  the whole theme kit.
- **varJac** — the average pairwise Jaccard of the unique-card sets across the ten
  seeds for one Dreamcaller. A variance measure: *lower* means the pool changes more
  from run to run.
- **coc** — the average number of real decks in which two of the pool's distinctive
  (non-core) cards co-occur, sampled over card pairs. A *micro-coherence* measure:
  higher means the pool's cards genuinely get played together in real decks, not
  merely share a color.

On the current data set, with a full theme core (`themeCoreFrac = 1`, `themeKeep`,
`includeProb = 0.7`, `overlap` weighting) the merged selector lands on top of the
`decklists` oracle: recall 0.47 vs 0.51, coverage 0.72 vs 0.71, varJac 0.56 vs 0.62
(slightly more varied), and coc 8.46 vs 8.13 (micro-coherence preserved). Lowering
`themeCoreFrac` trades theme saturation for variance and a less hand-fed pool, so
that one knob is a dial the `decklists` algorithm does not expose. Running the same
selector over the broad existing `draftLists` instead of the merged lists (skipping
Phase 1) gives coverage 1.0 and coc 6.17 — it hands over the entire kit and its
cards barely co-occur — which is what shows the Phase 1 merge is doing the real
work.

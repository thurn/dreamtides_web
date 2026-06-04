# Draft Pool Construction Algorithms

The draft test mode (`draft_test`) builds a card pool that a player drafts
from. The pool is assembled by one of three interchangeable construction
algorithms, selected with the `?algo=` URL parameter: `default`, `diverse`, and
`decklists` (for example, `draft_test?algo=decklists`). All three live in
`src/draft_test/color-pool.ts`. This document explains, in detail, how each one
works.

This document is the canonical description of the three algorithms.

## Shared foundations

Before any algorithm runs, the generator reconstructs a small set of inputs from
the card database and exposes a handful of common concepts that all three
algorithms build on.

### The reconstructed inputs

Every algorithm consumes the same prepared data structure, built once from the
card records:

- **Core cards.** A fixed set of cards flagged as `core`. These always seed
  every pool regardless of algorithm or colors — they are the universally
  playable staples.
- **Archetype lists.** For each mechanic archetype (Abandon, Storm, Discard /
  Madness, Warrior Aggro, and so on) a set of the cards that belong to it. These
  come from the cards' "tide" tags, mapped through a fixed tide-name-to-slug
  table, so each mechanic archetype is keyed by a stable slug like `abandon` or
  `storm`.
- **Draft lists.** A set of cards for each *bare color combination* (for
  example, every card legal in `ub`) and for each *color-plus-archetype slice*
  (for example `ubr-control`). A bare color list has a name made purely of color
  letters; a color-plus-archetype list has a color prefix followed by a hyphen
  and an archetype name.
- **Decklists.** Optionally, a collection of real, human-built decklists — each
  one a list of card names. These are bundled from real draft decks and are used
  only by the `decklists` algorithm. When they are absent, the `decklists`
  algorithm falls back to `default`.

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
choice feeds two optional pieces of guidance into pool construction:

- **Seed archetypes** — the Dreamcaller's `draftArchetypes`. These are
  color-plus-archetype list names. Only those that exist in the data and carry a
  color prefix are eligible. They constrain the pool's color identity and (in
  the theme-based algorithms) which color-plus-archetype themes are allowed.
- **Theme archetypes** — the Dreamcaller's mechanic-archetype tide slugs (for
  example `abandon`). These bias the `decklists` algorithm toward the
  Dreamcaller's mechanical theme. The `default` and `diverse` algorithms ignore
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

- The **theme card set** — the union of all cards across the Dreamcaller's
  mechanic-archetype lists. For an `abandon` Dreamcaller this is every Abandon
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
seed archetypes (the color-plus-archetype draft lists that exist in the data and
carry a color prefix). It does not pick uniformly — it weights each candidate by
how much that draft list overlaps the theme card set, so a candidate full of
theme cards is rolled far more often than an off-theme one. Concretely, an
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

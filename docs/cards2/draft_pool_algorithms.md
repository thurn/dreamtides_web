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

The `decklists` algorithm abandons the synthesized themes the other two walk and
instead grows a pool out of *real, human-built decklists*. The idea is that real
decks already encode the cards that actually play well together, so a pool grown
from them feels more like a curated, single-archetype experience. It works by
picking a starting decklist and then snowballing in the decklists most similar
to it until the pool is full. If no usable decklists are bundled, it falls back
entirely to the `default` algorithm.

### Filtering the decklist corpus and IDF weighting

The algorithm first prepares the decklist corpus, cached per data set. It drops
decklists that are too small (fewer than 16 cards — the tail of partial or
near-empty files that carry too little signal) and too large (more than 34 cards
— a handful of aggregate files that are not really drafted decks and would
dominate any similarity score).

Over the surviving decks it computes an **inverse-document-frequency (IDF)**
weight for every card: the log of the inverse of the fraction of decks the card
appears in. A card in nearly every deck gets a weight near zero; a distinctive
card that appears in only a few decks gets a high weight. Every notion of
"similarity" and "fit" below is computed as a cosine over these IDF-weighted card
vectors, so two decks are "similar" because they share *distinctive* cards, not
because they both run the ubiquitous staples. Each deck's vector norm is
precomputed for the cosine.

### The Dreamcaller's theme

If the Dreamcaller has theme archetypes, the algorithm forms the **theme card
set** — the union of all cards in those mechanic-archetype lists — and defines a
**theme cosine** that measures how densely any given deck is packed with those
theme cards (again IDF-weighted, between zero and one). When the Dreamcaller has
no theme, the theme cosine is zero everywhere, every theme-bias term below
collapses to one, and the pool is built without any theme bias.

### Rolling a strategy

From the Dreamcaller's eligible seed archetypes the algorithm rolls one
"strategy" — the role the pool will play. The roll is weighted toward strategies
that overlap the theme: each eligible strategy's weight grows with how many of
its cards are theme cards (raised to a tuning exponent), so an Abandon
Dreamcaller lands on an aristocrats-style strategy far more often than on an
off-theme green ramp. The rolled strategy supplies the pool's color identity
(its color prefix). A Dreamcaller with no seed archetypes leaves the strategy
open, and the starter is then any real decklist.

### Picking the starter

The **starter** is the single decklist the whole pool will orbit. When a strategy
was rolled, each decklist is scored by how much IDF weight it shares with the
strategy's cards (its "fit"), and that fit is then scaled up for decks dense in
the theme (multiplied by one plus a theme-starter-boost times the deck's theme
cosine). Rather than always taking the single best-fitting deck, the algorithm
keeps the top 25 by score and samples among them weighted by fit raised to a
power — this is the main source of run-to-run variety, since the same strategy
can yield a different starter each time. With no strategy rolled, the starter is
a random decklist.

### The spine

To keep the grown pool's *card list* focused on one strategy — rather than
dragging in the off-archetype halves of every neighboring deck — the algorithm
defines a **spine**: the set of mechanic archetypes that growth is allowed to
absorb cards from. The spine always includes the Dreamcaller's theme archetypes
first, so a themed pool can never gate out its own theme (important for splashy
themes like outsiders that are rarely a deck's *dominant* tide). It then fills
the remaining spine slots — up to two archetypes by default, or more if the theme
already used more — with the starter's own most-represented archetypes, ranked by
how many of the starter's cards fall in each. During growth, only cards that
belong to at least one spine archetype are eligible to be absorbed. (If the spine
ends up empty, the gate is open and every card is eligible.)

### Snowballing similar decklists

The pool is seeded with the core cards plus every card in the starter. The
algorithm then computes a **growth score** for each other decklist: its cosine
similarity to the *starter* (anchored to the starter, not to the drifting pool,
so the whole pool keeps orbiting one archetype), scaled up for decks dense in
the theme (one plus a theme-grow-boost times the theme cosine). Anchoring to the
fixed starter and boosting the theme together keep the snowball from wandering
off into whatever else merely co-occurs in the colors.

It then repeats until the pool reaches its target size: it ranks the unused
decks by growth score, keeps the top ten, and samples one using a softmax with a
low temperature — so it almost always takes a highly similar deck, but
occasionally reaches a little wider. From the chosen deck it absorbs cards (in
shuffled order so it can stop exactly at the target), but *only* the cards that
are on the spine, incrementing each card's count. A card reaches two copies only
when two different absorbed decks both include it. The loop stalls out and stops
early if it goes many iterations without adding anything new.

The target size is smaller than the other two algorithms — around 150 copies
with a small random wobble — because the pool is meant to play as a focused,
single-archetype pool rather than a broad 180–220 draft pool.

### Identity and labels

Finally the algorithm settles the display identity and labels. When a strategy
was rolled, the identity is simply its color prefix, matching the other
algorithms. For an open pool with no rolled strategy, it instead takes the
colors that a meaningful share of the actual pool sits in (at least 18% of the
unique cards), so the identity reflects the real decklists rather than every
color a lone splash card happens to touch. It also records the rolled strategy
label and the single archetype most represented in the finished pool as the
pool's themes for display.

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

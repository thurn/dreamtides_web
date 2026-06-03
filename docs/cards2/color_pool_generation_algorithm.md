# Draft Pool Generation

This document explains how `src/draft_test/color-pool.ts` builds a draft card
pool. It is written for a reader who has no prior knowledge of the game or the
codebase.

## What the algorithm produces

The goal is to assemble a **pool** of roughly 180–220 cards that a player can
draft from. A good pool is not an arbitrary scoop of cards out of the database.
It has to feel like a real, playable slice of the game: the cards should mostly
share a small set of colors, and they should support a few overlapping
strategies whose pieces fit together. At the same time, every time you generate
a pool it should be different, so that two drafts are never the same.

The generator balances those two desires — *coherence* and *variety* — and
returns three things: the colors the pool is built around, the strategies
("themes") it chose, and a list of card names together with how many copies of
each the pool contains (either one or two).

## The raw materials

Every card in the game carries metadata describing what it is good for. The
generator reads three kinds of grouping out of that metadata and treats each
group as a named list of card names.

- **Core cards.** A handful of cards are flagged as "core." These are the
  generically useful cards that belong in essentially any deck. Core cards are
  the foundation that every pool starts from.

- **Mechanic archetypes.** Each card can belong to one or more *tides*, which
  are the game's mechanical strategies — things like "Storm," "Discard /
  Madness," "Warrior Aggro," or "Spirit Animals." Collecting every card that
  shares a tide gives a curated, combo-aware list of cards that want to be
  played together for a mechanical reason. There are sixteen such archetype
  lists.

- **Color lists.** Each card also declares which color combinations it is legal
  in. These list names are built from the game's five colors, written with the
  letters `w`, `u`, `b`, `r`, and `g`. A list name begins with a run of those
  letters — its **color prefix** — and may then add an archetype suffix:
  - A **bare-color list** is just a color prefix, such as `b`, `wu`, or `ubr`.
    It is the broad set of every card playable in that color combination. These
    lists are large; a three-color list can hold more cards than an entire pool.
  - A **color-plus-archetype list** adds a suffix after the colors, such as
    `br-aristocrats` or `wu-blink`. It is a focused strategy pinned to a
    specific color combination.

The function that prepares these inputs simply walks over every card once and
files its name into the appropriate core set, archetype lists, and color lists.

## Color identity is the backbone

The single most important idea is that a pool is organized around a **color
identity** — a specific combination of one to four of the five colors. The
color identity decides which cards are even allowed in the pool. The mechanic
archetypes and color-plus-archetype lists are then layered on top as *themes*
that decide what the pool is actually trying to do.

Color and mechanics are kept on separate axes on purpose. The colors set the
boundary of what is legal; the themes choose a coherent strategy inside that
boundary. This is why a pool can be "blue-black-red" and still feel like a
focused storm deck or a focused aristocrats deck depending on the run.

## Walking through one generation

Generating a pool proceeds in a few stages. Throughout, the algorithm keeps a
running tally of how many copies of each card are in the pool so far, starting
with one copy of every core card.

**1. Choose the colors.** First the generator decides how many colors the pool
will span. It rolls a weighted random number from one to four, with two- and
three-color pools heavily favored because those make the best draft
environments. It then picks that many colors at random from the five. This
combination is the pool's color identity.

When a Dreamcaller seeds the pool (see "Dreamcaller-seeded pools" below) this
step is replaced: the identity is taken from one of the Dreamcaller's archetypes
instead of rolled at random.

**2. Decide what is legal.** A color list is "on-color" when its color prefix
fits entirely inside the chosen identity — for a blue-black-red identity, the
lists `u`, `br`, and `ubr` all qualify, but a green list does not. The pool of
**legal** cards is the core cards plus every card found in any on-color color
list. No card can ever enter the pool unless it is legal, so this step draws the
outer boundary.

**3. Gather candidate themes.** Themes are the strategies the pool can be built
from, and they come from two places:
  - Each mechanic archetype is tested for how well it fits the chosen colors. If
    at least 55% of its cards are legal in this identity, it qualifies as a
    theme, restricted to just its legal cards. This threshold keeps an
    overwhelmingly green archetype from surfacing in a blue-black-red pool.
  - Every on-color color-plus-archetype list (the ones with a suffix) is also a
    theme.

  Bare-color lists are deliberately *not* themes. Pouring an entire bare-color
  list into the pool would mean "every blue-black-red card," which is both
  incoherent and far too large. Bare-color lists only define the legal boundary
  and serve as a reservoir for filler later. (In the rare case where no theme
  qualifies at all, the generator falls back to treating the on-color lists as
  themes so that a pool can still be built.)

**4. Grow the pool by a synergy walk.** Now the generator picks an opening theme
at random and adds all of its cards to the running tally. From there it grows
the pool one theme at a time, always preferring themes that *overlap* with what
is already chosen. At each step it looks at every theme not yet selected, scores
each one by how many of its cards already appear in the current selection, keeps
the three highest-scoring candidates, and picks one of those three at random
with probability proportional to its overlap score. Themes that share no cards
with the current selection are never eligible. This "walk" keeps adding
overlapping themes until the pool reaches the lower size target of 180 cards (or
until no overlapping theme is left).

The effect is that the pool grows along a chain of genuinely related strategies
rather than stapling unrelated decks together. Because cards shared by two
selected themes get counted twice, they naturally accumulate toward two copies,
while cards from a single theme stay at one copy.

**5. Fill if the pool is short.** If the synergy walk runs out of overlapping
themes before reaching 180 cards, the generator tops the pool up with the most
generically useful on-color cards. It ranks every legal card not yet in the pool
by how many on-color color lists contain it — a proxy for how broadly playable
it is — and adds them as single copies, best first, until the pool reaches 180.

**6. Jitter the size and copy counts.** At this point the pool may be anywhere
up to its natural ceiling, which is often above the 220 cap. The generator picks
a random target size: no higher than 220, and up to 15 cards below whatever the
pool currently sits at. It then walks through the cards that currently have two
copies, in random order, and demotes them to a single copy until the pool
shrinks to the target.

This jitter step is what makes two pools on the same colors and themes differ.
Crucially, it only ever removes a *second copy* of a card — it never removes a
card entirely — so every combo piece and synergy card in the chosen themes
survives. The randomness lies in both the target size and in which shared
staples happen to keep their second copy.

**7. Trim the fringe as a last resort.** Very occasionally a color identity is
so large that even after demoting every duplicate the pool is still over target.
In that case the generator trims cards that are unique to the most recently
added theme — cards that appear in no earlier theme and are therefore
unreinforced singletons. Cards shared between themes, the synergistic backbone,
are never eligible for this trim. This step almost never fires.

## Dreamcaller-seeded pools

In the draft test harness the player first picks one of three Dreamcallers, and
that choice can steer pool construction. A Dreamcaller may carry a list of
**draft archetypes** — the color-plus-archetype lists its abilities are suited
to. When it does, the generator seeds from that list rather than rolling freely:

- It picks one of the Dreamcaller's archetypes at random and adopts that
  archetype's colors as the pool's color identity (replacing step 1). Because
  the seed archetype is chosen anew each run, the identity still varies across
  rerolls, weighted toward the colors the Dreamcaller's list covers.
- When gathering candidate themes (step 3), the color-plus-archetype themes are
  restricted to the Dreamcaller's listed archetypes. On-color mechanic
  archetypes still qualify the same way, so a seeded pool draws from the
  Dreamcaller's intended decks plus any mechanical strategies that fit its
  colors.
- The synergy walk opens from the chosen archetype rather than a random theme.

Every later stage — legality, the walk, filler, jitter, and the fringe trim —
behaves exactly as it does for an unseeded pool. A Dreamcaller with no draft
archetypes is suited to any pool and rolls the unconstrained random pool
described above.

## How a card ends up in the pool

Putting the path together: a card reaches the pool only if it is **legal** (some
on-color color list vouches for its colors) *and* it is **earned** — either by
belonging to a theme the synergy walk selected, or by being pulled in as
generic filler. The bare-color lists draw the boundary; the themes and the
filler populate the space inside it. A single bare-color list might contribute a
hundred-plus of its cards to one pool and a different hundred to the next,
depending entirely on which themes the walk happened to choose.

## Copy counts and pool size

A card's copy count is simply how many of the pool's selected sources (core plus
the chosen themes) contain it, capped at two. A card that several neighboring
themes all want becomes a two-copy staple; a card from a single source, or one
added as filler, stays a singleton. Pool "size" counts these capped copies, so
the 180–220 target is measured in total cards, duplicates included.

## Where the randomness comes from

Every run can differ along several independent axes, none of which ever splits a
combo apart:

- how many colors the pool spans, and which ones;
- which theme seeds the walk, and which overlapping themes the weighted walk
  picks at each step;
- which generic staples get pulled in during the fill step;
- the random target size, and which shared duplicates are demoted to reach it.

## Reproducibility

The generator is driven by a seedable random number generator. Calling it
without a seed produces a fresh random seed and therefore a new pool every time.
Passing a specific seed reproduces a previous run exactly, which makes pools easy
to share, debug, and test. The returned result includes the seed that produced
it for this reason.

## Generating and simulating pools offline

The algorithm in `src/draft_test/color-pool.ts` is the single source of truth.
The Node tooling imports it directly rather than re-implementing it, so a pool
generated offline for a given seed matches the in-app pool exactly.

- `npm run generate-pool -- --seed 42` prints one pool (one card name per line,
  a 2-of printed twice) with a summary line on stderr. Add
  `--dreamcaller "<name|id>"` to seed it from a Dreamcaller's draft archetypes.
- `npm run simulate-pools` runs many seeds per Dreamcaller and reports aggregate
  statistics — pool size, color-identity distribution, character/event mix, the
  energy-cost curve, and the most frequently selected themes and cards. Flags:
  `--seeds N`, `--base-seed S`, `--dreamcaller "<name|id>"`, `--top N`, and
  `--json` for machine-readable output.

This document describes the `default` variant. A second `diverse` variant tunes
the same skeleton to spread cards and archetypes more evenly; it is selectable
via the `variant` argument, the `--variant diverse` CLI flag, and the draft test
`?algo=diverse` URL parameter. See `color_pool_diversity.md` for its design,
measured results, and how to make it the primary algorithm.

## Tunable constants

A few constants at the top of the file shape the behavior:

- **Color-count weights** decide how often pools span one, two, three, or four
  colors. The defaults favor two and three colors.
- **The on-color threshold (0.55)** sets how strongly a mechanic archetype must
  fit the chosen colors before it qualifies as a theme. Raising it keeps pools
  more strictly mono-strategy within their colors; lowering it admits more
  cross-color themes.
- **The walk breadth (3) and overlap exponent (1.0)** control the synergy walk.
  A breadth of one would make the walk a deterministic greedy march toward the
  single best neighbor; a higher exponent biases harder toward the best
  neighbor.
- **The jitter range (15)** sets how far below its natural ceiling a pool's
  random target may fall. A larger range demotes more duplicates, yielding more
  variety and smaller pools; a smaller range keeps pools near the top of the
  band with more staple two-ofs intact.

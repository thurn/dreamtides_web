# Draft Pool Construction Algorithms

The journey prototype builds a card pool that a player drafts from. The pool is
assembled by one of several interchangeable construction algorithms, selected
with the `?algo=` URL parameter: `color_pool`, `diverse`, `decklists`, `idf`,
and `idf2` (for example, `?algo=decklists`). The run-time half of all of them
lives in `src/draft/pool/`. This document explains, in detail, how each one
works.

## Shared foundations

Before any algorithm runs, the generator reconstructs a small set of inputs from
the card database and exposes a handful of common concepts that all three
algorithms build on.

### Where the data comes from

Nothing the algorithms read is invented at run time; every input is resolved
from a source file through a fixed pipeline. It is worth following that pipeline
once, because the rest of this document refers to these stores by name.

- **The card records** start as `[[cards]]` entries in
  `data/tabula/cards_v2.toml`, which supplies each card's `name` and rules text.
  The draft-pool metadata the non-`idf3` variants read lives in TypeScript, in
  `src/data/cards-v2-metadata.ts`, keyed by card name: `core` (a boolean
  staple flag), `tides` (mechanic tags such as `"Abandon"` or `"Storm"`),
  `colors` (the bare color-combo lists the card is legal in, e.g.
  `["b", "br", "wbr"]`), and `draftArchetypes` (the color-plus-archetype slices
  it belongs to, e.g. `["br-aristocrats", "wb-aristocrats"]`). The build step
  `scripts/setup-assets.mjs` parses the TOML, merges that metadata in by name,
  and writes `public/cards_v2-data.json`. At run time `loadCardsV2Database` (in
  `cards-v2-database.ts`) fetches that JSON into a `Map<number, CardData>` keyed
  by card number.

- **The Dream Avatar records** start as `[[dreamAvatar]]` entries in
  `data/tabula/dream_avatars_v2.toml`, which supplies each Dream Avatar's name,
  ability, and `signature-cards` (the standard `idf3` steering data). The
  `draft-archetypes` the non-`idf3` variants seed from live in TypeScript, in the
  `DREAM_AVATAR_ARCHETYPES_BY_ID` map in `dream-avatars-v2-database.ts`. The
  same build step merges them by UUID into
  `public/dream-avatars-v2-data.json`, and
  `loadDreamAvatarsV2` (in `dream-avatars-v2-database.ts`) fetches it into
  `DraftDreamAvatar[]`. A Dream Avatar's **theme** is also defined in TypeScript:
  `loadDreamAvatarsV2` attaches it after fetching, by looking the Dream Avatar's
  UUID up in the `DREAM_AVATAR_THEMES_BY_ID` map in
  `dream-avatars-v2-database.ts`. That map is the single source of truth for
  which mechanic a Dream Avatar pulls toward.

- **The real decklists** are each seat's mainboard in the adapted draft records
  under `docs/draft_records_adapted/` — one JSONC file per draft event, with one
  `mainboard` array of card UUIDs per seat. `scripts/setup-assets.mjs` reads
  every record, emits one decklist per seat, keeps only the cards whose UUIDs
  resolve to a known `cards_v2` entry (so the bundle never references unknown
  cards), drops empty mainboards, and writes `public/decklists-data.json` as an
  array of arrays of names. `loadDecklists` (in `cards-v2-database.ts`) fetches
  it into `string[][]`, or returns an empty array if the bundle is missing.

Journey content loading (`src/data/journey-content.ts`) loads all three, then calls
`buildPoolData` once to fold the card records (and the decklists) into the single
`PoolData` structure described next. When the player picks a Dream Avatar,
`generatePoolFromData` runs with that `PoolData`, the chosen variant, and
the Dream Avatar's `draftArchetypes` and `themeArchetypes`. The pool the
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
  values stored in the `DREAM_AVATAR_THEMES_BY_ID` map, which is what lets a
  Dream Avatar's theme name a key in `archLists`.
- **Draft lists** (`PoolData.draftLists`). A map keyed by both *bare color
  combinations* (from each card's `colors` field, e.g. `ub`) and
  *color-plus-archetype slices* (from each card's `draftArchetypes` field, e.g.
  `ubr-control`). A bare color list has a name made purely of color letters; a
  color-plus-archetype list has a color prefix, a hyphen, then an archetype name.
- **Decklists** (`PoolData.decklists`). The `string[][]` of real decks, passed
  straight through from `loadDecklists`. Used only by the `decklists` algorithm;
  when absent it falls back to `color_pool`.

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

### Dream Avatar seeding

In the normal draft-test flow the player first chooses a Dream Avatar, and that
choice feeds two optional pieces of guidance into pool construction. The two
come from *different* sources, which matters:

- **Seed archetypes** — the Dream Avatar's `draftArchetypes`, from its entry in
  the `DREAM_AVATAR_ARCHETYPES_BY_ID` map in
  `dream-avatars-v2-database.ts`. These are color-plus-archetype list names
  (e.g. `br-aristocrats`), the same names that key `PoolData.draftLists`. Only
  those that exist in `draftLists` and carry a color prefix are eligible. They
  constrain the pool's color identity and (in the theme-based algorithms)
  which color-plus-archetype themes are allowed.
- **Theme archetypes** — the Dream Avatar's mechanic-archetype tide slugs (e.g.
  `abandon`), *not* read from the TOML but attached at load from the
  `DREAM_AVATAR_THEMES_BY_ID` map keyed by Avatar UUID. These are the same slugs
  that key `PoolData.archLists`. They bias the `decklists` algorithm toward the
  Dream Avatar's mechanical theme; the `color_pool` and `diverse` algorithms ignore
  them.

A Dream Avatar with no archetypes produces an unconstrained pool.

---

## The `color_pool` algorithm

The `color_pool` algorithm builds a pool around a single color identity and then
grows it by repeatedly adding the theme that overlaps most with what it has
already chosen — a "rich get richer" synergy walk that produces coherent,
strategy-focused pools.

### Choosing the color identity

If the Dream Avatar supplied eligible seed archetypes, the algorithm picks one of
them at random and adopts its color prefix as the identity. It remembers that
seed archetype as the opening theme, and it restricts the pool's allowed
color-plus-archetype themes to the Dream Avatar's list (on-color mechanic themes
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

The `diverse` algorithm keeps the same color-identity skeleton as `color_pool` but
deliberately *flattens* the distribution, so that cards and archetypes appear
across pools far more evenly. It was built to counter several biases in the
`color_pool` walk: multi-color archetypes being starved, broadly tagged cards
showing up in nearly every pool, and the overlap walk's rich-get-richer
concentration. It does this at four points: seeding, walking, card inclusion,
and filling. Each is governed by a tuning knob.

### Inverse-reach seeding

The `diverse` algorithm seeds its identity from a single archetype just as
`color_pool` does (and respects Dream Avatar seed archetypes the same way), but the
choice is no longer uniform. It computes each archetype theme's **reach** — the
expected number of pools in which that theme would be an on-color candidate,
weighted by how often each color identity comes up. Themes eligible in many
identities (mechanic themes and one-color themes) have high reach; multi-color
and niche themes have low reach. The seed is then weighted by the inverse of
reach (one over reach, raised to a tuning exponent), so the otherwise-starved
multi-color identities get seeded much more often.

### The inverse-reach walk

Instead of `color_pool`'s overlap-weighted walk, the `diverse` walk normally picks
each next theme weighted by inverse reach again — pushing selection toward themes
that are eligible in fewer identities, countering the dominance of broadly
eligible mechanic and one-color themes. A tuning knob controls how strongly the
walk leans on this: at full strength every step is chosen by inverse reach; dialed
down, it falls back step by step to `color_pool`'s overlap-weighted walk. The walk
also caps how many themes a pool draws (a budget of six by default) before it
stops adding themes and lets the uniform fill carry the rest, which further
flattens archetype usage.

### Inverse-breadth card inclusion

When `color_pool` adds a theme it takes *all* of the theme's cards. The `diverse`
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
If no usable decklists are bundled, it falls back entirely to `color_pool`.

### Vocabulary: the four moving parts

Most of the confusion in this algorithm comes from four terms that sound alike
but are distinct things. They are introduced here in the order they depend on
each other; the rest of the section is just these four spelled out.

- **Theme** — a *persistent bias*, fixed for the whole run, that pulls every
  later decision toward the Dream Avatar's mechanic. It is never a single choice;
  it is a gravity well. It comes from the Dream Avatar's *theme archetypes* — its
  mechanic-archetype slugs like `abandon` or `storm` (see Shared foundations) —
  and is expressed as a set of cards plus a 0-to-1 "how theme-dense is this deck"
  score. A Dream Avatar with no theme archetypes has no theme, and every bias
  below switches off.

- **Strategy** — a *single choice made once per run*: exactly one of the
  Dream Avatar's *seed archetypes*. A seed archetype is a color-plus-archetype
  draft list like `br-aristocrats` — a broad "these colors, this drafted
  archetype" grouping. The algorithm rolls one of the Dream Avatar's seed
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

If the Dream Avatar has theme archetypes, the algorithm turns them into two
things it will reuse at every later step:

- The **theme card set** — the union, across the Dream Avatar's theme slugs, of
  the card sets stored at those slugs in `PoolData.archLists` (which were built
  from each card's `tides`). For an `abandon` Dream Avatar this is every Abandon
  card; for a `["storm", "events"]` Dream Avatar it is every Storm card plus every
  Events card.
- The **theme density** of a deck (the "theme cosine") — a 0-to-1 measure of how
  heavily that deck draws on the theme card set, IDF-weighted so distinctive
  theme cards count for more than ubiquitous ones.

When the Dream Avatar has no theme archetypes, the theme card set is empty, every
deck's theme density is zero, and every theme-bias multiplier below becomes one
— i.e. the pool is built with no theme bias at all.

### Step 1 — Roll the strategy

The algorithm now picks the pool's strategy: exactly one of the Dream Avatar's
seed archetypes (its `draftArchetypes`, which name keys in `PoolData.draftLists`)
that exist in `draftLists` and carry a color prefix. It does not pick uniformly —
it weights each candidate by how much that draft list (its card set in
`draftLists`) overlaps the theme card set, so a candidate full of theme cards is
rolled far more often than an off-theme one. Concretely, an
Abandon Dream Avatar whose seed archetypes include an aristocrats list and a
green-ramp list will roll aristocrats most of the time, because aristocrats
shares many cards with the Abandon theme and ramp shares few. (The strength of
that pull is a tuning exponent.)

The rolled strategy carries two things forward: its **color prefix becomes the
pool's color identity** (e.g. `br`), and its **card list becomes the yardstick
for choosing the starter** in the next step. A Dream Avatar with no seed
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

The spine is assembled from two sources. First, the Dream Avatar's theme
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

To make the chain concrete, here is one full run for the Dream Avatar **Kragg**,
with every value traced to where it is stored. (The exact decks and scores below
depend on the random seed; the data sources and the order of operations do not.)

**Setup — what Kragg brings.** The player picks Kragg. From
`dream_avatars_v2.toml`, Kragg's `draft-archetypes` are loaded as his
`draftArchetypes`: `b-aristocrats`, `bg-midrange`, `bg-midrange-reanimator`,
`br-aristocrats`, `brg-lands-monsters`, `brg-midrange`, `ug-cheaty-ramp`,
`ug-sneak`, `wb-aristocrats`, `wbg-midrange`, `wbg-value-midrange`,
`wbr-aristocrats`, `wbrg-aristocrats`, `wubg-value`, and `wubrg-value` — these
are his **strategy candidates**. Separately, `loadDreamAvatarsV2` looks up
Kragg's UUID in the `DREAM_AVATAR_THEMES_BY_ID` map and attaches
`themeArchetypes = ["abandon"]` — his **theme**. The draft page calls
`generatePoolFromData` with the prebuilt `PoolData`, the `decklists` variant,
those `draftArchetypes` as the seed archetypes, and `["abandon"]` as the theme
archetypes.

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
`PoolData.decklists`, the filtered seat mainboards from
`docs/draft_records_adapted`) is scored by its fit to `br-aristocrats`: the total
IDF weight of the cards it shares with that list, then multiplied by the deck's
Abandon theme density. The black-red sacrifice seats score highest. Rather
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

## How they are dispatched

Each algorithm is a `PoolStrategy` — an object with an `id`, a one-line
`description`, and a `generate(request)` method — exported from its own
`variant-*.ts` module. The strategies are collected in
`src/draft/pool/registry.ts`, a `Record<PoolVariant, PoolStrategy>` that is the
single source of truth for which algorithms exist; the `?algo=` URL parameter
and the draft-test variant chip both read their option set from it.

When a pool is requested, `generate.ts` builds one uniform `PoolGenerationRequest`
— the seeded RNG, the pool data, and the Dream Avatar's seed archetypes, theme
archetypes, and signature cards — looks the chosen id up in the registry, and
calls that strategy's `generate`. The request carries every input any algorithm
might read; each strategy destructures only the fields it uses (`color_pool` and
`diverse` read the seed archetypes, `decklists` additionally reads
the theme archetypes, `idf3`/`picksig`/`sigseed` read the signature cards, and
`idf`/`idf2` read neither), so `generate.ts` never branches on which algorithm
runs. Whatever the
strategy returns, `generate.ts` caps every card at two copies, derives the
ordered color-identity string, and returns the pool together with its identity,
chosen themes, copy counts, the seed used, the final size, and which variant
produced it.

---

## The `idf` algorithm

The `idf` algorithm is the simplest decklist-based pool, and the only one that
reads nothing but the real decklists. The `color_pool`, `diverse`, and `decklists`
algorithms all consult the synthesized inputs — core staples, mechanic
tides, color lists, draft archetypes, and the Dream Avatar's seed and theme
archetypes. `idf` ignores all of them. It picks one real decklist at random and
grows a pool around it by IDF-weighted similarity. The premise is the most
literal reading of "give the player a coherent pool": hand them a real deck and
the real decks most like it.

Its run-time knobs live in the `IDF` constant in `color-pool.ts` (the in-app
equivalents of the `scripts/similar-pool.mjs` command-line flags), grouped so
retuning is a one-stop edit. If no usable decklists are bundled it falls back
entirely to `color_pool`.

### The corpus and what "similar" means

Like `decklists`, `idf` builds its own corpus from `PoolData.decklists`, cached
per `PoolData` (in a separate cache from `decklists`, so the two retune
independently). It keeps only decklists whose distinct-card count is within
`[minDeckSize, maxDeckSize]` — corpus hygiene that drops the near-empty partial
files and the handful of 50-91 card aggregates, which are not drafted decks and
would distort both the frequencies and the overlap scores.

Each card `c` gets an inverse-document-frequency weight `ln((n + 1) / df(c))`
raised to `idfPower`, where `df(c)` is the number of decks containing `c` and `n`
is the corpus size. A card in nearly every deck gets a weight near zero, so two
decks that share it are not counted as similar on that account; a card in only a
handful of decks dominates the score when two decks share it. Cards whose `df`
falls below `minDf` or above `maxDfFrac * n` are zeroed out of the score entirely
(too rare or too staple to carry signal), though they are still unioned into the
pool. `idfPower > 1` sharpens the rarity emphasis further; `idfPower = 0` ignores
rarity and reduces the score to plain card-presence cosine. Each deck's
IDF-weighted vector norm is precomputed so similarity is a cheap dot product.

### Building the pool

1. **Pick the starter.** Choose one decklist from the corpus uniformly at random.
   This single draw — seeded by the run's RNG — is the only randomness in the
   algorithm, so a seed reproduces a pool exactly and different seeds give
   different starters and therefore different pools.
2. **Rank the rest.** Score every other decklist by IDF-weighted cosine
   similarity to the starter — the sum of `idf²` over the cards the two decks
   share, divided by the product of their norms — and sort descending. "Most
   similar" thus means "shares the most distinctive cards", not "shares the most
   popular cards".
3. **Union whole decks best-first.** Seed the pool with the starter, then fold in
   the ranked decklists one at a time, each card's copy count rising by one per
   deck up to `cap` copies (the draft engine caps every pool at two copies
   downstream regardless). Decks are never truncated mid-list. After the starter
   and after each added deck the running pool is a candidate; the algorithm keeps
   the candidate whose size is closest to `targetSize` (ties going to the larger
   pool) and stops once a candidate reaches `targetSize + targetTolerance`, since
   adding more only moves further away. The acceptable window is therefore
   `[targetSize - targetTolerance, targetSize + targetTolerance]`; the boundary
   nearest the target wins, and a single deck occasionally jumps across the
   window, landing the pool a little outside it.

### Identity and labels

`idf` reports no color identity. Deriving one would read the color metadata, and
this algorithm consumes nothing but the decklists, so the identity string is left
empty and the header shows none. The theme labels are `idf` plus `deck#<index>`,
recording which corpus decklist started the pool.

---

## The `idf2` algorithm

`idf2` is `idf` with one change: the starter decklist is drawn with a **diversity
bias** instead of uniformly at random. Every other step — the corpus, the
IDF-weighted cosine ranking, the best-first whole-deck union, the size window —
is shared with `idf` (the two literally call the same growth helper). Like `idf`
it reads nothing but the real decklists; no archetypes, tides, colors,
Dream Avatars, or core staples enter into it. Its knobs live in the `IDF2`
constant in `color-pool.ts`, alongside the `IDF` block it builds on.

### The problem it fixes

`idf`'s starter draw is uniform over the filtered corpus, and the corpus is
lopsided: a popular archetype is recorded as dozens of near-duplicate real decks
while a fringe archetype has only a handful. Because pool growth is fully
determined by the starter (the starter draw is `idf`'s only randomness), a
uniform draw lands in the big near-duplicate clusters far more often than in the
small ones — so the player keeps being handed the same kind of pool. The fix is
purely mechanical and derived from the decklists alone: make a deck that sits in
a crowded cluster less likely to be the starter.

### Inverse near-twin-count starter weighting

The corpus is processed once (cached per `PoolData`) into the `idf` corpus plus,
for every deck, its **near-twin count**: how many other decks lie within
`twinTau` IDF-cosine of it (`0.5` by default). A deck deep inside a 44-deck
cluster has dozens of near-twins; a one-of-a-kind fringe deck has none. The
starter is then drawn weighted by

```
weight(deck) = 1 / (1 + nearTwins(deck)) ^ diversityBeta
```

so a deck competes for probability mass against its own near-duplicates: the
44-deck cluster as a whole is no longer 44× more likely to anchor a pool than a
singleton. `diversityBeta` (`0.5` by default) is the strength dial — `0`
reproduces `idf`'s uniform draw, and higher values flatten cluster occupancy
harder. The draw consumes a single random number, exactly as `idf`'s uniform draw
does, so a seed still reproduces a pool exactly.

### What the bias is worth, and its limit

`scripts/idf-starter-diversity-experiment.mjs` measures this against `idf`'s
uniform draw, clustering the corpus on content alone (no labels) and computing
exact archetype-occupancy metrics over the starter distribution. At the
production setting (`twinTau = 0.5`, `diversityBeta = 0.5`) it raises the
effective number of distinct archetypes drawn from about 221 to about 552 and
cuts the single most common archetype's share from about 4.1% to about 1.2%,
while the mean starter-to-folded-deck cohesion barely moves (about 0.45 to 0.42)
— the pools stay coherent. Pushing `diversityBeta` past roughly 1 starts seeding
pools from decks that have no real neighbours, which erodes that cohesion, so the
gentle default is the chosen operating point. The bias evens out which
*archetype* a pool is, not which individual cards appear: the most broadly played
staples are still unioned into nearly every pool, because that happens in the
whole-deck union step, downstream of the starter draw.

### Identity and labels

Like `idf`, `idf2` reports no color identity — it consumes no color metadata, so
the identity string is left empty and the header shows none. The theme labels are
`idf2` plus `deck#<index>`, recording which corpus decklist started the pool.

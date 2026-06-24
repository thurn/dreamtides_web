# Tides, tides2, tides3, tides4, and tides5 draft-pool algorithms

Five draft-pool algorithms build a Dreamcaller's draft pool by combining a small
number of preconstructed decks called **tides**. All five are selectable with
the `?algo=` URL parameter (`?algo=tides`, `?algo=tides2`, `?algo=tides3`,
`?algo=tides4`, `?algo=tides5`) and exist side by side so they can be compared
directly:

| | `tides` | `tides2` | `tides3` | `tides4` | `tides5` |
| --- | --- | --- | --- | --- | --- |
| Mirrors | `idf3` | `idf3`, sharpened | `sigseed` (its centre) | `sigseed` (its *variety*) | `tides4`, known-good corpus |
| Pool size | 200 | 200 | 150 | 150 | 150 |
| Tide decks | `data/tides.jsonc` (32, ~160 copies each) | `data/tides2.jsonc` (32, ~70 copies each) | `data/tides3.jsonc` (32: 20 signature ~150, 12 neutral ~30) | `data/tides4.jsonc` (64: 20 signature ~110, 32 facet ~45, 12 neutral ~30) | `data/tides5.jsonc` (64: 20 signature ~110, 32 facet ~45, 12 neutral ~30) |
| Corpus | decklist co-occurrence | decklist co-occurrence | every usable draft seat | every usable draft seat | only the known-good decklists |
| Relationships | none | `data/tides2_relationships.jsonc` | baked into the same file | baked into the same file | baked into the same file |
| Lead/core | one of the Dreamcaller's *favored* tides | drawn from the Dreamcaller's curated *tide pool* | the Dreamcaller's own *signature tide* (a random signature archetype for a neutral) | the Dreamcaller's *signature tide* always joined as the core | the Dreamcaller's *signature tide* always joined as the core |
| Fill tides | drawn uniformly at random | the lead's curated *allied tides* | the *broad* tides (forced only for a signatured lead) | a *random subset* of the Dreamcaller's *facet* tides, then broad tides | a *random subset* of the Dreamcaller's *facet* tides, then broad tides |
| Bake | `npm run bake-tides` | `npm run bake-tides2` + `npm run seed-tide-relationships` | `npm run bake-tides3` | `npm run bake-tides4` | `npm run bake-tides5` |
| Runtime module | `src/draft/pool/variant-tides.ts` | `src/draft/pool/variant-tides2.ts` | `src/draft/pool/variant-tides3.ts` | `src/draft/pool/variant-tides4.ts` | `src/draft/pool/variant-tides5.ts` |
| Rendered decklists | `docs/cards2/tide_decklists.md` | `docs/cards2/tides2_decklists.md` | `docs/cards2/tides3_decklists.md` | `docs/cards2/tides4_decklists.md` | `docs/cards2/tides5_decklists.md` |

Each algorithm has two halves: an **offline construction** step that bakes the
committed tide lists from real draft data, and a **runtime** step that combines
those lists into one pool. This document covers both halves for all five. The
first three sections describe the shared decklist-corpus foundation and the two
algorithms built on it (`tides`, `tides2`); section 4 covers `tides3` and section
5 covers `tides4`, both of which rest on a different foundation — the
pick-affinity corpus `sigseed` grows from — and are best read together. `tides3`
and `tides4` mirror `sigseed` from two complementary angles: `tides3` reproduces
the deterministic *centre* of a Dreamcaller's `sigseed` pools, while `tides4`
reproduces their run-to-run *variety*. `tides5` is the exact `tides4` algorithm
grown from a curated corpus — only the known-good decklists — and is described in
section 5.6.

## 1. Shared foundations

`tides` and `tides2` rest on the same primitives. (`tides3` does not use these;
it builds on the pick-affinity corpus described in section 4.)

### The decklist corpus and IDF cosine

`scripts/setup-assets.mjs` bundles every real player decklist from
`docs/draft_records_adapted/` into `public/decklists-data.json` (one inner array
of card names per deck). `idfCorpus` (`src/draft/pool/variant-idf.ts`) filters
those decks by size and computes an **inverse document frequency** weight for
each card: a card in too few or too many decks carries no similarity signal,
while a card that is distinctive of some decks carries a high weight. The
similarity between two card collections is the **IDF-cosine**: the dot product of
their IDF-weighted vectors over shared cards, divided by the product of their
norms. This is the same corpus and similarity the `idf`/`idf2`/`idf3` pool
variants grow from, so a tide deck approximates the kind of pool `idf3` grows.

### The tide-deck artifact

A tide deck is a decklist with a stable id (`tide-01`, ...), a human-readable
name, and a list of cards. Cards are keyed by **stable cards_v2 UUID**; the
`name` field is informational and refreshed at bake time, so renaming a card
never invalidates a tide. The schema and its validation live in
`src/draft/pool/tides-io.ts` (`TideDecksJson`, `validateTideDecks`). Both
`data/tides.jsonc` and `data/tides2.jsonc` use this schema. The artifact also
carries `favoredTidesByDreamcaller` (used by `tides`; baked but unused by
`tides2`).

### Pool size, the copy cap, and `dealable`

A pool is 200 copies with at most **2 copies** of any one card
(`POOL_TARGET_SIZE = 200`, `cap = 2`). When deciding whether enough tides have
joined to deal a full pool, the algorithms count **`dealable`** copies — the
copies the deal can actually use, i.e. `min(2, total copies of a card across the
joined tides)` summed over cards — not the raw size of the combined bag. This
matters because overlapping tides share cards: two tides that each run a card at
2 copies contribute only 2 dealable copies of it, not 4, so the combined bag can
be far larger than the dealable count.

### Determinism and the seed

`generatePoolFromData` (`src/draft/pool/generate.ts`) seeds a mulberry32 RNG from
a numeric seed and passes it to the selected variant; every random draw a variant
makes comes from that one RNG in a fixed order. At quest time the seed is
`hash(questSeed:dreamcallerId)`, so a Dreamcaller's pool is reproducible per
`(questSeed, Dreamcaller)`. The offline bake and seed scripts use **no**
randomness at all (deterministic tie-breaks throughout), so re-running them on the
same inputs produces byte-identical files.

## 2. `tides`

### 2.1 Constructing the tide lists (`scripts/bake-tides.mjs`)

`npm run bake-tides` writes `data/tides.jsonc` and the rendered
`docs/cards2/tide_decklists.md`. It is a pure function of the bundled decklists
and Dreamcaller signatures:

1. **IDF corpus.** Build the IDF corpus over the filtered real decklists.
2. **Cluster the corpus into 32 groups.** Deterministic **k-medoids** under
   distance `1 − IDF-cosine`: pick the most central deck as the first medoid,
   add medoids farthest-first until there are `clusters` (32) of them, then
   alternate assignment and recentering until stable. The clusters are then
   **density-balanced** (`balanceClusters`): clusters with fewer than
   `minClusterMembers` (6) decks are dissolved into their nearest neighbour, and
   the largest clusters are split until the count is back to 32. Dense regions of
   the corpus end up with several tides, so the share of tides covering an
   archetype tracks the share of real decks that play it.
3. **Turn each cluster into a tide.** Within a cluster, rank cards by
   `frequency × idf^idfRankWeight` (`idfRankWeight = 2`, which concentrates each
   tide on its cluster's *distinctive* cards), dropping cards below a small
   per-cluster frequency floor. Walk that ranking, giving a card **2 copies**
   when at least `doubleShare` (0.35) of the cluster's decks run it and 1 copy
   otherwise, until the tide reaches about `tideSize` (**160**) copies. The
   tide's name is its medoid deck's two highest-IDF cards.
4. **Favored tides per Dreamcaller.** For each signatured Dreamcaller, score
   every tide by the IDF-cosine of the Dreamcaller's signature cards against the
   tide's card multiset (`probeTideCosine` — the same probe `idf3` uses to find
   its anchor decks) and keep the top `favoredPerDreamcaller` (4), most-similar
   first, as `favoredTidesByDreamcaller[dreamcallerId]`. About 20 of the 32
   Dreamcallers have signatures; the rest ("neutral") get no favored entry.

All dials live in the `TUNING` block at the top of `scripts/bake-tides.mjs`.

### 2.2 Building the pool at runtime (`generateTides`)

`src/draft/pool/variant-tides.ts` reads `poolData.tideDecks` and:

1. **Lead.** Shuffle a copy of the Dreamcaller's `favoredTidesByDreamcaller`
   list and take `favoredDraw` (**1**) favored tide. A neutral Dreamcaller (no
   favored entry) takes no favored lead.
2. **Fill.** Shuffle the remaining tides and join them **uniformly at random**,
   one at a time, until `dealable ≥ 200`.
3. **Deal.** Collect every copy of every card across the joined tides into one
   bag (mapping each UUID to its current name via `poolData.cardNameById`,
   skipping cards no longer in the catalog), Fisher-Yates shuffle the bag once,
   and take cards in bag order — skipping any already at 2 copies — until the
   pool reaches 200.

The result's `selected` label records the algorithm and the joined tide ids for
debugging. (`TIDES` tuning: `favoredDraw 1`, `dealSize 200`, `cap 2`.)

## 3. `tides2`

`tides2` keeps the same deck-bake pipeline but bakes **smaller, purer** tides,
and replaces random fill with **affinity-based selection** driven by a separate,
curated relationship file. The two changes work together: smaller tides carry
fewer off-theme tail cards (so a build-around payoff is less likely to land in a
pool that cannot support it), and affinity fill reinforces the lead's theme
instead of diluting it.

### 3.1 Constructing the tide lists

#### Tide decks (`npm run bake-tides2`)

The same `scripts/bake-tides.mjs` pipeline (section 2.1) writes
`data/tides2.jsonc` and `docs/cards2/tides2_decklists.md`, run with
`--tide-size 70`. The smaller cut keeps each tide focused on the cards most
characteristic of its cluster and drops the long tail of incidental cards that a
160-copy tide would include. The bake derives the variant (`tides` vs `tides2`)
from the output path, so the committed file's header and the rendered doc carry
the correct story. `favoredTidesByDreamcaller` is still baked, but `tides2` does
not read it — its selection comes entirely from the relationship file below.

#### Relationships (`npm run seed-tide-relationships`)

`scripts/seed-tide-relationships.mjs` writes `data/tides2_relationships.jsonc`,
which holds two curated maps (schema and validation in
`src/draft/pool/tide-relationships-io.ts`):

- **`alliesByTide`** — for every tide, an ordered list of allied tides (best
  first), the decks that combine well with it. A pool fills from this list.
- **`tidePoolByDreamcaller`** — for every Dreamcaller (UUID), the tides its lead
  is drawn from.

This script is the **only** place `data/buildaround_support.json` (the
per-card build-around payoff/support metadata) is read. It is run once to seed
the relationships, after which the file is hand-curated and never overwritten by
routine tooling. It refuses to overwrite an existing file without `--force`. It
is deterministic (no randomness; sorted tie-breaks; fixed replay seeds).

**Allies, with trap repair.** For each tide:

1. **Rank by similarity.** Rank the other 31 tides by cosine over their card-id
   multisets (copies as weights). The top `repairCandidates` (18) form the
   candidate window; the cosine top `allies` (6) are the starting ally set.
2. **Repair toward fewer traps.** A *trap* is a build-around payoff that lands in
   a pool which cannot support it — formally, a payoff card whose best needed
   theme has support share below `TRAP_TAU` (0.35) × the theme's demand target
   (10% / 18% / 25% of the pool for tier 1 / 2 / 3). The seeder greedily swaps
   allies in and out of the candidate window, keeping any swap that lowers the
   **mean realized traps** objective, and finally orders the chosen allies so the
   lowest-trap ally leads. "Realized traps" is measured by **replaying the exact
   runtime fill** (section 3.2 — shuffle the ally window, join lead plus allies
   until the pool is full, breadth-first fallback) over `evalSeeds` (24)
   deterministic seeds and counting traps with the build-around metadata. This
   makes the seeder optimize the metric the runtime is actually scored on. Every
   repaired lead is logged.

**Dreamcaller tide pools.**

- **Signatured Dreamcallers** get the top `poolWidthSignatured` (8) tides by
  signature-probe IDF-cosine (`probeTideCosine`), most-similar first — the same
  probe the favored-tide bake uses.
- **Neutral Dreamcallers** get a diverse, representative spread of
  `poolWidthNeutral` (10) tides by **farthest-point sampling** over the tide
  similarity matrix (greedily add the tide least similar to those already
  chosen), with the starting tide rotated per neutral Dreamcaller so each has its
  own overlapping identity.

After writing the JSON, the seeder appends the `Allied tides` and `Tide pools by
Dreamcaller` tables to `docs/cards2/tides2_decklists.md` (after the marker the
bake leaves), so the player-facing decklist file shows the relationships too.

All dials live in the `TUNING` block at the top of
`scripts/seed-tide-relationships.mjs`.

**Validation and the staleness guard.** `validateTideRelationships` requires
every ally id and every tide-pool id to name an existing tide, every tide to have
an ally entry, no tide to ally itself, and every Dreamcaller pool to be
non-empty. Because the relationships are curated against a specific baked set of
tides, re-baking `data/tides2.jsonc` (which can change tide ids or contents)
**invalidates** the relationships: the validator throws on any dangling tide id,
so a stale combination cannot ship silently. Re-baking the decks therefore
requires re-seeding (`--force`) and re-curating.

### 3.2 Building the pool at runtime (`generateTides2`)

`src/draft/pool/variant-tides2.ts` reads `poolData.tides2Decks` and
`poolData.tides2Relationships` and:

1. **Lead.** Shuffle a copy of the Dreamcaller's `tidePoolByDreamcaller` entry
   and take the first id. A missing entry (no Dreamcaller, or stale data) falls
   back to a shuffled draw over every tide so the variant still produces a pool;
   load-time validation flags missing entries, so this should not happen in
   production.
2. **Fill order.** Take the lead's allies, shuffling the front
   `allyShuffleWindow` (6) for run-to-run variety, then the remaining allies in
   baked order. If those cannot fill the pool, continue **breadth-first through
   allies' allies** (each tide deduplicated so it joins at most once). Every
   joining tide is justified by a published relationship — the Dreamcaller's tide
   pool for the lead, the allies lists for the fill — never a uniform-random draw.
3. **Join until full.** Join the lead, then the fill order one tide at a time,
   until `dealable ≥ 200`.
4. **Deal.** Identical to `tides`: build the bag (UUID → current name), one
   Fisher-Yates shuffle, deal 200 with at most 2 copies of any card.

The `selected` label records the algorithm and the joined tide ids. (`TIDES2`
tuning: `allyShuffleWindow 6`, `dealSize 200`, `cap 2`.) The shuffle of the ally
window is what gives a Dreamcaller pool-to-pool variety for a fixed lead, while
the allies' trap-repaired ordering keeps the expected pool low on traps.

## 4. `tides3`

`tides3` is the human-legible counterpart of a different generator than `tides`
and `tides2` mirror. Both of those reproduce `idf3` — a broad, archetype-mixed
pool grown from hundreds of real decklists. `tides3` reproduces **`sigseed`**, the
default pool variant, whose pools are grown *only* from a Dreamcaller's signature
cards and therefore never drift onto an unrelated identity. The promise to the
player has the same shape as the other tides — there are 32 preconstructed decks
a player can read, and a quest combines a few of them at the start of a run — but
the decks themselves, and the way they are combined, are built so that the pool a
player drafts from carries the Dreamcaller's own theme as faithfully as `sigseed`
does. The slogan a player hears: *"your Dreamcaller's own signature tide leads,
shuffled together with broad tides until there are enough cards, and we deal the
first 150."*

### 4.1 A different foundation: the pick-affinity corpus

The first thing that sets `tides3` apart is what its decks are grown from. `tides`
and `tides2` rest on the IDF decklist corpus of section 1 — the cards that
co-occur in finished decks, weighted by how distinctive each one is. `sigseed`
does not use that corpus at all, so neither does `tides3`. Both grow pools from
the **pick-affinity corpus**, the same data `pickfit`, `pickcohere`, and `picksig`
read, built from real draft *pick* records rather than finished decklists.

A pick record knows more than a decklist does: for every pick it knows the whole
pack that was offered and which card the drafter actually took. From that the
corpus derives two statistics a decklist cannot. The first is an
**availability-corrected play-rate prior** — how often a card is taken relative to
how often it is even offered — a measure of raw desirability that controls for how
much a card was simply *seen*. The second is a **behavioural synergy affinity** —
the *excess* rate at which a card is taken once the drafter already holds a
particular partner, over that card's own baseline. Because a strong card has a
high baseline anyway, it only registers affinity to a partner when holding the
partner makes drafters take it *more* than usual, which isolates genuine synergy
from raw card power. Power rides in the prior; synergy rides in the affinity, so a
pool built from both does not collapse onto globally strong staples.

`sigseed` and `tides3` both expand a pool from that corpus with the shared
**affinity grower**. Starting from one or more seed cards, the grower repeatedly
adds the card whose blended score is highest — a blend of its affinity to the
seeds, its affinity to the cards already chosen (so the pool stays coherent with
itself, not just with the seed), and the play-rate prior. The most central cards
earn a second copy; the fringe stays at one. The whole walk runs in card-UUID
space, so a card rename never shifts the result.

Where `sigseed` and `tides3` diverge from one another is only in *when* that growth
happens. `sigseed` runs it live, once per quest, from a fresh random subset of the
Dreamcaller's signature cards — and that random subset is where its run-to-run
variety comes from: a single signature card leans the pool one way, a pair or
triple blends them. `tides3` runs the same growth offline, at bake time, and
freezes the result into readable decks, so the "magic" `sigseed` performs at
runtime is instead inspectable in committed data.

### 4.2 Two kinds of tide

`tides` and `tides2` bake 32 tides of a single kind — each is one archetype
cluster of the decklist corpus. `tides3` bakes two kinds, because `sigseed`
behaves in two different ways depending on the Dreamcaller, and the decks have to
stand in for both. The project owner explicitly allowed tides to play different
roles, and `tides3` uses that latitude: its 32 decks are not homogeneous in size
or purpose.

**Twenty signature tides — one per signatured Dreamcaller.** For each of the 20
Dreamcallers that carries a signature, the bake resolves that full signature onto
the corpus and grows a 150-card pool from *all* of the signature cards at once.
That deck is, quite literally, the `sigseed` pool for that Dreamcaller's complete
signature. It is also the natural centre of the cloud of pools `sigseed` produces
at runtime: where `sigseed` draws a random subset and leans toward it, the
all-signatures deck sits in the middle of every lean, so it is the single best
fixed estimate of "what this Dreamcaller's pool looks like."

The size is deliberate. A signature tide is grown to exactly 150 copies, matching
`sigseed`'s own pool size, because 150 is the *purity sweet spot*. The cards most
tightly tied to a Dreamcaller's signature are limited in number; growing a deck
past that point forces the grower to reach into a progressively less-on-theme
affinity tail, and those tail cards show up as off-theme build-around payoffs the
pool cannot support — traps. Measuring this directly, the expected traps per pool
climb steadily as the signature tide is grown larger, while the share of the pool
that actually delivers the Dreamcaller's theme falls. A 150-card signature tide is
about as on-identity as a fixed deck can be.

**Twelve neutral tides — broad, format-spanning decks.** Twelve of the roster's 32
Dreamcallers carry no signature. For those, `sigseed` has nothing to anchor on, so
it reduces to plain `pickcohere`: a coherent pool grown from one *uniformly* drawn
seed card, which across many runs spreads over the whole format. The neutral tides
stand in for that behaviour. Each is a small, broad deck, and the twelve together
are chosen to span the format by **farthest-point sampling**: the bake picks one
well-played card, then repeatedly adds the played card whose affinity is most
*distant* from the cards already chosen, so the twelve anchors land in twelve
different regions of the format rather than clustering. Each anchor is then grown
into a roughly 30-card deck. (Only cards that clear a play-rate floor are eligible
as anchors, so neutral decks are built around genuinely-played cards rather than
fringe singletons.) Neutral tides serve as the **generic tail** every signatured
pool mixes in — the removal, card draw, and efficient bodies a `sigseed` pool's
play-rate prior pulls in — and they keep the format's tail of less-signatured cards
covered so no part of the format goes undraftable.

### 4.3 The per-Dreamcaller tide pools

`tides2` keeps its relationships in a separate, hand-curated file; `tides3` keeps
its per-Dreamcaller pools in the **same baked artifact** as the decks, because they
are derived, not curated. For every Dreamcaller the bake writes two lists: **leads**
and **fill**. One lead is drawn at random each run and always joined; the fill tides
are the broad tail, shuffled and joined until the pool is full. The split between a
signatured and a neutral Dreamcaller is entirely in the leads.

A **signatured** Dreamcaller has a single lead candidate — its own signature tide —
so every one of its pools leans the same way, on its own identity. Its fill is the
nearest broad tides, ranked by cosine similarity between the tides' card lists. The
choice of *broad* tides for fill, rather than other Dreamcallers' signature tides,
is deliberate and was settled by measurement. An allied signature tide would carry
a second Dreamcaller's identity into the pool, and mixing it in measurably pulls the
pool toward that second theme and drops the home Dreamcaller's theme share — it hurts
exactly the metric `tides3` exists to match. A broad tide instead supplies generic
goodstuff without importing a competing identity, so the fill keeps the pool
mono-theme, the way `sigseed` keeps it.

A **neutral** Dreamcaller has *every signature tide* as a lead candidate. This
mirrors how `sigseed` handles a signatureless Dreamcaller: with nothing to anchor
on it falls back to `pickcohere`, a coherent pool grown from a uniformly-drawn seed,
which lands on a different coherent archetype each run. A neutral `tides3` pool does
the same by drawing one of the twenty signature tides at random and leaning on it —
so each run is a *coherent, single-archetype* pool, just a different archetype every
time. This is the crucial point for how a neutral pool *feels*: leading with a
whole coherent archetype is what keeps it from playing as a disjointed grab-bag.
Anchoring a neutral pool on a broad, themeless deck and filling it with unrelated
tides — which is the obvious thing to try — produces pools with no centre of
gravity; leading with a real archetype fixes that, and measured pool coherence
(the mean pairwise pick-affinity of a pool's cards) confirms it: a neutral `tides3`
pool is as internally coherent as a signatured one, well above what a broad-led
neutral pool reaches.

### 4.4 Building the pool at runtime

The runtime, in `src/draft/pool/variant-tides3.ts`, is short. It pins the pool to
**150 copies**, not the quest's usual 200, and ignores the size the quest asks
for — exactly as `sigseed` and `pickfit` ignore it. This is not an oversight: the
default variant `sigseed` itself ships 150-card pools, and several of the metrics
the two are compared on (trap counts especially) scale with pool size, so matching
the size is what lets `tides3` and `sigseed` line up at all.

Selection then proceeds in three steps. One **lead** tide is drawn at random from
the Dreamcaller's lead candidates and always joined first — a fixed choice for a
signatured Dreamcaller (it has one candidate), a different coherent archetype each
run for a neutral one. The **fill** tides are shuffled and joined one at a time
until the pool is full. Whether a tail tide is *forced* depends on where the pool's
variety comes from. A signatured pool has a fixed lead, so its variety has to come
from the tail and the deal: it forces in at least one broad tide even though the
150-card signature lead could fill the deal alone, which makes the combined bag
larger than 150 so that dealing 150 from it drops a different handful of cards each
run. A neutral pool already gets its variety from the *random archetype lead*, so it
forces no tail at all — its coherent 150-card archetype lead fills the deal by
itself, leaving the pool a pure, on-theme archetype rather than one diluted by an
off-theme broad deck. (Both still join more tides whenever a lead cannot fill the
pool on its own.)

The **deal** is identical in spirit to the other tides. Each card's UUID is mapped
to its current display name (cards absent from the current catalog are skipped), the
combined bag is shuffled once, and 150 copies are dealt, never more than two of any
one card. As elsewhere, "dealable" counts the copies the deal can actually use —
two per card across the joined tides — so overlapping tides keep joining until a
full pool is genuinely reachable rather than merely nominally large. The result's
label records the algorithm and the joined tide ids, which are logged on
`draft_pool_constructed` so a pool can always be traced back to the decks it was
combined from.

### 4.5 The artifact and its staleness guard

`data/tides3.jsonc` is a single self-contained file holding both the 32 decklists —
each tagged with its role, `signature` or `neutral` — and the per-Dreamcaller tide
pools. Its schema and validation live in `src/draft/pool/tides3-io.ts`. Because the
tide pools reference tide ids, re-baking the decks (which can rename or renumber a
tide) could leave a pool pointing at a tide id the new bake does not contain; the
validator throws on any such dangling id, so a stale artifact fails loudly at load time
rather than producing a quietly wrong pool. As with the other bakes, cards are
keyed by stable cards_v2 UUID and the `name` fields are informational, refreshed at
bake time, so renaming a card never invalidates the file.

The bake (`npm run bake-tides3`, `scripts/bake-tides3.mjs`) uses no randomness —
deterministic tie-breaks throughout — so re-running it on the same inputs writes a
byte-identical body. Its dials (the signature and neutral tide sizes, the number of
neutral tides and their play-rate floor, the fill width) live in a single `TUNING`
block at the top of the script. It writes both the machine-readable
`data/tides3.jsonc` and the player-facing `docs/cards2/tides3_decklists.md`, the
rendered decklist a player is invited to read, which also tabulates each
Dreamcaller's lead and fill tides.

### 4.6 How close it comes to `sigseed`

`tides3` is measured against `sigseed` on the same real-draft simulation every pool
algorithm is scored on — every Dreamcaller, full signature, many seeds — using
`scripts/pool-metrics.mjs`. The headline question is the **dreamcaller** metric:
does each pool actually deliver the theme its Dreamcaller was built to play,
measured against an archetype-support set learned from the decklist corpus rather
than any hand label. On that metric `tides3` scores about 88 against `sigseed`'s
89 — by far the closest of the three tide algorithms. `tides` and `tides2` score in
the mid-50s here, not because they are weak generators but because they reproduce
`idf3`'s broad archetype mix, which is a different goal: a `tides2` pool is a
coherent archetype, but not necessarily *this Dreamcaller's* archetype, whereas a
`tides3` signature tide is grown from this Dreamcaller's signature and nothing else.

On the secondary pool-quality metrics `tides3` tracks `sigseed` closely. Expected
traps per pool sit near `sigseed`'s (a little over one), because a signature tide
is a `sigseed` pool and the single broad fill tide adds only a thin generic tail.
The diversity headline — how evenly cards are used across all pools and how broadly
the standalone archetypes are draftable — matches `sigseed` almost exactly, with
both the card-utilization and theme-spread halves in line. Build-around adequacy is
a few points below `sigseed`, the cost of the broad fill carrying a handful of
payoffs whose support it does not fully bring along; this is the metric where the
"combine a generic tail" choice is most visible.

The one number where the gap is real rather than incidental is the per-card
inclusion-frequency cosine — how similar the *distribution of cards* across pools
is, run via `scripts/tides-similarity-experiment.mjs`. There `tides3` reaches about
0.82 of the way to `sigseed`'s own seed-to-seed self-consistency. The shortfall is
structural and expected: a `tides3` signatured pool is the *all-signatures* deck,
which spans somewhat more cards than any single one of `sigseed`'s *random-subset*
pools, so the two distributions differ in shape — a fixed readable deck is broader
and flatter than a freshly grown one that leans toward whichever subset it drew.
That breadth is the price of legibility, and it is the same trade `tides` and
`tides2` make against `idf3`. What `tides3` buys with it is the thing the project
asked for: a pool a player can trace to 32 decks they can read, that still delivers
the Dreamcaller's identity the way the default generator does.

## 5. `tides4`

`tides4` mirrors the same generator as `tides3` — `sigseed` — but aims at a
different property of it. `tides3` reproduces the deterministic *centre* of a
Dreamcaller's `sigseed` pools: it bakes one all-signatures pool per Dreamcaller
and ships nearly that same pool every run. What it gives up is `sigseed`'s
run-to-run *variety*. `sigseed` grows each pool live from a fresh random *subset*
of a Dreamcaller's signature cards, and that subset is the whole source of its
variety: a single signature card leans the pool one way, a pair or triple blends
them, so one Dreamcaller yields a cloud of distinct, differently-leaning pools.
`tides4` is built to reproduce that cloud from readable decks. It rests on the
same pick-affinity foundation and the same affinity grower as `tides3` (section
4.1), so everything there applies; what differs is the decks it bakes and the way
it combines them.

### 5.1 Three kinds of tide

`tides4` decomposes a Dreamcaller's `sigseed` cloud into a stable core plus the
axes it varies along, and bakes each as its own deck. Its 64 decks play three
roles.

**Twenty signature tides — one per signatured Dreamcaller, the always-joined
core.** Each is that Dreamcaller's full-signature `sigseed` pool, grown from all
its signature cards at once — the same dense, on-identity deck `tides3` leads
with, baked here at about 110 cards. Every one of the Dreamcaller's pools is built
on this core, which is what keeps `tides4` as on-theme as `tides3`: the core
alone already carries most of the Dreamcaller's identity, so no matter what else
is mixed in, the pool stays anchored.

**Thirty-two facet tides — a shared library, the variety engine.** A *facet* is a
single-anchor `sigseed` pool: the coherent lean that *one* card from the
signature region grows into, baked small (about 45 cards) so it perturbs the core
without swamping it. Drawing a random few of a Dreamcaller's facets each run is
the direct analogue of `sigseed`'s random signature subset — it is what leans the
pool a different way every run. The facet anchors are chosen from the union of
*every* signatured Dreamcaller's signature cards (about 99 distinct cards across
the roster) by **per-Dreamcaller round-robin**: in each round every Dreamcaller
contributes its next most-played not-yet-chosen signature card, so every
Dreamcaller's strongest cards become facets and the library is shared across
Dreamcallers whose signatures overlap. Capping the library at 32 keeps the
player-facing deck count small; the cost of that cap is discussed in section 5.4.

**Twelve neutral tides — broad, format-spanning decks.** Identical in spirit to
`tides3`'s neutral tides (section 4.2): small decks grown from farthest-point
seed cards that span the format, standing in for the `pickcohere` pools `sigseed`
reduces to for a signatureless Dreamcaller, and serving as the generic tail that
tops a pool up to full size when a Dreamcaller's own tides cannot.

### 5.2 The per-Dreamcaller tide pools

As in `tides3`, the per-Dreamcaller combinations live in the same baked artifact.
For every Dreamcaller the bake writes three lists: a **starter** (its signature
tide, or null), the **facets** a random subset is drawn from, and a **neutral**
tail.

A **signatured** Dreamcaller's starter is its own signature tide, and its facets
are the library facets nearest its signature, most on-theme first, capped at
eight — its own signature cards' facets always rank first (they sit at affinity 1)
and are always included, with the rest filled by the on-identity facets it shares
with kindred Dreamcallers. Its neutral tail is the broad tides nearest its starter
by cosine.

A **signatureless** Dreamcaller has a null starter and nothing of its own to
anchor on. Rather than blend unrelated facets — which yields a grab-bag pool "with
no centre of gravity" — it **borrows a random signatured Dreamcaller's whole pool
at runtime**: it picks one of the twenty signatured archetypes at random and draws
that archetype's signature core plus a random subset of *its* facets. So each run
is a single coherent archetype, a different one each time — the same device
`tides3` uses for its neutral Dreamcallers (a random signature archetype), with
`tides4`'s facet-subset variety layered on. This is the move `sigseed` itself
makes, falling back to a coherent, randomly-themed `pickcohere` pool for a
signatureless Dreamcaller.

### 5.3 Building the pool at runtime

The runtime, in `src/draft/pool/variant-tides4.ts`, pins the pool to **150
copies** exactly as `tides3` does and for the same reason (section 4.4).
Selection is four short steps. The **starter** is joined first when present — the
always-there core. A random **facet subset** is then drawn: its size is taken
uniformly in `[1, min(maxFacetDraw, available facets)]` with `maxFacetDraw = 3`,
mirroring `sigseed`'s random subset size (`SIGSEED.maxSeedCards`), and that many
facets are taken from a shuffled copy of the Dreamcaller's facet list. If the
core plus the drawn facets cannot yet fill the pool, the remaining on-identity
facets are joined next, then the broad **neutral** tail — on-theme cards before
generic ones. Finally the combined bag is shuffled once and **150 copies are
dealt** in two passes, never more than two of any card, with "dealable" counting
the copies the deal can actually use so overlapping tides keep joining until a
full pool is genuinely reachable. The first pass **guarantees the signature tide**:
it seeds one copy of every starter card before anything else, so the signature
tide is always present in full rather than risking being cut when the shuffled bag
overflows 150 (a signature tide has well under 150 distinct cards, so it always
fits with room to spare). The second pass fills the remaining slots from the same
shuffled bag — second copies of signature cards and the facet/neutral cards —
exactly as a single deal would. The random facet subset is the variety engine; the
deal of the non-signature remainder from a larger bag adds a second, finer source
of run-to-run variation. The
result's label records the algorithm and the joined tide ids, logged on
`draft_pool_constructed` so a pool can be traced back to its decks.

The artifact (`data/tides4.jsonc`, schema and validation in
`src/draft/pool/tides4-io.ts`) is self-contained and carries the same staleness
guard as `tides3`: because the per-Dreamcaller pools reference tide ids, the
validator throws on any dangling id, so a stale bake fails loudly at load time. The
bake (`npm run bake-tides4`, `scripts/bake-tides4.mjs`) is deterministic, with one
`TUNING` block of dials, and writes both `data/tides4.jsonc` and the player-facing
`docs/cards2/tides4_decklists.md`.

### 5.4 How close it comes to `sigseed`

`tides4` is measured against `sigseed` on the same real-draft simulation
(`scripts/pool-metrics.mjs`). On the headline **dreamcaller** metric — does each
pool deliver its Dreamcaller's own theme — `tides4` scores about 91 against
`sigseed`'s 89, matching it (the always-joined signature core is what carries
this). The secondary pool-quality metrics track `sigseed` closely too: the
diversity headline is about 96 against 96, expected traps per pool about 1.1
against `sigseed`'s 1.1, and build-around adequacy about 94 against 97.

The property `tides4` is built to reproduce is `sigseed`'s **run-to-run variety**
— the way one Dreamcaller yields a cloud of differently-leaning pools rather than
the same pool every run. The right measure of this is each Dreamcaller's
*self-diversity*: the mean pairwise dissimilarity (Jaccard distance) between its
own pools across many seeds. On signatured Dreamcallers `sigseed` sits at about
0.21, `tides4` at about 0.26, and `tides3` at about 0.35. Two things stand out.
First, `tides3` is not a low-variety generator — its pools differ *more* run to
run than `sigseed`'s — but that variety is the wrong *kind*: it comes from the
random broad-tide splash and the deal trimming the fixed all-signatures deck, so
the cards that change between runs are off-theme. `tides4`'s variety is *on-theme*:
what changes between runs is which on-identity facets are emphasised, exactly the
axis `sigseed` varies along, and its magnitude (0.26) sits closer to `sigseed`'s
than `tides3`'s does. That on-theme lean variety, at roughly `sigseed`'s level, is
what `tides4` buys over `tides3`.

A note on the per-card *frequency-cosine* similarity
(`scripts/tides-similarity-experiment.mjs`): on that metric `tides3` actually
scores slightly higher than `tides4` (about 0.82 against 0.77 of `sigseed`'s
self-consistency). That metric compares the *aggregate* card-frequency
distribution, which rewards sitting at the centre of `sigseed`'s cloud — and
`tides3`'s fixed all-signatures deck *is* that centre. It does not reward, and
mildly penalises, the on-theme lean variety `tides4` adds, so it is not the right
yardstick for `tides4`'s goal; self-diversity above is.

The honest cost is **coverage**: across all pools `tides4` ever uses about 84% of
the draftable cards against `sigseed`'s ~97%. This is the price of the 32-facet
cap. `sigseed` grows every pool live and can reach any card in the corpus;
`tides4` can only ever deal a card baked into one of its 64 decks (about 446
cards), and a signatured pool, filled by its core and its own facets, rarely
reaches for the neutral tail that carries the format's fringe. Widening the facet
library would lift coverage at the cost of either deck count or on-theme density;
84% is the balance struck for a readable 64-deck set.

### 5.5 Reading a pool back: the Pool Viewer and "Why Cards" surfaces

A `tides4` run records full **tide provenance** as it builds the pool
(`Tides4PoolProvenance` in `src/draft/pool/types.ts`): every tide that took part
in the run, tagged by *why* it was joined (`starter`, `facet-drawn`,
`facet-fill`, `neutral-fill`), its full resolvable decklist, and, per pooled
card, the joined tides that contain it and which one is its home (the earliest in
join order). The summary is recomputed on demand and resolved to card numbers by
`buildDreamcallerTides4Provenance` (`src/data/quest-content.ts`); it is never
persisted, because the pool is deterministic per `(seed, dreamcallerId)` and
reproduces exactly.

Two player-facing surfaces read it:

- The **Pool Viewer** (`src/components/PoolViewer.tsx`) shows a construction
  banner — the starting signature tide (or, for a signatureless Dreamcaller, the
  borrowed archetype), how many of how many theme tides were drawn, and the deal
  rule — and adds a **Tide Decks** source. Its sub-navigation opens each
  individual tide that built the pool: selecting a tide shows its decklist, with a
  copy badge on each card recording how many copies landed in the draft pool, so
  a card the tide carried that did not make the cut reads as an unbadged tile. The
  **Run Pool** source shows the final dealt pool and the **Signature Cards**
  source shows the Dreamcaller's signature.
- The **"Why Cards"** overlay (`src/screens/CardSourceOverlay.tsx`) walks the
  construction story — signature tide → random theme-tide draw → broad fill →
  deal — and, for each card on the draft screen, names its source tide, the tide's
  role, and why that tide was part of the run.

### 5.6 The known-good corpus (`tides5`)

`tides5` is the same algorithm as `tides4` — the same three kinds of tide, the
same per-Dreamcaller pools, and the **same runtime combine** (the two variants
share `combineTidesPool` in `src/draft/pool/variant-tides4.ts` verbatim). It
differs in exactly one thing: the corpus the signature, facet, and neutral tides
are grown from.

`tides4` grows from every usable draft seat (the bundled
`public/draft-records-data.json`). `tides5` grows from **only the known-good
decklists** catalogued in `docs/known_good_decklists.json` — a hand-vetted set of
real drafted decks (nonland mainboard ≤ 30, sideboard ≥ 6, sealed pools excluded),
identified by `(draftId, seat)`. The bake (`scripts/bake-tides5.mjs`) keeps only
those seats' pick records and discards every other draft seat before building the
pick-affinity corpus (the availability-corrected play-rate prior and the shrunk
excess-lift synergy that `sigseed`/`pickfit` use). The generator that turns that
corpus into tides is shared verbatim with `tides4` (`buildTides4`), so any
difference between a `tides4` and a `tides5` pool is attributable purely to the
known-good corpus restriction.

The bake reuses the canonical draft-record reader (`buildDraftRecords`), so a
known-good seat that also survives in the `tides4` corpus produces a byte-identical
record. It relaxes only the reader's "exactly 30 trimmed picks" rule (passing
`requireFullPicks: false`), so the known-good seats that come from non-standard
drafts — five packs of nine, a single oversized pack — are kept as well, each
contributing its high-signal early picks (pack 1–3, pickInPack ≤ 10). The corpus
weights every counted pick equally regardless of its in-pack position, so a short
seat's observations stay valid.

The artifact (`data/tides5.jsonc`, rendered as `docs/cards2/tides5_decklists.md`)
carries the same schema as `tides4` and reuses its validator. Curated card tweaks
live in `data/tides5-overrides.jsonc`, and a staleness guard
(`scripts/check-tides5.mjs`, also run by `npm test`) re-bakes from source and
fails if the committed artifact drifts. Build it with `npm run bake-tides5`
(then `npm run setup-assets` to serve it as `/tides5-data.json`).

**Player-facing labels.** Each tide carries hand-authored identity annotations —
`displayName`, `displayDescription`, `shortName`, `summary`, `description`, and
`color` — that the tide-select screen, Pool Viewer, and "Why Cards" surfaces show.
Because a `tides5` tide *is* a `tides4` tide grown from a different corpus, these
are **inherited from `data/tides4.jsonc` by tide name** rather than re-authored: a
signature tide matches by its `"<Dreamcaller> signature"` name, a facet tide by its
`"Lean: <anchor card>"` name — the same Dreamcaller signature or single-card lean
carries the same label in both. Tide *ids* deliberately are not used for this,
because a facet's id depends on the per-corpus play-rate ranking, so the same id
names a different lean in each bake. A tide with no `tides4` name-match (a broad
neutral whose top cards differ, or a facet whose anchor only the known-good corpus
surfaced) keeps its baked name and a deterministic `color`; the player-facing UI
falls back to the tide name for it. To relabel a `tides5` tide, edit the matching
`tides4` tide and re-bake both.

## 6. Artifacts, scripts, and served assets

| Artifact | Produced by | Served as (gitignored) | Read at runtime by |
| --- | --- | --- | --- |
| `data/tides.jsonc` | `npm run bake-tides` | `public/tides-data.json` | `tides` |
| `data/tides2.jsonc` | `npm run bake-tides2` | `public/tides2-data.json` | `tides2` |
| `data/tides2_relationships.jsonc` | `npm run seed-tide-relationships` | `public/tides2-relationships-data.json` | `tides2` |
| `data/tides3.jsonc` | `npm run bake-tides3` | `public/tides3-data.json` | `tides3` |
| `data/tides4.jsonc` | `npm run bake-tides4` | `public/tides4-data.json` | `tides4` |

`scripts/setup-assets.mjs` copies each committed `.jsonc` (stripping comments) to
its served path. The browser fetches the served copies through loaders in
`src/data/cards-v2-database.ts` (`loadTideDecks`, `loadTides2Decks`,
`loadTides2Relationships`, `loadTides3Decks`, `loadTides4Decks`);
`src/data/quest-content.ts` fetches them only for the variant that needs them. The
metric harnesses (`scripts/pool-metrics.mjs`,
`scripts/tides-similarity-experiment.mjs`) read the committed `.jsonc` files
directly. `tides3` and `tides4` are each self-contained in one file — their decks
and per-Dreamcaller tide pools live together — so they need no separate
relationships artifact.

### Re-bake / re-seed workflow

```bash
# tides
npm run bake-tides            # rewrites data/tides.jsonc + the rendered doc
npm run setup-assets          # copies it to public/

# tides2 (re-seed after any deck re-bake — the validator throws on a stale combo)
npm run bake-tides2                       # rewrites data/tides2.jsonc + the doc
npm run seed-tide-relationships --force   # re-seeds relationships, then re-curate
npm run setup-assets                      # copies both to public/

# tides3 (the tide pools are baked into the same file, so no separate re-seed)
npm run bake-tides3           # rewrites data/tides3.jsonc + the rendered doc
npm run setup-assets          # copies it to public/

# tides4 (the tide pools are baked into the same file, so no separate re-seed)
npm run bake-tides4           # rewrites data/tides4.jsonc + the rendered doc
npm run setup-assets          # copies it to public/
```

## 7. How they differ in practice

`tides` is the human-legible counterpart of `idf3`: a favored tide plus random
tides reproduces idf3's broad, archetype-mixed distribution. `tides2` trades that
breadth for concentration — smaller, purer tides combined by affinity — to
produce pools that better support the build-around payoffs they contain. `tides3`
mirrors a different generator entirely, `sigseed`: its signature tides are baked
from a Dreamcaller's signature through the pick-affinity corpus, so a pool stays
on the Dreamcaller's own identity rather than reproducing idf3's archetype mix
(see section 4 for the full story and its measured similarity to `sigseed`).
`tides4` mirrors `sigseed` too, but targets its run-to-run *variety* rather than
its centre: it keeps a Dreamcaller's signature tide as a fixed core and leans it a
different way each run with a random subset of small *facet* tides. So it matches
`sigseed` on the dreamcaller metric while varying its pools *on-theme*, at roughly
`sigseed`'s own self-diversity — where `tides3`'s run-to-run variety, though
larger, is off-theme churn from its broad-tide splash (see section 5).

Measured over a 200-seed real-draft simulation (every Dreamcaller, full
signatures; idf3 reference in parentheses), `tides2` improves on `tides` and
`idf3` across the pool-quality metrics:

| Metric | `tides` | `tides2` | `idf3` |
| --- | --- | --- | --- |
| Expected traps per pool | 2.57 | **0.47** | 2.49 |
| Build-around adequacy | 92.9 | **94.0** | 92.9 |
| Diversity headline | 89.2 | **94.6** | 94.4 |
| Survivors buildable rate | 3% | 16% | 16% |

Because `tides2` concentrates each pool on a coherent archetype, its per-card
**frequency similarity to idf3** is lower than `tides`' (it is a stronger
generator, not an idf3 mimic). Run the comparisons with:

```bash
npm run pool-metrics -- --variant tides2 --seeds 200 --metric traps
npm run pool-metrics -- --variant tides2 --seeds 200            # adequacy
npm run pool-metrics -- --variant tides2 --seeds 100 --metric diversity
npm run tides-similarity   -- --a tides2 --b idf3 --seeds 100
```

**Validation independence.** The `tides2` seeder used
`data/buildaround_support.json` once to repair ally lists, so the adequacy and
trap metrics — which score against that same metadata — are not fully independent
validation of `tides2`. The similarity metric and the card-utilization half of
the diversity metric do not read that metadata and remain independent.

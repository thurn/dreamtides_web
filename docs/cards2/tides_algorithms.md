# Tides, tides2, and tides3 draft-pool algorithms

Three draft-pool algorithms build a Dreamcaller's draft pool by combining a small
number of preconstructed decks called **tides**. All three are selectable with
the `?algo=` URL parameter (`?algo=tides`, `?algo=tides2`, `?algo=tides3`) and
exist side by side so they can be compared directly:

| | `tides` | `tides2` | `tides3` |
| --- | --- | --- | --- |
| Mirrors | `idf3` | `idf3`, sharpened | `sigseed` |
| Pool size | 200 | 200 | 150 |
| Tide decks | `data/tides.jsonc` (32, ~160 copies each) | `data/tides2.jsonc` (32, ~70 copies each) | `data/tides3.jsonc` (32: 20 signature ~150, 12 neutral ~30) |
| Relationships | none | `data/tides2_relationships.jsonc` | baked into the same file |
| Lead tide | one of the Dreamcaller's *favored* tides | drawn from the Dreamcaller's curated *tide pool* | the Dreamcaller's own *signature tide* (a broad tide for a neutral) |
| Fill tides | drawn uniformly at random | the lead's curated *allied tides* | the nearest *broad* tides |
| Bake | `npm run bake-tides` | `npm run bake-tides2` + `npm run seed-tide-relationships` | `npm run bake-tides3` |
| Runtime module | `src/draft/pool/variant-tides.ts` | `src/draft/pool/variant-tides2.ts` | `src/draft/pool/variant-tides3.ts` |
| Rendered decklists | `docs/cards2/tide_decklists.md` | `docs/cards2/tides2_decklists.md` | `docs/cards2/tides3_decklists.md` |

Each algorithm has two halves: an **offline construction** step that bakes the
committed tide lists from real draft data, and a **runtime** step that combines
those lists into one pool. This document covers both halves for all three. The
first three sections describe the shared decklist-corpus foundation and the two
algorithms built on it (`tides`, `tides2`); section 4 covers `tides3`, which
rests on a different foundation — the pick-affinity corpus `sigseed` grows from —
and is best read on its own.

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
fringe singletons.) Neutral tides do double duty: they are the generic tail mixed
into a signatured pool, and they are the body of a neutral Dreamcaller's pool.

### 4.3 The per-Dreamcaller tide pools

`tides2` keeps its relationships in a separate, hand-curated file; `tides3` keeps
its per-Dreamcaller pools in the **same baked artifact** as the decks, because they
are derived, not curated. For every Dreamcaller the bake writes an ordered list of
tide ids: the first is the **lead**, always joined; the rest are **fill**, joined
in shuffled order until the pool is full.

A **signatured** Dreamcaller leads with its own signature tide and fills from the
nearest broad tides, ranked by cosine similarity between the tides' card lists. The
choice of *broad* tides for fill, rather than other Dreamcallers' signature tides,
is deliberate and was settled by measurement. An allied signature tide would carry
a second Dreamcaller's identity into the pool, and mixing it in measurably pulls
the pool toward that second theme and drops the home Dreamcaller's theme share — it
hurts exactly the metric `tides3` exists to match. A broad tide instead supplies
the generically-good cards that `sigseed`'s play-rate prior naturally pulls into
its pools — removal, card draw, efficient bodies — without importing a competing
identity. So the fill keeps the pool mono-theme, the way `sigseed` keeps it.

A **neutral** Dreamcaller leads with a broad tide and fills with a farthest-point
spread of *every* tide. The lead broad tide is rotated across the twelve neutral
Dreamcallers so each one has its own starting identity rather than all sharing one,
and the broad farthest-point fill lets a neutral pool range widely over the format
the way a uniform-seeded `pickcohere` pool does.

### 4.4 Building the pool at runtime

The runtime, in `src/draft/pool/variant-tides3.ts`, is short. It pins the pool to
**150 copies**, not the quest's usual 200, and ignores the size the quest asks
for — exactly as `sigseed` and `pickfit` ignore it. This is not an oversight: the
default variant `sigseed` itself ships 150-card pools, and several of the metrics
the two are compared on (trap counts especially) scale with pool size, so matching
the size is what lets `tides3` and `sigseed` line up at all.

Selection then proceeds in three steps. The **lead** tide — the Dreamcaller's own
signature tide, for a signatured Dreamcaller — is always joined first. The
**fill** tides are shuffled and joined one at a time until enough copies are
dealable, with the rule that at least one fill tide always joins. That minimum is
the point where the "combine decks" promise becomes literally true for every pool:
a signature tide is already a full 150-card `sigseed` pool, so the lead alone could
fill the deal, but the rule still mixes in one broad tide. Because the combined bag
is therefore larger than 150, dealing 150 from it leaves some cards out, and which
cards drop changes with the seed. That is where a signatured pool's run-to-run
variety comes from, and it stands in for the variety `sigseed` gets by drawing a
different random signature subset each run. Pleasingly, the broad fill also nudges
`tides3` *closer* to `sigseed` rather than away: the generic cards a neutral tide
contributes are the same kind of goodstuff `sigseed`'s prior pulls into its own
pools, so they overlap rather than conflict.

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

## 5. Artifacts, scripts, and served assets

| Artifact | Produced by | Served as (gitignored) | Read at runtime by |
| --- | --- | --- | --- |
| `data/tides.jsonc` | `npm run bake-tides` | `public/tides-data.json` | `tides` |
| `data/tides2.jsonc` | `npm run bake-tides2` | `public/tides2-data.json` | `tides2` |
| `data/tides2_relationships.jsonc` | `npm run seed-tide-relationships` | `public/tides2-relationships-data.json` | `tides2` |
| `data/tides3.jsonc` | `npm run bake-tides3` | `public/tides3-data.json` | `tides3` |

`scripts/setup-assets.mjs` copies each committed `.jsonc` (stripping comments) to
its served path. The browser fetches the served copies through loaders in
`src/data/cards-v2-database.ts` (`loadTideDecks`, `loadTides2Decks`,
`loadTides2Relationships`, `loadTides3Decks`); `src/data/quest-content.ts` fetches
them only for the variant that needs them. The metric harnesses
(`scripts/pool-metrics.mjs`,
`scripts/tides-similarity-experiment.mjs`) read the committed `.jsonc` files
directly. `tides3` is self-contained in one file — its decks and per-Dreamcaller
tide pools live together — so it needs no separate relationships artifact.

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
```

## 6. How they differ in practice

`tides` is the human-legible counterpart of `idf3`: a favored tide plus random
tides reproduces idf3's broad, archetype-mixed distribution. `tides2` trades that
breadth for concentration — smaller, purer tides combined by affinity — to
produce pools that better support the build-around payoffs they contain. `tides3`
mirrors a different generator entirely, `sigseed`: its signature tides are baked
from a Dreamcaller's signature through the pick-affinity corpus, so a pool stays
on the Dreamcaller's own identity rather than reproducing idf3's archetype mix
(see section 4 for the full story and its measured similarity to `sigseed`).

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
